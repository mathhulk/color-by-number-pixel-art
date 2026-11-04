import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button, IconButton } from "./Button";
import { cx } from "./cx";

import styles from "./Overlay.module.css";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  wide,
}: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Viewport className={styles.dialogViewport}>
          <BaseDialog.Popup className={cx(styles.dialog, wide && styles.wide)}>
            <div className={styles.header}>
              <div>
                <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
                {description ? (
                  <BaseDialog.Description className={styles.description}>
                    {description}
                  </BaseDialog.Description>
                ) : null}
              </div>
              <BaseDialog.Close
                render={<IconButton label="Close" icon={<X />} tooltip={false} />}
              />
            </div>
            {children ? <div className={styles.dialogBody}>{children}</div> : null}
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

/** Interrupting confirmation for destructive actions (uses the alertdialog role). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={styles.backdrop} />
        <AlertDialog.Viewport className={styles.dialogViewport}>
          <AlertDialog.Popup className={styles.dialog}>
            <div className={styles.header}>
              <div>
                <AlertDialog.Title className={styles.title}>{title}</AlertDialog.Title>
                <AlertDialog.Description className={styles.description}>
                  {description}
                </AlertDialog.Description>
              </div>
            </div>
            <div className={styles.actions}>
              <AlertDialog.Close render={<Button>Cancel</Button>} />
              <Button
                variant={danger ? "danger" : "primary"}
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
