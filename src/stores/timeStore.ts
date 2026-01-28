/**
 * Time Tracking Store
 * Manages time tracking sessions for projects
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectBilling, BillingUnit } from '../types';

export interface TimeSession {
  id: string;
  projectId: string;
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  notes?: string;
}

export interface ActiveSession {
  id: string;
  projectId: string;
  startTime: string;
  isPaused: boolean;
  pausedAt?: string;        // When pause started
  accumulatedTime: number;  // Time accumulated before pause (in seconds)
}

export interface ProjectTimeStats {
  projectId: string;
  totalSeconds: number;
  sessionsCount: number;
  lastSessionDate?: string;
}

interface TimeState {
  // Multiple active sessions (one per project)
  activeSessions: ActiveSession[];

  // All sessions history
  sessions: TimeSession[];

  // Hourly rate for billing
  hourlyRate: number;

  // Actions
  startSession: (projectId: string) => void;
  stopSession: (projectId: string, notes?: string) => TimeSession | null;
  pauseSession: (projectId: string) => void;
  resumeSession: (projectId: string) => void;
  deleteSession: (sessionId: string) => void;
  addManualSession: (projectId: string, hours: number, minutes: number, notes?: string) => TimeSession;
  setHourlyRate: (rate: number) => void;

  // Queries
  getActiveSession: (projectId: string) => ActiveSession | null;
  getActiveSessionsCount: () => number;
  getSessionsForProject: (projectId: string) => TimeSession[];
  getProjectStats: (projectId: string) => ProjectTimeStats;
  getTodayTotal: (projectId?: string) => number;
  getWeekTotal: (projectId?: string) => number;
  getMonthTotal: (projectId?: string) => number;
  getAllProjectsStats: () => ProjectTimeStats[];
}

// Generate unique ID
const generateId = () => `time_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Get start of day
const getStartOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get start of week (Monday)
const getStartOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Get start of month
const getStartOfMonth = (date: Date): Date => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Validate and clean session data
function validateSessions(sessions: TimeSession[]): TimeSession[] {
  return sessions.filter((session) => {
    // Check required fields
    if (!session.id || !session.projectId || !session.startTime) {
      console.warn('[timeStore] Removing invalid session (missing fields):', session);
      return false;
    }
    // Check duration is reasonable (max 24 hours = 86400 seconds per session)
    if (session.duration < 0 || session.duration > 86400) {
      console.warn('[timeStore] Removing session with invalid duration:', session);
      return false;
    }
    return true;
  });
}

export const useTimeStore = create<TimeState>()(
  persist(
    (set, get) => ({
      activeSessions: [],
      sessions: [],
      hourlyRate: 75,

      startSession: (projectId: string) => {
        const state = get();

        // Check if this project already has an active session
        const existingSession = state.activeSessions.find(s => s.projectId === projectId);
        if (existingSession) {
          // If paused, resume it instead
          if (existingSession.isPaused) {
            state.resumeSession(projectId);
          }
          return;
        }

        // Create new active session for this project
        const newSession: ActiveSession = {
          id: generateId(),
          projectId,
          startTime: new Date().toISOString(),
          isPaused: false,
          accumulatedTime: 0,
        };

        set({
          activeSessions: [...state.activeSessions, newSession],
        });
      },

      stopSession: (projectId: string, notes?: string) => {
        const state = get();
        const activeSession = state.activeSessions.find(s => s.projectId === projectId);
        if (!activeSession) return null;

        const endTime = new Date();
        let duration: number;

        if (activeSession.isPaused && activeSession.pausedAt) {
          // Session was paused - use accumulated time
          duration = activeSession.accumulatedTime;
        } else {
          // Session was running - calculate total time
          const startTime = new Date(activeSession.startTime);
          const runningTime = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
          duration = activeSession.accumulatedTime + runningTime;
        }

        const session: TimeSession = {
          id: generateId(),
          projectId: activeSession.projectId,
          startTime: activeSession.startTime,
          endTime: endTime.toISOString(),
          duration,
          notes,
        };

        set((state) => ({
          activeSessions: state.activeSessions.filter(s => s.projectId !== projectId),
          sessions: [...state.sessions, session],
        }));

        return session;
      },

      pauseSession: (projectId: string) => {
        const state = get();
        const activeSession = state.activeSessions.find(s => s.projectId === projectId);
        if (!activeSession || activeSession.isPaused) return;

        const now = new Date();
        const startTime = new Date(activeSession.startTime);
        const currentRunningTime = Math.floor((now.getTime() - startTime.getTime()) / 1000);

        set({
          activeSessions: state.activeSessions.map(s =>
            s.projectId === projectId
              ? {
                  ...s,
                  isPaused: true,
                  pausedAt: now.toISOString(),
                  accumulatedTime: s.accumulatedTime + currentRunningTime,
                  startTime: now.toISOString(), // Reset for next resume
                }
              : s
          ),
        });
      },

      resumeSession: (projectId: string) => {
        const state = get();
        const activeSession = state.activeSessions.find(s => s.projectId === projectId);
        if (!activeSession || !activeSession.isPaused) return;

        set({
          activeSessions: state.activeSessions.map(s =>
            s.projectId === projectId
              ? {
                  ...s,
                  isPaused: false,
                  pausedAt: undefined,
                  startTime: new Date().toISOString(), // New start time for running period
                }
              : s
          ),
        });
      },

      deleteSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
        }));
      },

      addManualSession: (projectId: string, hours: number, minutes: number, notes?: string) => {
        const duration = (hours * 3600) + (minutes * 60);
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - duration * 1000);

        const session: TimeSession = {
          id: generateId(),
          projectId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration,
          notes: notes || 'Ajout manuel',
        };

        set((state) => ({
          sessions: [...state.sessions, session],
        }));

        return session;
      },

      setHourlyRate: (rate: number) => {
        set({ hourlyRate: rate });
      },

      getActiveSession: (projectId: string) => {
        return get().activeSessions.find(s => s.projectId === projectId) || null;
      },

      getActiveSessionsCount: () => {
        return get().activeSessions.length;
      },

      getSessionsForProject: (projectId: string) => {
        return get().sessions.filter((s) => s.projectId === projectId);
      },

      getProjectStats: (projectId: string) => {
        const sessions = get().sessions.filter((s) => s.projectId === projectId);
        const totalSeconds = sessions.reduce((sum, s) => sum + s.duration, 0);
        const lastSession = sessions[sessions.length - 1];

        return {
          projectId,
          totalSeconds,
          sessionsCount: sessions.length,
          lastSessionDate: lastSession?.endTime || lastSession?.startTime,
        };
      },

      getTodayTotal: (projectId?: string) => {
        const startOfDay = getStartOfDay(new Date()).getTime();
        let sessions = get().sessions.filter(
          (s) => new Date(s.startTime).getTime() >= startOfDay
        );

        if (projectId) {
          sessions = sessions.filter((s) => s.projectId === projectId);
        }

        // Add active sessions time
        const activeSessions = get().activeSessions;
        let activeTime = 0;
        activeSessions.forEach(activeSession => {
          if (!projectId || activeSession.projectId === projectId) {
            // Add accumulated time
            activeTime += activeSession.accumulatedTime;
            // Add running time if not paused
            if (!activeSession.isPaused) {
              const startTime = new Date(activeSession.startTime);
              if (startTime.getTime() >= startOfDay) {
                activeTime += Math.floor((Date.now() - startTime.getTime()) / 1000);
              }
            }
          }
        });

        return sessions.reduce((sum, s) => sum + s.duration, 0) + activeTime;
      },

      getWeekTotal: (projectId?: string) => {
        const startOfWeek = getStartOfWeek(new Date()).getTime();
        let sessions = get().sessions.filter(
          (s) => new Date(s.startTime).getTime() >= startOfWeek
        );

        if (projectId) {
          sessions = sessions.filter((s) => s.projectId === projectId);
        }

        // Add active sessions time
        const activeSessions = get().activeSessions;
        let activeTime = 0;
        activeSessions.forEach(activeSession => {
          if (!projectId || activeSession.projectId === projectId) {
            activeTime += activeSession.accumulatedTime;
            if (!activeSession.isPaused) {
              activeTime += Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
            }
          }
        });

        return sessions.reduce((sum, s) => sum + s.duration, 0) + activeTime;
      },

      getMonthTotal: (projectId?: string) => {
        const startOfMonth = getStartOfMonth(new Date()).getTime();
        let sessions = get().sessions.filter(
          (s) => new Date(s.startTime).getTime() >= startOfMonth
        );

        if (projectId) {
          sessions = sessions.filter((s) => s.projectId === projectId);
        }

        // Add active sessions time
        const activeSessions = get().activeSessions;
        let activeTime = 0;
        activeSessions.forEach(activeSession => {
          if (!projectId || activeSession.projectId === projectId) {
            activeTime += activeSession.accumulatedTime;
            if (!activeSession.isPaused) {
              activeTime += Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
            }
          }
        });

        return sessions.reduce((sum, s) => sum + s.duration, 0) + activeTime;
      },

      getAllProjectsStats: () => {
        const sessions = get().sessions;
        const projectIds = [...new Set(sessions.map((s) => s.projectId))];

        return projectIds.map((projectId) => get().getProjectStats(projectId));
      },
    }),
    {
      name: 'forge-time-tracking',
      partialize: (state) => ({
        sessions: state.sessions,
        hourlyRate: state.hourlyRate,
        activeSessions: state.activeSessions,
      }),
      // Validate and clean data on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          const validatedSessions = validateSessions(state.sessions || []);
          if (validatedSessions.length !== (state.sessions || []).length) {
            console.log('[timeStore] Cleaned', (state.sessions || []).length - validatedSessions.length, 'invalid sessions');
            state.sessions = validatedSessions;
          }
          // Migrate old activeSession to new activeSessions format
          if ((state as any).activeSession && !state.activeSessions) {
            const oldSession = (state as any).activeSession;
            state.activeSessions = [{
              id: generateId(),
              projectId: oldSession.projectId,
              startTime: oldSession.startTime,
              isPaused: false,
              accumulatedTime: 0,
            }];
            delete (state as any).activeSession;
          }
          // Ensure activeSessions is always an array
          if (!state.activeSessions) {
            state.activeSessions = [];
          }
        }
      },
    }
  )
);

// Helper functions
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function calculateBillable(seconds: number, hourlyRate: number): number {
  return (seconds / 3600) * hourlyRate;
}

/**
 * Calculate billable amount for a project with specific billing settings
 *
 * IMPORTANT: Le taux (rate) est le MONTANT PAR UNITÉ, pas un taux horaire à multiplier.
 * - Si rate = 450€/jour → 8h de travail = 450€ (pas 450*8)
 * - Si rate = 60€/heure → 1h de travail = 60€
 * - Le calcul est proportionnel: 4h sur un taux de 450€/jour = 225€
 *
 * @param seconds - Total seconds worked
 * @param projectBilling - Project-specific billing settings (optional)
 * @param globalRate - Global rate as fallback (interpreted based on globalUnit)
 * @param globalUnit - Global billing unit (default: 'hour')
 * @returns Object with billable amount, billed units, and unit label
 */
