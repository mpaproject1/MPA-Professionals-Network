import { ArrowRight, Building2, Handshake, Network, ShieldCheck, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { NetworkPlusAccessGuard } from "../../components/network-plus-access-guard";

const workspaces = [
  {
    href: "/network",
    className: "np-folder np-folder--members",
    icon: Network,
    eyebrow: "People · Verified profiles",
    title: "Discover members",
    description: "Find MPA professionals by expertise and professional interests. Owners control profile visibility and contact sharing.",
    action: "Open member directory",
  },
  {
    href: "/network-plus/organizations",
    className: "np-folder np-folder--organizations",
    icon: Building2,
    eyebrow: "Organizations · Verified",
    title: "Discover organizations",
    description: "Explore verified organizations that have opted into discovery, using their approved public profile details.",
    action: "Explore organizations",
  },
  {
    href: "/network-plus/requests",
    className: "np-folder np-folder--requests",
    icon: Handshake,
    eyebrow: "Private workspace · Collaboration",
    title: "Requests & collaboration",
    description: "Manage service, supplier, referral, expertise, partnership and collaboration requests. A shared workspace opens only after explicit acceptance.",
    action: "Open my requests",
  },
];

export default function NetworkPlusPage() {
  return (
    <NetworkPlusAccessGuard>
      <main className="np-workspace">
        <header className="np-workspace-header">
          <div>
            <div className="eyebrow">MPA Professionals Network · Network-Plus</div>
            <h1>Professional connections, in one place.</h1>
            <p>Discover trusted people and organizations, then move from an introduction to purposeful collaboration.</p>
          </div>
          <div className="np-workspace-mark"><ShieldCheck size={16}/> Verified network <span/> Member-controlled visibility</div>
        </header>

        <section className="np-folder-grid" aria-label="Network-Plus workspaces">
          {workspaces.map((workspace) => {
            const Icon = workspace.icon;
            return (
              <Link href={workspace.href} className={workspace.className} key={workspace.href}>
                <span className="np-folder-tab"/>
                <span className="np-folder-icon"><Icon size={29} strokeWidth={1.8}/></span>
                <span className="np-folder-eyebrow">{workspace.eyebrow}</span>
                <strong>{workspace.title}</strong>
                <span className="np-folder-description">{workspace.description}</span>
                <span className="np-folder-action">{workspace.action}<ArrowRight size={16}/></span>
              </Link>
            );
          })}
        </section>

        <section className="np-workspace-note">
          <span className="np-note-icon"><BriefcaseBusiness size={19}/></span>
          <div><strong>Professional discovery stays separate from community service.</strong><p>Serve-Community is the home for public-benefit initiatives and volunteering. A connection request does not create an agreement, partnership or commitment.</p></div>
          <Link href="/serve-community">Open Serve-Community <ArrowRight size={15}/></Link>
        </section>
      </main>
    </NetworkPlusAccessGuard>
  );
}
