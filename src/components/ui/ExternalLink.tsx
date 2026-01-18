import { open } from '@tauri-apps/api/shell';
import { ReactNode, MouseEvent } from 'react';

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ExternalLink({ href, children, className, style }: ExternalLinkProps) {
  const handleClick = async (e: MouseEvent) => {
    e.preventDefault();
    try {
      await open(href);
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </a>
  );
}
