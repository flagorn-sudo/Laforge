import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useUIStore } from '../stores';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Notifications() {
  const { notifications, removeNotification } = useUIStore();

  if (notifications.length === 0) return null;

  return (
    <div className="notifications-container">
      {notifications.map((notification) => {
        const Icon = ICONS[notification.type];
        return (
          <div
            key={notification.id}
            className={`notification notification-${notification.type}`}
          >
            <Icon size={18} className="notification-icon" />
            <span className="notification-message">{notification.message}</span>
            <button
              className="notification-close"
              onClick={() => removeNotification(notification.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
