import { Palette } from "lucide-react";

import styles from "./BrandMark.module.css";

/** App logo: the Lucide palette glyph on an accent tile (matches favicon.svg). */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true">
      <Palette />
    </span>
  );
}
