import { FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/api/dialog';
import { Button } from '../../../components/ui';

interface WorkspaceSectionProps {
  workspacePath: string;
  onWorkspacePathChange: (path: string) => void;
}

export function WorkspaceSection({
  workspacePath,
  onWorkspacePathChange,
}: WorkspaceSectionProps) {
  const handleSelectFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Sélectionner le dossier de travail',
    });
    if (selected && typeof selected === 'string') {
      onWorkspacePathChange(selected);
    }
  };

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Dossier par defaut</h3>
      <p className="settings-hint">
        Emplacement par defaut pour la creation de nouveaux projets.
        Les projets importes peuvent etre situes n'importe ou sur le disque.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <input
          className="form-input"
          value={workspacePath}
          onChange={(e) => onWorkspacePathChange(e.target.value)}
          placeholder="/Users/vous/Sites"
          style={{ flex: 1 }}
        />
        <Button variant="secondary" onClick={handleSelectFolder}>
          <FolderOpen size={16} />
        </Button>
      </div>
    </div>
  );
}
