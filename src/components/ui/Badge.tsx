interface BadgeProps {
  label: string;
  color: string;
}

export function Badge({ label, color }: BadgeProps) {
  return (
    <span
      className="status-badge"
      style={{
        background: `${color}20`,
        color: color,
      }}
    >
      {label}
    </span>
  );
}
