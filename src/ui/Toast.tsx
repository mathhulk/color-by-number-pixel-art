import { Toast } from "@base-ui/react/toast";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { buttonClass, IconButton } from "./Button";

import styles from "./Toast.module.css";

/** A shared manager so non-React code (e.g. async saves) can show toasts too. */
export const toastManager = Toast.createToastManager();

export function toast(title: string, description?: string): void {
  toastManager.add(description === undefined ? { title } : { title, description });
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className={styles.toast}>
      <Toast.Content className={styles.text}>
        <Toast.Title className={styles.title} />
        <Toast.Description className={styles.description} />
      </Toast.Content>
      {t.actionProps ? (
        <Toast.Action className={buttonClass({ size: "sm", variant: "ghost" })} />
      ) : null}
      <Toast.Close render={<IconButton label="Dismiss" icon={<X />} size="sm" tooltip={false} />} />
    </Toast.Root>
  ));
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} timeout={3500} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className={styles.viewport}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
