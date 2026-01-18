import { Input } from '../../../components/ui';

interface GeneralSectionProps {
  name: string;
  client?: string;
  onNameChange: (name: string) => void;
  onClientChange: (client: string) => void;
  isEditMode: boolean;
}

export function GeneralSection({
  name,
  client,
  onNameChange,
  onClientChange,
  isEditMode,
}: GeneralSectionProps) {
  return (
    <div className="form-section">
      <div className="form-section-title">Général</div>
      <Input
        label="Nom du projet *"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="mon-projet"
        autoFocus
        disabled={isEditMode}
        hint={
          isEditMode
            ? 'Le nom ne peut pas être modifié'
            : 'Sera utilisé comme nom du dossier'
        }
      />
      <Input
        label="Client"
        value={client || ''}
        onChange={(e) => onClientChange(e.target.value)}
        placeholder="Nom du client"
      />
    </div>
  );
}
