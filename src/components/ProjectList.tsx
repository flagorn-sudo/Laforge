import { FolderPlus, Loader } from 'lucide-react';
import { Project } from '../types';
import { ProjectCard } from './ProjectCard';
import { Button } from './ui';

interface ProjectListProps {
  projects: Project[];
  loading: boolean;
  onSelect: (project: Project) => void;
  onNewProject: () => void;
  onSync?: (project: Project) => Promise<void>;
}

export function ProjectList({ projects, loading, onSelect, onNewProject, onSync }: ProjectListProps) {
  if (loading) {
    return (
      <div className="loading">
        <Loader className="spinner" size={32} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Projets</h1>
        <Button onClick={onNewProject}>
          <FolderPlus size={18} />
          Nouveau projet
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <FolderPlus size={48} />
          <h3>Aucun projet</h3>
          <p>Créez votre premier projet ou configurez le dossier de travail dans les paramètres.</p>
          <Button onClick={onNewProject}>Créer un projet</Button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onSelect(project)}
              onSync={onSync}
            />
          ))}
        </div>
      )}
    </div>
  );
}
