import { create } from 'zustand';

type ModalType = 'settings' | 'createProject' | 'editProject' | 'smartPaste' | 'about' | null;
type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface UIState {
  // Modal state
  activeModal: ModalType;
  modalData?: Record<string, unknown>;

  // Notifications
  notifications: Notification[];

  // Sidebar
  sidebarCollapsed: boolean;

  // Loading states
  globalLoading: boolean;
  loadingMessage?: string;

  // Actions - Modals
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  // Actions - Notifications
  addNotification: (
    type: NotificationType,
    message: string,
    duration?: number
  ) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Actions - Sidebar
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Actions - Loading
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

let notificationId = 0;

export const useUIStore = create<UIState>((set, get) => ({
  activeModal: null,
  modalData: undefined,
  notifications: [],
  sidebarCollapsed: false,
  globalLoading: false,
  loadingMessage: undefined,

  openModal: (modal, data) =>
    set({ activeModal: modal, modalData: data }),

  closeModal: () => set({ activeModal: null, modalData: undefined }),

  addNotification: (type, message, duration = 5000) => {
    const id = `notification-${++notificationId}`;
    const notification: Notification = { id, type, message, duration };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, duration);
    }
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setGlobalLoading: (loading, message) =>
    set({ globalLoading: loading, loadingMessage: message }),
}));
