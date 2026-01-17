interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <label className={`switch-container ${disabled ? 'disabled' : ''}`}>
      {label && <span className="switch-label">{label}</span>}
      <div
        className={`switch ${checked ? 'checked' : ''}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <div className="switch-thumb" />
      </div>
    </label>
  );
}
