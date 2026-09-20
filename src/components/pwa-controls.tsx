"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaControls() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [offline, setOffline] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () =>
      setInstalled(
        standalone.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    const syncOnline = () => setOffline(!navigator.onLine);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    syncInstalled();
    syncOnline();
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // The online app still works when the browser disallows installation.
        });
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    standalone.addEventListener("change", syncInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      standalone.removeEventListener("change", syncInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setInstalling(true);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch {
      setError("Use your browser's menu to install Clinic Assistant.");
    } finally {
      setInstalling(false);
    }
  }

  return (
    <>
      {offline && (
        <div className="pwa-offline" role="status">
          <WifiOff size={16} /> You're offline. Reconnect to use voice and
          appointments.
        </div>
      )}
      {!installed && prompt && (
        <button
          className="pwa-install"
          onClick={() => void install()}
          disabled={installing}
        >
          <Download size={15} />
          {installing ? "Installing..." : "Install app"}
        </button>
      )}
      {!installed && ios && !prompt && (
        <details className="pwa-ios">
          <summary>
            <Download size={15} /> Install app
          </summary>
          <p>Open Clinic Assistant in Safari, tap Share, then Add to Home Screen.</p>
        </details>
      )}
      {error && (
        <span role="status" className="pwa-install-error">
          {error}
        </span>
      )}
    </>
  );
}
