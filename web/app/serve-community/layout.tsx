import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Serve-Community | MPA Professionals Network",
  description: "Discover reviewed community-benefit initiatives and consent-based volunteering opportunities through the MPA Professionals Network.",
  alternates: { canonical: "/serve-community" },
};

export default function ServeCommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
