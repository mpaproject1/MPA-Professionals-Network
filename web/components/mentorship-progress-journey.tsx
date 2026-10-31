import { Card } from "./ui";

export type MentorshipProgressStep = {
  title: string;
  description: string;
  status: "complete" | "current" | "waiting" | "upcoming";
};

const STATUS_LABEL: Record<MentorshipProgressStep["status"], string> = {
  complete: "Complete",
  current: "Your next step",
  waiting: "Waiting for response",
  upcoming: "Upcoming",
};

export function MentorshipProgressJourney({ steps }: { steps: MentorshipProgressStep[] }) {
  return (
    <Card>
      <section aria-labelledby="mentorship-progress-title" className="grid" style={{ gap: 12 }}>
        <div>
          <div className="eyebrow">Your mentorship journey</div>
          <h2 id="mentorship-progress-title" className="h2">One clear path from discovery to outcomes</h2>
          <p className="muted">Each stage follows saved requests, match decisions, confirmed sessions and recorded outcomes. A proposal is never shown as an accepted match or confirmed session.</p>
        </div>
        <ol className="grid" style={{ gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((step, index) => (
            <li className="case-row" key={step.title} aria-current={step.status === "current" ? "step" : undefined}>
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span className="badge" aria-hidden="true">{step.status === "complete" ? "✓" : String(index + 1)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <strong>{step.title}</strong>
                    <span className={`badge journey-status journey-status--${step.status}`}>{STATUS_LABEL[step.status]}</span>
                  </div>
                  <p className="muted">{step.description}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </Card>
  );
}
