import styles from "./branded-loader.module.css";

export function BrandedLoader({ label = "Loading MPA", compact = false, markOnly = false }: { label?: string; compact?: boolean; markOnly?: boolean }) {
  return (
    <div
      className={markOnly ? styles.markOnly : compact ? styles.loaderCompact : styles.loader}
      role={markOnly ? undefined : "status"}
      aria-live={markOnly ? undefined : "polite"}
      aria-hidden={markOnly || undefined}
    >
      <span className={styles.mark} aria-hidden="true">
        <img className={`${styles.logo} ${styles.logoLight}`} src="/brand/mpa-logo-light.svg" alt="" />
        <img className={`${styles.logo} ${styles.logoDark}`} src="/brand/mpa-logo-dark.svg" alt="" />
        <span className={styles.orbit} aria-hidden="true">
          <span className={`${styles.dot} ${styles.dotNavy}`} />
          <span className={`${styles.dot} ${styles.dotBlue}`} />
          <span className={`${styles.dot} ${styles.dotLime}`} />
        </span>
      </span>
      {!markOnly && label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
