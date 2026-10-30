import Link from "next/link";

export function EmptyState({ title = "No data to show.", description, actionHref, actionLabel, className = "card" }: { title?: string; description?: string; actionHref?: string; actionLabel?: string; className?: string }) {
  return (
    <section className={className} role="status" aria-live="polite">
      <h2 className="h2">{title}</h2>
      {description ? <p className="muted">{description}</p> : null}
      {actionHref && actionLabel ? <p><Link className="btn btn-ghost" href={actionHref}>{actionLabel}</Link></p> : null}
    </section>
  );
}
