import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import fieldStyles from "./Field.module.css";
import styles from "./Popup.module.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  description?: ReactNode;
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  description,
}: SelectFieldProps<T>) {
  const current = options.find((o) => o.value === value);
  return (
    <BaseSelect.Root
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
    >
      <div className={fieldStyles.field}>
        <BaseSelect.Label className={fieldStyles.label}>{label}</BaseSelect.Label>
        <BaseSelect.Trigger className={styles.trigger}>
          <BaseSelect.Value />
          <BaseSelect.Icon>
            <ChevronsUpDown aria-hidden="true" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
        {(description ?? current?.description) ? (
          <p className={fieldStyles.description}>{description ?? current?.description}</p>
        ) : null}
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} className={styles.item}>
                  <BaseSelect.ItemText className={styles.itemText}>{o.label}</BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className={styles.indicator}>
                    <Check aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
