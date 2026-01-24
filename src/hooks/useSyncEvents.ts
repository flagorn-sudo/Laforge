/**
 * useSyncEvents Hook
 * Listens to Tauri sync-progress events and updates the sync store
 */

import { useEffect, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SyncProgressEvent } from '../types';
import { useSyncStore } from '../stores/syncStore';

export interface UseSyncEventsOptions {
  projectId: string;
  enabled?: boolean;
}

export interface UseSyncEventsResult {
  isListening: boolean;
}

export function useSyncEvents({
  projectId,
  enabled = true,
}: UseSyncEventsOptions): UseSyncEventsResult {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const isListeningRef = useRef(false);
  const { updateFromEvent } = useSyncStore();

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    let mounted = true;

    const setupListener = async () => {
      try {
        // Clean up any existing listener
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }

        // Set up new listener
        unlistenRef.current = await listen<SyncProgressEvent>(
          'sync-progress',
          (event) => {
            if (!mounted) return;

            const payload = event.payload;

            // Only process events for our project
            if (payload.project_id !== projectId) {
              return;
            }

            console.log('[useSyncEvents] Received event:', payload.event, payload);

            // Update the store with the event
            updateFromEvent(payload);
          }
        );

        isListeningRef.current = true;
        console.log('[useSyncEvents] Listening for sync-progress events for project:', projectId);
      } catch (error) {
        console.error('[useSyncEvents] Failed to set up listener:', error);
        isListeningRef.current = false;
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      isListeningRef.current = false;
    };
  }, [projectId, enabled, updateFromEvent]);

  return {
    isListening: isListeningRef.current,
  };
}
