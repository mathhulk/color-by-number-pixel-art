import { Field as BaseField } from "@base-ui/react/field";
import { Fieldset as BaseFieldset } from "@base-ui/react/fieldset";
import { Input } from "@base-ui/react/input";
import { Progress } from "@base-ui/react/progress";
import { Slider as BaseSlider } from "@base-ui/react/slider";
import { Switch } from "@base-ui/react/switch";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { type ComponentProps, type ReactNode, useId } from "react";

import { cx } from "./cx";

import styles from "./Field.module.css";

/* ------------------------------------------------------------------------- */

export interface SliderFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  description?: ReactNode;
  /** Formats the visible value and the screen reader value text. */
  format?: (value: number) => string;
  disabled?: boolean;
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  description,
  format = String,
  disabled,
}: SliderFieldProps) {
  return (
    <BaseSlider.Root
      className={styles.field}
      value={value}
      onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? min) : v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled ?? false}
    >
      <div className={styles.row}>
        <BaseSlider.Label className={styles.label}>{label}</BaseSlider.Label>
        <span className={styles.value} aria-hidden="true">
          {format(value)}
        </span>
      </div>
      <BaseSlider.Control className={styles.sliderControl}>
        <BaseSlider.Track className={styles.sliderTrack}>
          <BaseSlider.Indicator className={styles.sliderIndicator} />
          <BaseSlider.Thumb className={styles.sliderThumb} getAriaValueText={(_, v) => format(v)} />
        </BaseSlider.Track>
      </BaseSlider.Control>
      {description ? <p className={styles.description}>{description}</p> : null}
    </BaseSlider.Root>
  );
}

/* ------------------------------------------------------------------------- */

export interface SwitchFieldProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchField({ label, description, checked, onChange, disabled }: SwitchFieldProps) {
  const descriptionId = useId();
  return (
    <label className={styles.switchRow}>
      <span className={styles.switchText}>
        <span className={styles.label}>{label}</span>
        {description ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </span>
      <Switch.Root
        className={styles.switch}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled ?? false}
        aria-describedby={description ? descriptionId : undefined}
      >
        <Switch.Thumb className={styles.switchThumb} />
      </Switch.Root>
    </label>
  );
}

/* ------------------------------------------------------------------------- */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Hide the text label visually (it is still the accessible name). */
  iconOnly?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentOption<T>>;
  className?: string;
  /** Show the label above the control. */
  showLabel?: boolean;
}

/** Single-choice toggle group (arrow keys move between options). */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  showLabel = false,
}: SegmentedControlProps<T>) {
  const labelId = useId();
  const group = (
    <ToggleGroup
      className={cx(styles.segmented, className)}
      value={[value]}
      onValueChange={(next) => {
        const v = next[0];
        if (v) onChange(v);
      }}
      {...(showLabel ? { "aria-labelledby": labelId } : { "aria-label": label })}
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          className={styles.segment}
          aria-label={o.iconOnly ? o.label : undefined}
        >
          {o.icon}
          {o.iconOnly ? null : o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
  if (!showLabel) return group;
  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      {group}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

export interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  className?: string;
}

export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  return (
    <Progress.Root value={max ? (value / max) * 100 : 0} aria-label={label} className={className}>
      <Progress.Track className={styles.progressTrack}>
        <Progress.Indicator className={styles.progressIndicator} />
      </Progress.Track>
    </Progress.Root>
  );
}

/* ------------------------------------------------------------------------- */

export interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  label: string;
  className?: string;
}

/** Tab list used as a view switcher (panels are rendered by the caller). */
export function TabList<T extends string>({
  value,
  onChange,
  tabs,
  label,
  className,
}: TabsProps<T>) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <BaseTabs.List className={cx(styles.tabsList, className)} aria-label={label}>
        {tabs.map((t) => (
          <BaseTabs.Tab key={t.value} value={t.value} className={styles.tab}>
            {t.icon}
            {t.label}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className={styles.tabIndicator} />
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}

/* ------------------------------------------------------------------------- */

export interface TextFieldProps extends Omit<
  ComponentProps<typeof Input>,
  "className" | "onChange" | "value"
> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: ReactNode;
  hideLabel?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  description,
  hideLabel,
  ...props
}: TextFieldProps) {
  return (
    <BaseField.Root className={styles.field}>
      <BaseField.Label className={cx(styles.label, hideLabel && "visually-hidden")}>
        {label}
      </BaseField.Label>
      <Input {...props} className={styles.input} value={value} onValueChange={(v) => onChange(v)} />
      {description ? (
        <BaseField.Description className={styles.description}>{description}</BaseField.Description>
      ) : null}
    </BaseField.Root>
  );
}

/* ------------------------------------------------------------------------- */

export function Fieldset({
  legend,
  children,
  className,
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseFieldset.Root className={cx(styles.fieldset, className)}>
      <BaseFieldset.Legend className={styles.legend}>{legend}</BaseFieldset.Legend>
      {children}
    </BaseFieldset.Root>
  );
}
