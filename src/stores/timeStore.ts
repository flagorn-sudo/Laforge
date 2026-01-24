/**
 * Time Tracking Store
 * Manages time tracking sessions for projects
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TimeSession {
  id: string;
  projectId: string;
  startTime: string;
  endTime?: string;
  duration: number; // in seconds
  notes?: string;
}

export interface ProjectTimeStats {
  projectId: string;
  totalSeconds: number;
  sessionsCount: number;
  lastSessionDate?: string;
}

interface TimeState {
  // Active session
  activeSession: {
    projectId: string;
    startTime: string;
  } | null;

  // All sessions history
  sessions: TimeSession[];

  // Hourly rate for billing
  hourlyRate: number;

  // Actions
  startSession: (projectId: string) => void;
  stopSession: (notes?: string) => TimeSession | null;
  pauseSession: () => void;
  resumeSession: () => void;
  deleteSession: (sessionId: string) => void;
  setHourlyRate: (rate: number) => void;

  // Queries
  getActiveSession: () => { projectId: string; startTime: string } | null;
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

export const useTimeStore = create<TimeState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessions: [],
      hourlyRate: 75,

      startSession: (projectId: string) => {
        const state = get();

        // Stop any existing session first
        if (state.activeSession) {
          state.stopSession();
        }

        set({
          activeSession: {
            projectId,
            startTime: new Date().toISOString(),
          },
        });
      },

      stopSession: (notes?: string) => {
        const state = get();
        if (!state.activeSession) return null;

        const endTime = new Date();
        const startTime = new Date(state.activeSession.startTime);
        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

        const session: TimeSession = {
          id: generateId(),
          projectId: state.activeSession.projectId,
          startTime: state.activeSession.startTime,
          endTime: endTime.toISOString(),
          duration,
          notes,
        };

        set((state) => ({
          activeSession: null,
          sessions: [...state.sessions, session],
        }));

        return session;
      },

      pauseSession: () => {
        const state = get();
        if (!state.activeSession) return;

        // Stop current session but don't clear notes
        state.stopSession();
      },

      resumeSession: () => {
        const state = get();
        if (state.activeSession) return;

        // Get the last session and resume for same project
        const lastSession = state.sessions[state.sessions.length - 1];
        if (lastSession) {
          state.startSession(lastSession.projectId);
        }
      },

      deleteSession: (sessionId: string) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
        }));
      },

      setHourlyRate: (rate: number) => {
        set({ hourlyRate: rate });
      },

      getActiveSession: () => {
        return get().activeSession;
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

        // Add active session time if applicable
        const activeSession = get().activeSession;
        let activeTime = 0;
        if (activeSession && (!projectId || activeSession.projectId === projectId)) {
          const startTime = new Date(activeSession.startTime);
          if (startTime.getTime() >= startOfDay) {
            activeTime = Math.floor((Date.now() - startTime.getTime()) / 1000);
          }
        }

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

        // Add active session time if applicable
        const activeSession = get().activeSession;
        let activeTime = 0;
        if (activeSession && (!projectId || activeSession.projectId === projectId)) {
          activeTime = Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
        }

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

        // Add active session time if applicable
        const activeSession = get().activeSession;
        let activeTime = 0;
        if (activeSession && (!projectId || activeSession.projectId === projectId)) {
          activeTime = Math.floor((Date.now() - new Date(activeSession.startTime).getTime()) / 1000);
        }

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
        activeSession: state.activeSession,
      }),
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
