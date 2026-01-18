import { ProjectForm, ProjectFormData } from './ProjectForm';

interface CreateProjectProps {
  workspacePath: string;
  onCreate: (data: ProjectFormData) => Promise<void>;
  onClose: () => void;
}

export function CreateProject({
  workspacePath,
  onCreate,
  onClose,
}: CreateProjectProps) {
  return (
    <ProjectForm
      mode="create"
      workspacePath={workspacePath}
      onSave={onCreate}
      onClose={onClose}
    />
  );
}
