/**
 * Hook for managing async operation states (loading, error, data)
 */

import { useState, useCallback, useRef } from 'react';
import { getErrorMessage } from '../lib/errors';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseAsyncResult<T, Args extends unknown[]> extends AsyncState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
  setData: (data: T | null) => void;
}

/**
 * Generic hook for handling async operations with loading and error states
 *
 * @param asyncFn - The async function to execute
 * @param options - Optional configuration
 * @returns State and control functions
 *
 * @example
 * const { data, loading, error, execute } = useAsync(
 *   async (id: string) => await fetchProject(id)
 * );
 *
 * // Then in your component:
 * useEffect(() => { execute(projectId); }, [projectId]);
 */
export function useAsync<T, Args extends unknown[] = []>(
  asyncFn: (...args: Args) => Promise<T>,
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    initialData?: T | null;
  } = {}
): UseAsyncResult<T, Args> {
  const [state, setState] = useState<AsyncState<T>>({
    data: options.initialData ?? null,
    loading: false,
    error: null,
  });

  // Track the latest execution to handle race conditions
  const executionRef = useRef(0);

  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      const currentExecution = ++executionRef.current;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
      }));

      try {
        const data = await asyncFn(...args);

        // Only update if this is still the latest execution
        if (currentExecution === executionRef.current) {
          setState({
            data,
            loading: false,
            error: null,
          });
          options.onSuccess?.(data);
        }

        return data;
      } catch (err) {
        const errorMessage = getErrorMessage(err);

        // Only update if this is still the latest execution
        if (currentExecution === executionRef.current) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: errorMessage,
          }));
          options.onError?.(errorMessage);
        }

        return null;
      }
    },
    [asyncFn, options.onSuccess, options.onError]
  );

  const reset = useCallback(() => {
    executionRef.current++;
    setState({
      data: options.initialData ?? null,
      loading: false,
      error: null,
    });
  }, [options.initialData]);

  const setData = useCallback((data: T | null) => {
    setState((prev) => ({
      ...prev,
      data,
    }));
  }, []);

  return {
    ...state,
    execute,
    reset,
    setData,
  };
}

/**
 * Hook for managing multiple async states
 */
export function useAsyncStates<T extends Record<string, unknown>>() {
  const [loading, setLoading] = useState<Partial<Record<keyof T, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof T, string | null>>>({});

  const startLoading = useCallback(<K extends keyof T>(key: K) => {
    setLoading((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  const stopLoading = useCallback(<K extends keyof T>(key: K, error?: string) => {
    setLoading((prev) => ({ ...prev, [key]: false }));
    if (error) {
      setErrors((prev) => ({ ...prev, [key]: error }));
    }
  }, []);

  const isLoading = useCallback(
    <K extends keyof T>(key: K) => loading[key] ?? false,
    [loading]
  );

  const getError = useCallback(
    <K extends keyof T>(key: K) => errors[key] ?? null,
    [errors]
  );

  const clearError = useCallback(<K extends keyof T>(key: K) => {
    setErrors((prev) => ({ ...prev, [key]: null }));
  }, []);

  return {
    loading,
    errors,
    startLoading,
    stopLoading,
    isLoading,
    getError,
    clearError,
  };
}
