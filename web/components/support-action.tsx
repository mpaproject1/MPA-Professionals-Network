"use client";

import { MessageCircle } from "lucide-react";
import { openSupport } from "../lib/support";

export function SupportAction({ label = "Contact MPA Support", className = "btn btn-ghost" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={openSupport}>
      <MessageCircle size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
