"use client";
import { newPasswordAttributes, PASSWORD_HINT } from "@/lib/password";
import { useState } from "react";
export function RecoveryForm({
  completing = false,
  expired = false,
}: {
  completing?: boolean;
  expired?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    expired
      ? "That link expired or was opened in another browser. Request a new link here."
      : "",
  );
  return (
    <section className="workspace-panel recovery-card">
      <span className="eyebrow">CLINIC ASSISTANT ACCOUNT ACCESS</span>
      <h1>{completing ? "Choose a new password" : "Reset your password"}</h1>
      <p>
        {completing
          ? "Enter your new password privately. Mira never needs to hear it."
          : "Enter your account email. We will request a secure reset link so you can regain access."}
      </p>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {!done && (
        <form
          className="workspace-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = e.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            if (completing && values.password !== values.confirmPassword) {
              setError("Passwords do not match.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/account/recovery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...values,
                  action: completing ? "complete" : "request",
                }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              setMessage(data.message);
              setDone(true);
              form.reset();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not connect. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {completing ? (
            <>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  {...newPasswordAttributes}
                />
              </label>
              <label>
                Confirm new password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  {...newPasswordAttributes}
                />
              </label>
              <small>{PASSWORD_HINT}</small>
            </>
          ) : (
            <label>
              Account email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          <button className="primary-action" disabled={busy}>
            {busy
              ? "Please wait..."
              : completing
                ? "Save new password"
                : "Request reset link"}
          </button>
        </form>
      )}
      <a href="/">Return to Clinic Assistant</a>
      {completing && !done && (
        <p>
          <a href="/reset-password">Request a new reset link</a>
        </p>
      )}
    </section>
  );
}
