import styles from "./branded-loader.module.css";

export function BrandedLoader({ label = "Loading MPA", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={compact ? styles.loaderCompact : styles.loader} role="status" aria-live="polite" aria-label={label}>
      <span className={styles.mark} aria-hidden="true">
        <span className={styles.letter}>P</span>
        <svg className={styles.orbit} viewBox="0 0 88 88" focusable="false" aria-hidden="true">
          <circle cx="44" cy="44" r="38" />
        </svg>
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
