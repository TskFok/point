import type { ReactNode } from "react";

type AdminPageHeadingStatProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
};

export function AdminPageHeadingStat({
  icon,
  label,
  value,
}: AdminPageHeadingStatProps) {
  return (
    <div className="page-heading__stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
