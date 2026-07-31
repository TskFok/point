import type { ReactNode } from "react";

export type FormFieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  htmlFor: string;
  label: string;
};

export function FormField({
  children,
  error,
  hint,
  htmlFor,
  label,
}: FormFieldProps) {
  const descriptionId = error
    ? `${htmlFor}-error`
    : hint
      ? `${htmlFor}-hint`
      : undefined;

  return (
    <div className="pq-field">
      <label className="pq-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="pq-field__error" id={descriptionId}>
          {error}
        </p>
      ) : hint ? (
        <p className="pq-field__hint" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
