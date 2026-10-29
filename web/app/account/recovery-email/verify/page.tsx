"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FormFeedback } from "../../../../components/form-feedback";
import { Card } from "../../../../components/ui";
import { api } from "../../../../lib/api";

export default function RecoveryEmailVerifyPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const value = fragment.get("token") || "";
    setToken(value);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function verify(e: FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    if (!token) { setError("This verification link is incomplete. Ask an administrator to start a new request."); return; }
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/v1/auth/recovery-email/verify", { method: "POST", body: JSON.stringify({ token }) });
      setMessage(result.message || "Recovery email verified.");
      setToken("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recovery email could not be verified. Request a new link.");
    } finally { setBusy(false); }
  }
  return <div className="grid" style={{ gap: 16, maxWidth: 650, margin: "24px auto" }}>
    <div className="eyebrow">Secure account recovery</div>
    <h1 className="h1">Verify your recovery email</h1>
    <Card>
      <p className="muted">This single-use verification link expires after 30 minutes. The new address will not be trusted for account recovery until verification succeeds.</p>
      {error && <FormFeedback kind="error" message={error} />}
      {message && <FormFeedback kind="success" message={message} />}
      <form onSubmit={verify} className="grid" style={{ gap: 12, marginTop: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={busy || !token}>{busy ? "Verifying…" : "Verify recovery email"}</button>
        <button className="btn btn-ghost" type="button" onClick={() => router.push("/login")}>Return to sign in</button>
      </form>
    </Card>
  </div>;
}
