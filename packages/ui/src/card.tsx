import type { HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "default" | "primary" | "reward";
};

export function Card({
  className = "",
  tone = "default",
  ...props
}: CardProps) {
  return (
    <div
      className={`pq-card pq-card--${tone} ${className}`.trim()}
      {...props}
    />
  );
}