export function calculateBillableForProject(
  seconds: number,
  projectBilling: ProjectBilling | undefined,
  globalRate: number,
  globalUnit: BillingUnit = 'hour'
): {
  amount: number;
  billedUnits: number;
  unitLabel: string;
  billingUnit: BillingUnit;
} {
  // Determine effective rate and unit (project overrides global)
  const rate = projectBilling?.hourlyRate ?? globalRate;
  const billingUnit = projectBilling?.billingUnit ?? globalUnit;
  const minimumMinutes = projectBilling?.minimumBillableMinutes ?? 0;

  // If no time tracked, return zeros (don't apply minimum)
  if (seconds === 0) {
    let unitLabel: string;
    switch (billingUnit) {
      case 'minute': unitLabel = 'minutes'; break;
      case 'hour': unitLabel = 'heures'; break;
      case 'half_day': unitLabel = 'demi-journées'; break;
      case 'day': unitLabel = 'journées'; break;
      default: unitLabel = 'heures';
    }
    return { amount: 0, billedUnits: 0, unitLabel, billingUnit };
  }

  // Apply minimum billable time only if we have tracked time
  const effectiveSeconds = Math.max(seconds, minimumMinutes * 60);

  // Seconds per unit for proportional calculation
  const secondsPerUnit: Record<BillingUnit, number> = {
    minute: 60,
    hour: 3600,
    half_day: 14400,  // 4 hours
    day: 28800,       // 8 hours
  };

  const unitSeconds = secondsPerUnit[billingUnit] || 3600;

  // Calculate proportional units (decimal, e.g., 0.56 days)
  const fractionOfUnit = effectiveSeconds / unitSeconds;

  // Amount = fraction of unit × rate per unit
  // Ex: 4h on 450€/day rate = (4*3600 / 28800) * 450 = 0.5 * 450 = 225€
  const amount = fractionOfUnit * rate;

  // Billed units for display (rounded to 2 decimals)
  const billedUnits = Math.round(fractionOfUnit * 100) / 100;

  // Unit label
  let unitLabel: string;
  switch (billingUnit) {
    case 'minute':
      unitLabel = billedUnits === 1 ? 'minute' : 'minutes';
      break;
    case 'hour':
      unitLabel = billedUnits === 1 ? 'heure' : 'heures';
      break;
    case 'half_day':
      unitLabel = billedUnits === 1 ? 'demi-journée' : 'demi-journées';
      break;
    case 'day':
      unitLabel = billedUnits === 1 ? 'journée' : 'journées';
      break;
    default:
      unitLabel = 'heures';
  }

  return {
    amount,
    billedUnits,
    unitLabel,
    billingUnit,
  };
}
