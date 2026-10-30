import { ArrowRight, BriefcaseBusiness, Network } from "lucide-react";
import Link from "next/link";
import { NetworkPlusAccessGuard } from "../../components/network-plus-access-guard";

export default function NetworkPlusPage() {
  return (
    <NetworkPlusAccessGuard>
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <header className="grid gap-3">
          <div className="eyebrow">MPA Professionals Network · Network-Plus</div>
          <h1 className="h1">Build meaningful professional connections.</h1>
          <p className="muted max-w-3xl">
            Discover verified MPA professionals and build connections around expertise and
            professional collaboration. Organization and business discovery are being introduced in separate steps.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Network-Plus discovery experiences">
          <section className="card grid content-start gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--surface)]">
                <Network size={22} aria-hidden="true" />
              </span>
              <div>
                <div className="eyebrow">People and organizations</div>
                <h2 className="h2">Verified Member Discovery</h2>
              </div>
            </div>
            <p className="muted">
              Find MPA professionals with verified expertise and explore professional interests.
              Verified organization discovery will be added as a separate view after its visibility
              rules are reconciled. Profile visibility and contact sharing remain under each owner's control.
            </p>
            <Link className="btn btn-primary mt-2 w-fit" href="/network">
              Discover members <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>

          <section className="card grid content-start gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-[var(--surface)]">
                <BriefcaseBusiness size={22} aria-hidden="true" />
              </span>
              <div>
                <div className="eyebrow">Member-owned businesses</div>
                <h2 className="h2">Business Discovery</h2>
              </div>
            </div>
            <p className="muted">
              A separate directory for member-owned businesses, organization services,
              supplier discovery and commercial collaboration. Business verification,
              ownership and privacy rules are being established before listings are introduced.
            </p>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Business listings will appear in a later implementation increment.
            </p>
          </section>
        </section>

        <p className="muted text-sm">
          Serve-Community remains separate for public initiatives, volunteering and community
          impact. Volunteer initiatives are not business listings, and submitting a connection
          request does not create an agreement or partnership.
        </p>
      </main>
    </NetworkPlusAccessGuard>
  );
}
