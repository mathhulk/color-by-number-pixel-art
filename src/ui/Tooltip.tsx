import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

import styles from "./Tooltip.module.css";

export interface TooltipProps {
  content: ReactNode;
  shortcut?: string | undefined;
  /** The trigger element (rendered in place of the default button). */
  render: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * Hover/focus tooltip. It supplements but never replaces an accessible name —
 * the trigger must be labelled on its own.
 */
export function Tooltip({ content, shortcut, render, side = "bottom" }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={render} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={8} collisionPadding={8}>
          <BaseTooltip.Popup className={styles.popup}>
            {content}
            {shortcut ? <kbd className={styles.kbd}>{shortcut}</kbd> : null}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

export const TooltipProvider = BaseTooltip.Provider;
