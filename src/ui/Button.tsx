import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactNode } from "react";

import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}

export function buttonClass({
  variant = "secondary",
  size = "md",
  block = false,
  icon = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: boolean;
  className?: string | undefined;
}): string {
  return cx(
    styles.button,
    styles[variant],
    size !== "md" && styles[size],
    block && styles.block,
    icon && styles.icon,
    className,
  );
}

/** Accessible button with consistent sizing (44px default hit target). */
export function Button({ variant, size, block, className, ...props }: ButtonProps) {
  return <BaseButton {...props} className={buttonClass({ variant, size, block, className })} />;
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "aria-label"> {
  /** Accessible name; also shown as a tooltip on hover/focus. */
  label: string;
  icon: ReactNode;
  /** Keyboard shortcut hint shown in the tooltip. */
  shortcut?: string;
  tooltip?: boolean;
}

/** Icon-only button. Always has an accessible label and a tooltip for pointer users. */
export function IconButton({
  label,
  icon,
  shortcut,
  tooltip = true,
  variant = "ghost",
  size,
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <BaseButton
      {...props}
      aria-label={label}
      className={buttonClass({ variant, size, icon: true, className })}
    >
      {icon}
    </BaseButton>
  );
  if (!tooltip) return button;
  return <Tooltip content={label} shortcut={shortcut} render={button} />;
}
