import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function Card({ title, children, className = '', action }: CardProps) {
  return (
    <div className={`detail-card ${className}`}>
      {(title || action) && (
        <div className="detail-card-header">
          {title && <h3 className="detail-card-title">{title}</h3>}
          {action && <div className="detail-card-action">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
