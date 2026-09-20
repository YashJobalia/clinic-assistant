"use client";
import {
  languages,
  percentile,
  type Language,
  type Preferences,
  type TurnMetric,
} from "@/lib/conversation";

export function ConversationLab({
  turns,
  preferences,
  language,
  onLanguage,
  pauseMs,
  onPause,
  onClear,
}: {
  turns: TurnMetric[];
  preferences?: Preferences;
  language: Language;
  onLanguage: (value: Language) => void;
  pauseMs: number;
  onPause: (value: number) => void;
  onClear: () => void;
}) {
  const latencies = turns.flatMap((t) =>
    t.responseLatencyMs === undefined ? [] : [t.responseLatencyMs],
  );
  const show = (value: number | null | undefined) =>
    value == null ? "-" : `${Math.round(value)} ms`;
  function download() {
    // Deliberately excludes transcript, identity, proposal tokens and free-form tool arguments.
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { schemaVersion: 1, exportedAt: new Date().toISOString(), turns },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "clinic-assistant-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="conversation-lab">
      <div className="voice-settings">
        <label>
          Conversation language
          <select
            value={language}
            onChange={(e) => onLanguage(e.target.value as Language)}
          >
            {Object.entries(languages).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pause before sending
          <select
            value={pauseMs}
            onChange={(e) => onPause(Number(e.target.value))}
          >
            <option value={650}>Quick · 0.65s</option>
            <option value={1000}>Balanced · 1s</option>
            <option value={1600}>Patient · 1.6s</option>
          </select>
        </label>
        <a href="/clinic-guide" target="_blank" rel="noreferrer">
          Clinic guide ↗
        </a>
      </div>
      <details>
        <summary>Developer view · {turns.length} measured turns</summary>
        <p>
          Session-only measurements. Voice latency starts at the last detected
          speech and ends at the browser’s first playback event. Small samples
          are exploratory.
        </p>
        <div className="metric-grid">
          <div>
            <small>Median voice response</small>
            <strong>{show(percentile(latencies, 0.5))}</strong>
          </div>
          <div>
            <small>p95 voice response</small>
            <strong>{show(percentile(latencies, 0.95))}</strong>
          </div>
          <div>
            <small>Voice samples</small>
            <strong>{latencies.length}</strong>
          </div>
          <div>
            <small>Failed turns</small>
            <strong>{turns.filter((t) => t.status === "error").length}</strong>
          </div>
        </div>
        <div className="lab-actions">
          <button onClick={download} disabled={!turns.length}>
            Export diagnostics
          </button>
          <button onClick={onClear} disabled={!turns.length}>
            Clear measurements
          </button>
        </div>
        {preferences && (
          <p className="memory-preview">
            Scheduling memory:{" "}
            {Object.entries(preferences)
              .filter(([, value]) => value !== null)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ") || "No preferences yet"}
          </p>
        )}
        <div className="metrics-scroll">
          <table>
            <caption>Most recent turns (up to 50)</caption>
            <thead>
              <tr>
                <th>Turn</th>
                <th>Pause</th>
                <th>Transcription</th>
                <th>Chat</th>
                <th>Speech startup</th>
                <th>Response</th>
                <th>Stop playback</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((t, index) => (
                <tr key={t.id}>
                  <th>
                    {index + 1} · {t.mode}
                    {t.status === "error" ? " · failed" : ""}
                  </th>
                  <td>{show(t.endpointMs)}</td>
                  <td>{show(t.transcriptionMs)}</td>
                  <td>{show(t.chatMs)}</td>
                  <td>{show(t.speechStartMs)}</td>
                  <td>{show(t.responseLatencyMs)}</td>
                  <td>{show(t.interruptionStopMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {turns.at(-1)?.diagnostics && (
          <details>
            <summary>Latest model and tool trace</summary>
            <p>
              {turns.at(-1)!.diagnostics!.model} ·{" "}
              {turns.at(-1)!.diagnostics!.inputTokens} input /{" "}
              {turns.at(-1)!.diagnostics!.outputTokens} output tokens
            </p>
            <p>
              Model cost estimate:{" "}
              {turns.at(-1)!.diagnostics!.estimatedModelCostUsd == null
                ? "not configured"
                : `$${turns.at(-1)!.diagnostics!.estimatedModelCostUsd!.toFixed(6)}`}{" "}
              (excludes speech, transcription and hosting).
            </p>
            <ol>
              {turns.at(-1)!.diagnostics!.traces.map((trace, i) => (
                <li key={i}>
                  {trace.name} · {show(trace.durationMs)} · {trace.status}
                </li>
              ))}
            </ol>
          </details>
        )}
      </details>
    </section>
  );
}
