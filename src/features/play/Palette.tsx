import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check } from "lucide-react";
import { type CSSProperties, memo, useEffect, useMemo, useRef } from "react";

import { colorName, hexToRgb, readableTextColor, rgbToHex } from "@/lib/color";
import { applyMatrix, type Mat3 } from "@/lib/cvd";
import type { PlaySession } from "@/lib/session";

import styles from "./PlayView.module.css";

interface PaletteProps {
  session: PlaySession;
  /** Changes whenever progress changes, so counts re-render. */
  version: number;
  selected: number;
  onSelect: (color: number) => void;
  vision: Mat3;
  showNames: boolean;
}

export const Palette = memo(function Palette({
  session,
  version,
  selected,
  onSelect,
  vision,
  showNames,
}: PaletteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const palette = session.project.palette;

  const swatches = useMemo(
    () =>
      palette.map((hex, i) => {
        const rgb = hexToRgb(hex);
        const shown = applyMatrix(vision, rgb);
        return {
          color: i + 1,
          hex: rgbToHex(shown),
          text: readableTextColor(shown),
          name: colorName(rgb),
        };
      }),
    [palette, vision],
  );

  // Keep the active swatch in view (e.g. after auto-advance or keyboard shortcuts).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-color="${selected}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <RadioGroup
      ref={listRef}
      className={styles.palette}
      value={selected}
      onValueChange={(v) => onSelect(v)}
      aria-label="Colors"
      data-version={version}
    >
      {swatches.map(({ color, hex, text, name }) => {
        const total = session.targets.colorTotals[color] ?? 0;
        const done = session.colorDone[color] ?? 0;
        const complete = total > 0 && done >= total;
        const pct = total ? done / total : 1;
        return (
          <Radio.Root
            key={color}
            value={color}
            data-color={color}
            className={styles.swatch}
            data-complete={complete || undefined}
            aria-label={`Color ${color}, ${name}. ${complete ? "Complete" : `${total - done} of ${total} left`}`}
          >
            <span
              className={styles.swatchRing}
              style={{ "--pct": pct } as CSSProperties}
              aria-hidden="true"
            >
              <span className={styles.swatchChip} style={{ background: hex, color: text }}>
                {complete ? <Check strokeWidth={3} /> : color}
              </span>
            </span>
            <span className={styles.swatchLabel} aria-hidden="true">
              {showNames ? name : complete ? "Done" : `${total - done}`}
            </span>
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
});
