import { ProjectForm, ProjectFormData } from './ProjectForm';

interface CreateProjectProps {
  workspacePath: string;
  geminiApiKey?: string;
  onCreate: (data: ProjectFormData) => Promise<void>;
  onClose: () => void;
}

export function CreateProject({ workspacePath, geminiApiKey, onCreate, onClose }: CreateProjectProps) {
  return (
    <ProjectForm
      mode="create"
      workspacePath={workspacePath}
      geminiApiKey={geminiApiKey}
      onSave={onCreate}
      onClose={onClose}
    />
  );
}
