import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Monitor, Moon, Sun } from "lucide-react";

import { ACCENTS, type AccentName, type VisionFilter, type VisionMode } from "@/lib/cvd";
import { type MotionPreference, type ThemePreference, useSettings } from "@/state/settings";
import {
  Button,
  Fieldset,
  SegmentedControl,
  SelectField,
  Sheet,
  SliderField,
  SwitchField,
} from "@/ui";

import styles from "./SettingsPanel.module.css";

const VISION_OPTIONS: ReadonlyArray<{ value: VisionMode; label: string }> = [
  { value: "normal", label: "Typical color vision" },
  { value: "deutan", label: "Deuteranopia (green-weak)" },
  { value: "protan", label: "Protanopia (red-weak)" },
  { value: "tritan", label: "Tritanopia (blue/yellow)" },
  { value: "achromat", label: "Achromatopsia (no color)" },
];

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ["P", "Paint tool"],
  ["B", "Bucket fill tool"],
  ["H / Space (hold)", "Move / orbit"],
  ["[ and ]", "Previous / next color"],
  ["N", "Find next cell of the color"],
  ["+ / − / 0", "Zoom in / out / fit"],
  ["Arrows, Enter", "Move cursor, paint (2D)"],
  ["Ctrl/⌘ Z, Shift Ctrl/⌘ Z", "Undo / redo"],
];

export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Saved on this device."
    >
      <SettingsPanel />
    </Sheet>
  );
}

export function SettingsPanel() {
  const s = useSettings();
  const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

  return (
    <div className={styles.panel}>
      <Fieldset legend="Canvas">
        <SwitchField
          label="Show numbers"
          checked={s.showNumbers}
          onChange={(v) => s.set("showNumbers", v)}
        />
        <SwitchField
          label="Grid lines"
          checked={s.showGrid}
          onChange={(v) => s.set("showGrid", v)}
        />
        <SliderField
          label="Tint unfilled cells"
          description="Shows a hint of each cell's color so numbers are easier to find."
          value={Math.round(s.tint * 100)}
          onChange={(v) => s.set("tint", v / 100)}
          min={0}
          max={60}
          step={2}
          format={(v) => (v === 0 ? "Off" : `${v}%`)}
        />
        <SwitchField
          label="Highlight selected color"
          description="Marks every cell of the active number."
          checked={s.highlightSelected}
          onChange={(v) => s.set("highlightSelected", v)}
        />
      </Fieldset>

      <Fieldset legend="Color vision">
        <SelectField
          label="Color vision"
          value={s.visionMode}
          onChange={(v) => s.set("visionMode", v)}
          options={VISION_OPTIONS}
          description="Changes the default highlight color and enables the filters below."
        />
        <SegmentedControl<VisionFilter>
          label="Artwork color filter"
          showLabel
          value={s.visionMode === "normal" ? "off" : s.visionFilter}
          onChange={(v) => s.set("visionFilter", v)}
          options={[
            { value: "off", label: "Off" },
            { value: "enhance", label: "Enhance" },
            { value: "simulate", label: "Simulate" },
          ]}
        />
        <p className={styles.hint}>
          <strong>Enhance</strong> shifts hard-to-tell colors apart (daltonization).{" "}
          <strong>Simulate</strong> previews how others see the palette.
        </p>
        <div className={styles.accentField}>
          <span className={styles.label} id="accent-label">
            Highlight color
          </span>
          <RadioGroup
            className={styles.accents}
            aria-labelledby="accent-label"
            value={s.accent}
            onValueChange={(v) => s.set("accent", v)}
          >
            {(["auto", ...Object.keys(ACCENTS)] as AccentName[]).map((name) => (
              <Radio.Root key={name} value={name} className={styles.accent}>
                <span
                  className={styles.accentDot}
                  style={{
                    background:
                      name === "auto"
                        ? "conic-gradient(#1f8a4c, #1d64d8, #b0247a, #1f8a4c)"
                        : ACCENTS[name].hex,
                  }}
                  aria-hidden="true"
                />
                {name === "auto" ? "Auto" : ACCENTS[name].label}
              </Radio.Root>
            ))}
          </RadioGroup>
        </div>
        <SwitchField
          label="Show color names"
          description="Labels swatches like “dark green” instead of remaining counts."
          checked={s.showColorNames}
          onChange={(v) => s.set("showColorNames", v)}
        />
      </Fieldset>

      <Fieldset legend="Playing">
        <SwitchField
          label="Auto-advance colors"
          description="Jump to the next color when one is finished."
          checked={s.autoAdvance}
          onChange={(v) => s.set("autoAdvance", v)}
        />
        <SwitchField
          label="Tap a number to pick it"
          description="Tapping a cell with another number switches to that color. Off while mistakes are allowed."
          checked={s.smartSelect}
          onChange={(v) => s.set("smartSelect", v)}
        />
        {canVibrate ? (
          <SwitchField
            label="Haptic feedback"
            checked={s.haptics}
            onChange={(v) => s.set("haptics", v)}
          />
        ) : null}
      </Fieldset>

      <Fieldset legend="Challenge">
        <SwitchField
          label="One tap per square"
          description="No drag painting or bucket fill. Dragging moves the view instead."
          checked={s.tapOnly}
          onChange={(v) => s.set("tapOnly", v)}
        />
        <SwitchField
          label="Allow mistakes"
          description="Wrong colors stick until you paint over them, and the art isn't done until every square is right."
          checked={s.allowMistakes}
          onChange={(v) => s.set("allowMistakes", v)}
        />
        <SwitchField
          label="Highlight mistakes"
          description="Marks wrong squares with stripes and an outline. Turn off to find them yourself."
          checked={s.showMistakes}
          onChange={(v) => s.set("showMistakes", v)}
        />
      </Fieldset>

      <Fieldset legend="Appearance">
        <SegmentedControl<ThemePreference>
          label="Theme"
          showLabel
          value={s.theme}
          onChange={(v) => s.set("theme", v)}
          options={[
            { value: "system", label: "Auto", icon: <Monitor aria-hidden="true" /> },
            { value: "light", label: "Light", icon: <Sun aria-hidden="true" /> },
            { value: "dark", label: "Dark", icon: <Moon aria-hidden="true" /> },
          ]}
        />
        <SegmentedControl<MotionPreference>
          label="Motion"
          showLabel
          value={s.motion}
          onChange={(v) => s.set("motion", v)}
          options={[
            { value: "system", label: "Auto" },
            { value: "full", label: "Full" },
            { value: "reduced", label: "Reduced" },
          ]}
        />
        <SwitchField
          label="Celebrations"
          description="Confetti and a little show when you finish."
          checked={s.celebrate}
          onChange={(v) => s.set("celebrate", v)}
        />
      </Fieldset>

      <Fieldset legend="Keyboard shortcuts" className={styles.shortcuts}>
        <dl>
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys}>
              <dt>{keys}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </Fieldset>

      <Button variant="ghost" onClick={s.reset}>
        Reset all settings
      </Button>
    </div>
  );
}
