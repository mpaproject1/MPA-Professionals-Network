import {Home} from "lucide-react";
import Link from "next/link";
import {SupportAction} from "../components/support-action";

export default function NotFound() {
  return (
    <div className="auth-page">
      <section className="card" aria-labelledby="not-found-title">
        <p className="eyebrow">404 · Page not found</p>
        <h1 id="not-found-title" className="h1">We couldn’t find that page.</h1>
        <p className="muted">Sorry, we couldn’t find this page. It may have moved or changed. If you believe this is a problem, please report it to MPA Support.</p>
        <div className="landing-actions">
          <Link className="btn btn-primary" href="/"><Home size={16} aria-hidden="true" /> Return to MPA home</Link>
          <SupportAction label="Report this to MPA Support" />
        </div>
      </section>
    </div>
  );
}
