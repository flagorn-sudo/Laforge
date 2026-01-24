import { Home, Plus, Settings, RefreshCw } from 'lucide-react';
import hephaestusIcon from '../assets/hephaestus.svg';

interface MiniSidebarProps {
  onHome: () => void;
  onNewProject: () => void;
  onSettings: () => void;
  onRefresh: () => void;
  isHome: boolean;
}

export function MiniSidebar({
  onHome,
  onNewProject,
  onSettings,
  onRefresh,
  isHome,
}: MiniSidebarProps) {
  return (
    <aside className="mini-sidebar">
      <div className="mini-sidebar-logo">
        <img src={hephaestusIcon} alt="La Forge" />
      </div>

      <button
        className={`mini-sidebar-btn ${isHome ? 'active' : ''}`}
        onClick={onHome}
        title="Accueil"
      >
        <Home size={20} />
      </button>

      <button
        className="mini-sidebar-btn accent"
        onClick={onNewProject}
        title="Nouveau projet"
      >
        <Plus size={20} />
      </button>

      <button
        className="mini-sidebar-btn"
        onClick={onRefresh}
        title="Rafraîchir"
      >
        <RefreshCw size={20} />
      </button>

      <div className="mini-sidebar-spacer" />

      <button
        className="mini-sidebar-btn"
        onClick={onSettings}
        title="Paramètres"
      >
        <Settings size={20} />
      </button>
    </aside>
  );
}
