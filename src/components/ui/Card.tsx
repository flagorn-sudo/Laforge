import { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div className={`detail-card ${className}`}>
      {title && <h3 className="detail-card-title">{title}</h3>}
      {children}
    </div>
  );
}
