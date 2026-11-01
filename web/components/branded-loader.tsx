import styles from "./branded-loader.module.css";

export function BrandedLoader({ label = "Loading MPA", compact = false, markOnly = false }: { label?: string; compact?: boolean; markOnly?: boolean }) {
  return (
    <div className={markOnly ? styles.markOnly : compact ? styles.loaderCompact : styles.loader} role={markOnly ? undefined : "status"} aria-live={markOnly ? undefined : "polite"} aria-hidden={markOnly || undefined}>
      <span className={styles.mark} aria-hidden="true">
        <span className={styles.letter}>P</span>
        <svg className={styles.orbit} viewBox="0 0 88 88" focusable="false" aria-hidden="true">
          <circle cx="44" cy="44" r="38" />
        </svg>
      </span>
      {!markOnly && label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
