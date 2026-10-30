"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";

type AccessDecision = {
  eligible: boolean;
  access: { member: boolean; organization: boolean };
  nextAction: string;
};

type GuardState = "checking" | "allowed" | "denied" | "signed-out" | "error";

export function NetworkPlusAccessGuard({ children }: { children: React.ReactNode }) {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const [decision, setDecision] = useState<{ token: string | null; state: GuardState; message?: string }>({
    token: null,
    state: "checking",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return () => { cancelled = true; };
    if (!token) {
      setDecision({ token: null, state: "signed-out" });
      return () => { cancelled = true; };
    }

    setDecision({ token, state: "checking" });
    api<AccessDecision>("/api/v1/network-plus/access", {}, token)
      .then((result) => {
        if (!cancelled) {
          setDecision({
            token,
            state: result.eligible ? "allowed" : "denied",
            message: result.nextAction,
          });
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          setDecision({ token, state: "signed-out", message: cause.message });
          return;
        }
        setDecision({
          token,
          state: "error",
          message: cause instanceof ApiError
            ? cause.message
            : "Network-Plus access could not be confirmed. Retry before continuing.",
        });
      });

    return () => { cancelled = true; };
  }, [hydrated, token, attempt]);

  const currentState = !hydrated || decision.token !== token
    ? "checking"
    : decision.state;

  if (currentState === "allowed") return <>{children}</>;

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10 sm:px-6" aria-live="polite">
      <section className="card">
        {currentState === "checking" ? (
          <>
            <h1 className="h2">Checking Network-Plus access</h1>
            <p className="muted">We are confirming your current membership or verified organization access with MPA.</p>
          </>
        ) : currentState === "signed-out" ? (
          <>
            <h1 className="h2">Sign in to Network-Plus</h1>
            <p className="muted">Network-Plus is available to current MPA members and authorized representatives of verified MPA organizations.</p>
            <Link className="btn btn-primary mt-4" href="/login?next=%2Fnetwork-plus">Sign in</Link>
          </>
        ) : currentState === "denied" ? (
          <>
            <h1 className="h2">Network-Plus access is not available</h1>
            <p className="muted">{decision.message || "A current active MPA membership or an authorized role in a verified organization is required."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn btn-primary" href="/membership">Review membership</Link>
              <Link className="btn btn-ghost" href="/organizations">Organization workspace</Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="h2">We could not confirm Network-Plus access</h1>
            <p className="form-error" role="alert">{decision.message || "The access service did not respond. No access has been assumed."}</p>
            <button className="btn btn-primary mt-4" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry access check</button>
          </>
        )}
      </section>
    </main>
  );
}
