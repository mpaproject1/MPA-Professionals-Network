import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Serve-Community | MPA Professionals Network",
  description: "Discover professional services, mentorship, career opportunities and community initiatives through the MPA Professionals Network.",
  alternates: { canonical: "/serve-community" },
};

export default function ServeCommunityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
