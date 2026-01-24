/**
 * Hook for computing seconds remaining until next retry attempt
 * Updates every second when a retry countdown is active
 */

import { useState, useEffect } from 'react';

/**
 * Calculate seconds remaining until a given timestamp
 * @param nextRetryAt - Timestamp (in ms) when the next retry will occur, or null if no retry pending
 * @returns Number of seconds remaining (0 if expired or no retry pending)
 */
export function useRetryCountdown(nextRetryAt: number | null): number {
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (nextRetryAt === null) {
      setSecondsRemaining(0);
      return;
    }

    // Calculate initial value
    const calculateRemaining = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((nextRetryAt - now) / 1000));
      return remaining;
    };

    setSecondsRemaining(calculateRemaining());

    // Update every 100ms for smooth countdown
    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setSecondsRemaining(remaining);

      // Clear interval when countdown reaches 0
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [nextRetryAt]);

  return secondsRemaining;
}
