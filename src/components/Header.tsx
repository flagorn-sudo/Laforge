import { Settings } from 'lucide-react';

interface HeaderProps {
  title: string;
  onSettingsClick: () => void;
}

export function Header({ title, onSettingsClick }: HeaderProps) {
  return (
    <header className="app-header">
      <h1 className="header-title">{title}</h1>
      <button
        className="header-settings-btn"
        onClick={onSettingsClick}
        title="Paramètres"
      >
        <Settings size={20} />
      </button>
    </header>
  );
}
