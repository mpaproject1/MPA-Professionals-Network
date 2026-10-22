import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Card } from "./ui";

export type JourneyStep = {
  title: string;
  description: string;
  href: string;
  action?: string;
};

export function JourneyGuide({
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  steps,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  steps: JourneyStep[];
}) {
  return (
    <Card>
      <div className="grid" style={{ gap: 12 }}>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="h2">{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <ol className="grid grid-2" style={{ gap: 10, padding: 0, margin: 0, listStyle: "none" }}>
          {steps.map((step, index) => (
            <li key={step.title} className="case-row">
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span aria-hidden="true" className="avatar" style={{ flexShrink: 0 }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="h2">{step.title}</h3>
                  <p className="muted">{step.description}</p>
                  <Link className="btn btn-ghost" href={step.href}>
                    {step.action || "Open step"} <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
          <p className="muted"><CheckCircle2 size={15} style={{ display: "inline", verticalAlign: "text-bottom" }} /> Each step keeps its own saved status and history.</p>
          <Link className="btn btn-primary" href={primaryHref}>{primaryLabel} <ArrowRight size={16} /></Link>
        </div>
      </div>
    </Card>
  );
}
