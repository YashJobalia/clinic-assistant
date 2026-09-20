"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useAppearance } from "./appearance-provider";
const choices = [
  {
    value: "system",
    label: "System",
    description: "Match your device",
    icon: Monitor,
  },
  {
    value: "light",
    label: "Light",
    description: "A bright, familiar look",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Softer in low light",
    icon: Moon,
  },
] as const;
export function AppearanceSettings({ signedIn }: { signedIn: boolean }) {
  const { appearance, busy, status, choose } = useAppearance();
  return (
    <section
      className="workspace-panel appearance-settings"
      aria-labelledby="appearance-heading"
    >
      <h2 id="appearance-heading">Appearance</h2>
      <p>
        Choose how Clinic Assistant looks. System follows your device and is the
        default.
      </p>
      <fieldset disabled={busy} className="appearance-options">
        <legend className="sr-only">Color theme</legend>
        {choices.map(({ value, label, description, icon: Icon }) => (
          <label
            key={value}
            className="appearance-option"
            data-selected={appearance === value}
          >
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={appearance === value}
              onChange={() => choose(value)}
              onClick={() => {
                if (appearance === value) choose(value);
              }}
            />
            <Icon size={23} aria-hidden="true" />
            <strong>{label}</strong>
            <span>{description}</span>
          </label>
        ))}
      </fieldset>
      <p>
        {signedIn
          ? "Your preference syncs across browsers when you sign in."
          : "Saved in this browser. Sign in to sync your preference across browsers."}
      </p>
      <p role="status" className="appearance-status">
        {busy ? "Syncing appearance…" : status}
      </p>
    </section>
  );
}
