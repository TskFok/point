import type { ReactNode, Ref } from "react";

type AdminPageHeadingProps = {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
  headingRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
};

export function AdminPageHeading({
  kicker,
  title,
  description,
  children,
  headingRef,
  tabIndex,
}: AdminPageHeadingProps) {
  return (
    <div
      className="page-heading page-heading--split"
      ref={headingRef}
      tabIndex={tabIndex}
    >
      <div>
        <p className="page-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

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
