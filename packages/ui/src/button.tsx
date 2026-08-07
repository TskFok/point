import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "md" | "sm";
  fullWidth?: boolean;
};

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  ...props
}: ButtonProps) {
  const classes = [
    "pq-button",
    `pq-button--${variant}`,
    size === "sm" ? "pq-button--sm" : "",
    fullWidth ? "pq-button--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} type={type} {...props} />;
}
