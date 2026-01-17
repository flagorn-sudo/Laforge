import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, className = '', ...props }, ref) => {
    return (
      <div className="form-field">
        {label && <label className="form-label">{label}</label>}
        <input ref={ref} className={`form-input ${className}`} {...props} />
        {hint && <p className="form-hint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
