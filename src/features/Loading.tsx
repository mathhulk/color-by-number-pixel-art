import styles from "./Loading.module.css";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <output className={styles.loading} aria-live="polite">
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i % 3) * 90 + Math.floor(i / 3) * 90}ms` }} />
        ))}
      </div>
      <span className={styles.label}>{label}</span>
    </output>
  );
}
