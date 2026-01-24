/**
 * Schedule Store
 * Manages automatic sync scheduling for projects
 */

import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SyncSchedule, ScheduleType, ScheduleResult, ScheduleEvent } from '../types';

interface ScheduleState {
  schedules: Record<string, SyncSchedule>; // keyed by project id
  loading: boolean;
  error: string | null;
  schedulerRunning: boolean;
}

interface ScheduleStore extends ScheduleState {
  // Actions
  startScheduler: () => Promise<void>;
  stopScheduler: () => Promise<void>;
  loadSchedules: () => Promise<void>;
  setSchedule: (schedule: SyncSchedule) => Promise<SyncSchedule>;
  removeSchedule: (projectId: string) => Promise<void>;
  getSchedule: (projectId: string) => SyncSchedule | undefined;
  setEnabled: (projectId: string, enabled: boolean) => Promise<void>;
  updateResult: (projectId: string, result: ScheduleResult) => Promise<void>;
  subscribeToScheduledSyncs: (callback: (event: ScheduleEvent) => void) => Promise<UnlistenFn>;
  clearError: () => void;
}

// Helper to generate cron expression from schedule type
export function generateCronExpression(
  type: ScheduleType,
  hour: number = 9,
  minute: number = 0,
  dayOfWeek: number = 1 // Monday
): string {
  switch (type) {
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${dayOfWeek}`;
    case 'monthly':
      return `${minute} ${hour} 1 * *`;
    case 'custom':
      return '';
    default:
      return `${minute} ${hour} * * *`;
  }
}

// Helper to parse cron to human readable
export function cronToHumanReadable(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Hourly
  if (hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Toutes les heures à :${minute.padStart(2, '0')}`;
  }

  // Daily
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Tous les jours à ${hour}:${minute.padStart(2, '0')}`;
  }

  // Weekly
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
    return `Chaque ${dayName} à ${hour}:${minute.padStart(2, '0')}`;
  }

  // Monthly
  if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
    return `Le ${dayOfMonth} de chaque mois à ${hour}:${minute.padStart(2, '0')}`;
  }

  return cron;
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  schedules: {},
  loading: false,
  error: null,
  schedulerRunning: false,

  startScheduler: async () => {
    try {
      await invoke('start_sync_scheduler');
      set({ schedulerRunning: true });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start scheduler',
      });
    }
  },

  stopScheduler: async () => {
    try {
      await invoke('stop_sync_scheduler');
      set({ schedulerRunning: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to stop scheduler',
      });
    }
  },

  loadSchedules: async () => {
    set({ loading: true, error: null });
    try {
      const schedules = await invoke<SyncSchedule[]>('get_all_sync_schedules');
      const schedulesMap: Record<string, SyncSchedule> = {};
      schedules.forEach((s) => {
        schedulesMap[s.project_id] = s;
      });
      set({ schedules: schedulesMap, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load schedules',
      });
    }
  },

  setSchedule: async (schedule: SyncSchedule) => {
    set({ loading: true, error: null });
    try {
      const updated = await invoke<SyncSchedule>('set_sync_schedule', { schedule });
      set((state) => ({
        schedules: {
          ...state.schedules,
          [updated.project_id]: updated,
        },
        loading: false,
      }));
      return updated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set schedule';
      set({ loading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  removeSchedule: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      await invoke('remove_sync_schedule', { projectId });
      set((state) => {
        const { [projectId]: removed, ...rest } = state.schedules;
        return { schedules: rest, loading: false };
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to remove schedule',
      });
    }
  },

  getSchedule: (projectId: string) => {
    return get().schedules[projectId];
  },

  setEnabled: async (projectId: string, enabled: boolean) => {
    try {
      await invoke('set_schedule_enabled', { projectId, enabled });
      set((state) => {
        const schedule = state.schedules[projectId];
        if (schedule) {
          return {
            schedules: {
              ...state.schedules,
              [projectId]: { ...schedule, enabled },
            },
          };
        }
        return state;
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update schedule',
      });
    }
  },

  updateResult: async (projectId: string, result: ScheduleResult) => {
    try {
      await invoke('update_schedule_result', { projectId, result });
      set((state) => {
        const schedule = state.schedules[projectId];
        if (schedule) {
          return {
            schedules: {
              ...state.schedules,
              [projectId]: { ...schedule, last_result: result },
            },
          };
        }
        return state;
      });
    } catch (error) {
      console.error('Failed to update schedule result:', error);
    }
  },

  subscribeToScheduledSyncs: async (callback: (event: ScheduleEvent) => void) => {
    return await listen<ScheduleEvent>('scheduled-sync', (event) => {
      callback(event.payload);
    });
  },

  clearError: () => set({ error: null }),
}));

// Export schedule type options for UI
export const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; label: string }[] = [
  { value: 'hourly', label: 'Toutes les heures' },
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'custom', label: 'Personnalisé' },
];

// Export day options for weekly schedule
export const DAY_OPTIONS = [
  { value: 0, label: 'Dimanche' },
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
];
