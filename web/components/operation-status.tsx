"use client";

import {CheckCircle2, CircleAlert, type LucideIcon} from "lucide-react";
import type {ReactNode} from "react";
import {BrandedLoader} from "./branded-loader";

type OperationStatusProps = {
  state: "loading" | "success" | "error" | "info";
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
};

const icons: Record<OperationStatusProps["state"], LucideIcon> = {
  loading: CircleAlert,
  success: CheckCircle2,
  error: CircleAlert,
  info: CircleAlert,
};

/** A calm, accessible status surface with a specific explanation of the work in progress. */
export function OperationStatus({ state, title, detail, action, className = "" }: OperationStatusProps) {
  const Icon = icons[state];
  return (
    <div
      className={`operation-status operation-status--${state} ${className}`.trim()}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-busy={state === "loading" ? true : undefined}
    >
      <div className={`operation-status__icon ${state === "loading" ? "operation-status__icon--moving" : ""}`}>
        {state === "loading" ? <BrandedLoader label={title} compact markOnly /> : <Icon size={19} aria-hidden="true" />}
      </div>
      <span className="operation-status__copy">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
      {action ? <span className="operation-status__action">{action}</span> : null}
    </div>
  );
}
