import { Drawer } from "@base-ui/react/drawer";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { useMediaQuery } from "@/state/hooks";

import { IconButton } from "./Button";
import { cx } from "./cx";

import styles from "./Overlay.module.css";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Settings-style panel: a swipe-to-dismiss bottom sheet on phones and a side
 * panel on tablets and desktops.
 */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} swipeDirection={wide ? "right" : "down"}>
      <Drawer.Portal>
        <Drawer.Backdrop className={styles.backdrop} />
        <Drawer.Viewport className={cx(styles.sheetViewport, wide ? styles.right : styles.bottom)}>
          <Drawer.Popup className={styles.sheet}>
            {!wide && <div className={styles.handle} aria-hidden="true" />}
            <div className={styles.header}>
              <div>
                <Drawer.Title className={styles.title}>{title}</Drawer.Title>
                {description ? (
                  <Drawer.Description className={styles.description}>
                    {description}
                  </Drawer.Description>
                ) : null}
              </div>
              <Drawer.Close render={<IconButton label="Close" icon={<X />} tooltip={false} />} />
            </div>
            <Drawer.Content className={styles.sheetContent}>{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
