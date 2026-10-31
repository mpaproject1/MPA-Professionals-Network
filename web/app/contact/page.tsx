"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandedLoader } from "../../components/branded-loader";
import { openSupport } from "../../lib/support";

export default function LegacyContactRedirect() {
  const router = useRouter();

  useEffect(() => {
    // The global shell keeps SupportBot mounted while the legacy route returns home.
    openSupport();
    router.replace("/");
  }, [router]);

  return <BrandedLoader label="Opening MPA Support…" compact />;
}
