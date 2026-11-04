import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";

import { cx } from "./cx";

import styles from "./Popup.module.css";

export type MenuEntry =
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: "separator" };

export interface MenuProps {
  /** Trigger element (e.g. an IconButton). */
  trigger: ReactElement;
  items: MenuEntry[];
  align?: "start" | "center" | "end";
}

/** Dropdown action menu with full keyboard support and typeahead. */
export function Menu({ trigger, items, align = "end" }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          className={styles.positioner}
          sideOffset={6}
          align={align}
          collisionPadding={8}
        >
          <BaseMenu.Popup className={styles.popup}>
            {items.map((item, i) =>
              item.type === "separator" ? (
                // oxlint-disable-next-line react/no-array-index-key -- separators have no identity
                <BaseMenu.Separator key={`sep-${i}`} className={styles.separator} />
              ) : (
                <BaseMenu.Item
                  key={item.label}
                  className={cx(styles.item, item.danger && styles.danger)}
                  onClick={item.onSelect}
                  disabled={item.disabled ?? false}
                >
                  {item.icon}
                  {item.label}
                </BaseMenu.Item>
              ),
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
