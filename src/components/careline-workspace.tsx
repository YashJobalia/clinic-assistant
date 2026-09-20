"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Headphones,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  Send,
  Settings,
  Stethoscope,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import { doctors, type Message, type Slot } from "@/lib/clinic";
import type {
  Account,
  ActionReceipt,
  ActionResult,
  Mutation,
  Navigation,
  PendingAction,
  Visit,
} from "@/lib/workspace";
import { AccountWorkspace } from "./account-workspace";
import { AppearanceSettings } from "./appearance-settings";
import { useAppearance } from "./appearance-provider";
import { AppointmentWorkspace } from "./appointment-workspace";
import { useRealtimeVoice } from "./use-realtime-voice";
import { LanguagePicker } from "./language-picker";
import { PwaControls } from "./pwa-controls";
import { type ReplyLanguage } from "@/lib/voice-language";
import type { ActionActivity } from "@/lib/action-activity";
const detailLabels: Record<string, string> = {
  name: "Full name",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  phone: "Phone",
  email: "Email",
  notes: "Appointment notes",
  summary: "Message summary",
  reason: "Reason",
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
}
export function CarelineWorkspace() {
  const [user, setUser] = useState<Account | null>(null);
  const { setAccountId } = useAppearance();
  useEffect(() => {
    setAccountId(user?.id || null);
  }, [user?.id, setAccountId]);
  const [display, setDisplay] = useState<Navigation>({
    page: "reception",
    mode: "list",
    filter: "all",
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clinic, setClinic] = useState<Visit[]>([]);
  const [search, setSearch] = useState<{
    scope: string;
    query: string;
    results: Visit[];
    truncated: boolean;
  }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [pending, setPending] = useState<PendingAction>();
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  }>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<ActionReceipt>();
  const [authEmail, setAuthEmail] = useState("");
  const [resumeRequest, setResumeRequest] = useState("");
  const authReturnTo = useRef<Navigation | undefined>(undefined);
  const guestRequest = useRef("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [replyLanguage, setReplyLanguage] = useState<ReplyLanguage>("English");
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [traces, setTraces] = useState<ActionActivity[]>([]);
  const [responseMs, setResponseMs] = useState<number>();
  const transcript = useRef<HTMLDivElement>(null);
  const historyQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const trace = (activity: ActionActivity) =>
    setTraces((old) => [...old, activity].slice(-50));
  const replaceMessages = useCallback((value: Message[]) => {
    messagesRef.current = value;
    setMessages(value);
  }, []);
  const refresh = useCallback(async () => {
    const [auth, data] = await Promise.all([
      api<{ user: Account | null }>("/api/auth"),
      api<{ slots: Slot[] }>("/api/clinic"),
    ]);
    if (!mounted.current) return;
    setUser(auth.user);
    setSlots(data.slots);
    if (auth.user) {
      const own = await api<{ appointments: Visit[] }>("/api/workspace", {
        action: "list_appointments",
        args: { scope: "mine" },
      });
      if (mounted.current) setVisits(own.appointments);
      if (auth.user.role === "doctor") {
        const all = await api<{ appointments: Visit[] }>("/api/workspace", {
          action: "list_appointments",
          args: { scope: "clinic" },
        });
        if (mounted.current) setClinic(all.appointments);
      } else setClinic([]);
    } else {
      setVisits([]);
      setClinic([]);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        await refresh();
        const auth = await api<{ user: Account | null }>("/api/auth");
        if (auth.user) {
          const h = await api<{ messages: Message[] }>("/api/conversations");
          if (mounted.current) replaceMessages(h.messages);
        }
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [refresh, replaceMessages]);
  const applyEffect = async (effect: ActionResult) => {
    if (effect.receipt) setReceipt(effect.receipt);
    if (Array.isArray(effect.searchResults)) {
      setSearch({
        scope: String(effect.scope),
        query: String(effect.query),
        results: effect.searchResults as Visit[],
        truncated: effect.truncated === true,
      });
      setDisplay({
        page: effect.scope === "clinic" ? "doctor" : "appointments",
        mode: "list",
        filter: "all",
      });
    }
    if (effect.authentication) {
      if (effect.authentication.originalRequest)
        guestRequest.current = effect.authentication.originalRequest;
      if (!guestRequest.current)
        guestRequest.current =
          messagesRef.current.findLast((m) => m.role === "user")?.content || "";
      if (effect.authentication.email)
        setAuthEmail(effect.authentication.email);
      if (effect.authentication.returnTo)
        authReturnTo.current = effect.authentication.returnTo;
    }
    if (effect.navigation) {
      setDisplay(effect.navigation);
      if (
        ["appointments", "doctor", "account"].includes(effect.navigation.page)
      )
        await refresh();
    }
    if (Array.isArray(effect.appointments)) {
      if (effect.scope === "clinic") setClinic(effect.appointments as Visit[]);
      else setVisits(effect.appointments as Visit[]);
    }
    if (effect.callControl === "end_call") voice.endPolitely();
    if (effect.callControl === "mute" && !voice.muted) voice.toggleMute();
    if (effect.pending) {
      setPending(effect.pending);
      voice.setDraft(effect.pending.token);
    }
    if (effect.credentials) setCredentials(effect.credentials);
    if (effect.ok) {
      setPending(undefined);
      if (effect.message) setNotice(effect.message);
      if (effect.clearedHistory) {
        replaceMessages([]);
        voice.stop();
      }
      if (effect.signedOut) {
        setReceipt(undefined);
        setTraces([]);
        setSearch(undefined);
        guestRequest.current = "";
        authReturnTo.current = undefined;
        setResumeRequest("");
        setAuthEmail("");
        voice.stop();
        setCredentials(undefined);
        replaceMessages([]);
        setDisplay({ page: "reception" });
      }
      try {
        await refresh();
      } catch {
        setError(
          "Your action completed, but the page could not refresh. Check your connection and refresh to see the latest data.",
        );
      }
    }
  };
  const voice = useRealtimeVoice({
    replyLanguage,
    onEffect: applyEffect,
    onError: setError,
    onTrace: trace,
    beforeAction: async () => {
      await historyQueue.current;
    },
    onMessage: (message, ownerId) => {
      const next = [...messagesRef.current, message].slice(-200);
      replaceMessages(next);
      historyQueue.current = historyQueue.current
        .then(() => api("/api/conversations", { ownerId, messages: next }))
        .then(() => {})
        .catch(() =>
          setError(
            "Conversation could not be saved. Your current call can continue.",
          ),
        );
    },
  });
  const processingLabel = busy
    ? "Thinking..."
    : voice.active
      ? voice.processing
      : "";
  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [messages, processingLabel]);
  async function prepare(details: Mutation) {
    setError("");
    setNotice("");
    try {
      await applyEffect(
        await api<ActionResult>("/api/workspace", {
          action: "prepare",
          args: details,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      if (["clear_history", "signout"].includes(pending.details.action))
        voice.stop();
      await historyQueue.current;
      await applyEffect(
        await api<ActionResult>("/api/workspace", {
          action: "confirm",
          token: pending.token,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    replaceMessages([...messagesRef.current, { role: "user", content: text }]);
    try {
      const result = await api<{
        text: string;
        effects: ActionResult[];
        traces: ActionActivity[];
        totalMs: number;
      }>("/api/assistant", {
        message: text,
        pendingToken: pending?.token,
        replyLanguage,
      });
      for (const effect of result.effects) await applyEffect(effect);
      if (!result.effects.some((e) => e.signedOut || e.clearedHistory))
        replaceMessages([
          ...messagesRef.current,
          { role: "assistant", content: result.text },
        ]);
      setTraces((old) => [...old, ...result.traces].slice(-50));
      setResponseMs(result.totalMs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(value: Record<string, string>) {
    voice.stop();
    await historyQueue.current;
    const result = await api<ActionResult>("/api/auth", value);
    setSearch(undefined);
    setReceipt(undefined);
    setTraces([]);
    setPending(undefined);
    voice.setDraft();
    setCredentials(result.credentials);
    await refresh();
    const h = await api<{ messages: Message[] }>("/api/conversations");
    replaceMessages(h.messages);
    const target = authReturnTo.current;
    setDisplay(
      target?.page === "doctor"
        ? { page: "reception" }
        : target || { page: "reception" },
    );
    setResumeRequest(guestRequest.current);
    guestRequest.current = "";
    authReturnTo.current = undefined;
    setAuthEmail("");
    setNotice("You are signed in. Mira is ready to help you continue.");
  }
  const nav = [
    { id: "reception", label: "Voice demo", icon: Headphones },
    { id: "appointments", label: "My appointments", icon: CalendarDays },
    { id: "specialists", label: "Our specialists", icon: Stethoscope },
    ...(user?.role === "doctor"
      ? [{ id: "doctor", label: "Doctor panel", icon: Stethoscope }]
      : []),
    { id: "account", label: "My account", icon: UserRound },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  return (
    <div className="app-shell careline-workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Clinic Assistant home">
          <span className="brand-mark">
            <Plus size={25} />
          </span>
          <span className="brand-copy">
            <span>Clinic Assistant</span>
            <span className="brand-subtitle">Conversational Voice Agent</span>
          </span>
        </a>
        <div className="sidebar-label">EXPLORE THE DEMO</div>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${display.page === n.id ? "selected" : ""}`}
              aria-current={display.page === n.id ? "page" : undefined}
              onClick={() =>
                setDisplay({
                  page: n.id as Navigation["page"],
                  mode: "list",
                  filter: "all",
                })
              }
            >
              <n.icon size={19} />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          Built by{" "}
          <a
            href="https://yashjobalia.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Yash Jobalia
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Clinic Assistant <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === display.page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <PwaControls />
            <span className="demo-badge">AI DEMO</span>
            <button
              className="user-pill"
              onClick={() => setDisplay({ page: "account" })}
            >
              {user?.name || "Sign in"}
            </button>
          </div>
        </header>
        <main className="main-content workspace-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">VOICE &amp; CONVERSATIONAL AI</div>
              <h1>
                {display.page === "reception"
                  ? "Try the voice agent."
                  : nav.find((n) => n.id === display.page)?.label}
              </h1>
              <p>
                {display.page === "reception"
                  ? "Speak in any supported language. Choose the language for your replies, then let the AI guide you around."
                  : "Every action is available here and through the voice assistant."}
              </p>
            </div>
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <p className="workspace-notice" role="status">
              {notice}
            </p>
          )}
          {user && resumeRequest && (
            <section
              className="workspace-panel"
              aria-label="Continue your request"
            >
              <h2>Pick up with Mira</h2>
              <p dir="auto">{resumeRequest}</p>
              <div className="workspace-actions">
                <button
                  className="primary-action"
                  disabled={busy || voice.active || voice.connecting}
                  onClick={() => {
                    const request = resumeRequest;
                    setResumeRequest("");
                    setDisplay({ page: "reception" });
                    void send(request);
                  }}
                >
                  Continue with Mira
                </button>
                <button onClick={() => setResumeRequest("")}>Dismiss</button>
              </div>
            </section>
          )}
          {/* Keep the assistant mounted and available while it navigates the workspace. */}
          <section
            className={`workspace-voice call-interface ${voice.active ? "call-connected" : ""} ${display.page !== "reception" ? "compact-voice" : ""}`}
            aria-label="Voice assistant"
          >
            <div className="voice-intro">
              <span className="eyebrow">YOUR PERSONAL VOICE ASSISTANT</span>
              <div className="reply-language-control">
                <span>Reply language</span>
                <LanguagePicker
                  value={replyLanguage}
                  disabled={voice.connecting || busy || changingLanguage}
                  onChange={async (next) => {
                    setChangingLanguage(true);
                    try {
                      await voice.updateReplyLanguage(next);
                      setReplyLanguage(next);
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Could not change reply language.",
                      );
                    } finally {
                      setChangingLanguage(false);
                    }
                  }}
                />
                <small>
                  {changingLanguage
                    ? "Updating..."
                    : "Speak any language. Replies follow your choice."}
                </small>
              </div>
              <span className="voice-session-badge">
                <span aria-hidden="true" />
                {voice.connecting
                  ? "Connecting"
                  : voice.active
                    ? "In call"
                    : "Ready to connect"}
                {voice.active && (
                  <time className="call-timer" aria-label="Call duration">
                    {Math.floor(voice.elapsedSeconds / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(voice.elapsedSeconds % 60).toString().padStart(2, "0")}
                  </time>
                )}
              </span>
              <div className={`live-orb ${voice.active ? "is-active" : ""}`}>
                <span className="mira-monogram" aria-hidden="true">
                  m
                </span>
                <span className="avatar-call-badge" aria-hidden="true">
                  <Headphones size={18} />
                </span>
              </div>
              <h2 className="caller-name">Mira</h2>
              <p className="caller-description">
                Clinic Assistant's AI voice assistant
              </p>
              <div
                className="call-activity"
                data-speaking={
                  voice.active && voice.status.startsWith("Speaking")
                }
              >
                <div className="call-activity-bars" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span key={bar} />
                  ))}
                </div>
                <p aria-live="polite">
                  {voice.connecting
                    ? "Connecting your call..."
                    : voice.active
                      ? voice.status.startsWith("Connection interrupted")
                        ? voice.status
                        : voice.muted
                          ? "Microphone muted"
                          : voice.status.startsWith("Saying goodbye")
                            ? "Mira is saying goodbye"
                            : voice.status.startsWith("Speaking")
                              ? "Mira is speaking"
                              : voice.status.startsWith("Thinking")
                                ? "Mira is working on it"
                                : "Your turn. Mira is listening."
                      : "A little conversation. A lot taken care of."}
                </p>
              </div>
              <div className="workspace-actions call-controls">
                {voice.active || voice.connecting ? (
                  <button
                    className="primary-action end-call"
                    onClick={voice.stop}
                  >
                    <PhoneOff size={22} />
                    End call
                  </button>
                ) : (
                  <button
                    className="primary-action start-call"
                    disabled={loading || busy || changingLanguage}
                    onClick={() => {
                      setError("");
                      void voice.start();
                    }}
                  >
                    <Phone size={17} />
                    Start voice conversation
                  </button>
                )}
                {voice.active && (
                  <button
                    className="call-mute"
                    onClick={voice.toggleMute}
                    aria-pressed={voice.muted}
                  >
                    {voice.muted ? <MicOff size={21} /> : <Mic size={21} />}{" "}
                    {voice.muted ? "Unmute" : "Mute"}
                  </button>
                )}
                {voice.active && (
                  <button
                    className="call-speaker"
                    onClick={voice.toggleSpeaker}
                    aria-pressed={voice.speakerMuted}
                    aria-label={
                      voice.speakerMuted ? "Unmute speaker" : "Mute speaker"
                    }
                  >
                    {voice.speakerMuted ? (
                      <VolumeX size={21} />
                    ) : (
                      <Volume2 size={21} />
                    )}
                    {voice.speakerMuted ? "Sound off" : "Speaker"}
                  </button>
                )}
              </div>
              <p className="voice-footnote">
                {voice.active
                  ? voice.muted
                    ? "Your microphone is muted."
                    : "You can interrupt naturally. We're listening."
                  : "Microphone access is requested when you start."}
              </p>
            </div>
            {display.page === "reception" && (
              <div className="workspace-transcript">
                <div className="workspace-toolbar">
                  <h2>{voice.active ? "Live transcript" : "Conversation"}</h2>
                  <small>
                    {user ? "Saved to your account" : "Guest conversation"}
                  </small>
                </div>
                <div
                  className="message-scroll"
                  ref={transcript}
                  aria-live="polite"
                  role="log"
                >
                  {!messages.length ? (
                    <div className="empty-conversation">
                      <span className="eyebrow">A LITTLE INSPIRATION</span>
                      <h3>What can we help with?</h3>
                      <p>Start a call, or try a message below.</p>
                      <div className="conversation-starters">
                        {[
                          [
                            "Book a consultation",
                            "Help me book a skin consultation.",
                          ],
                          [
                            "See my calendar",
                            "Show my appointments in calendar view.",
                          ],
                          ["Explore the assistant", "What can you do for me?"],
                        ].map(([label, prompt]) => (
                          <button
                            key={label}
                            type="button"
                            disabled={
                              loading ||
                              busy ||
                              voice.active ||
                              voice.connecting
                            }
                            onClick={() => void send(prompt)}
                          >
                            {label}
                            <span aria-hidden="true">↗</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div key={i} className={`workspace-message ${m.role}`}>
                        <small>{m.role === "user" ? "You" : "Mira"}</small>
                        <p dir="auto">{m.content}</p>
                      </div>
                    ))
                  )}
                  {processingLabel && (
                    <div
                      className="mira-processing"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="mira-processing-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>{processingLabel}</span>
                    </div>
                  )}
                </div>
                <form
                  className="workspace-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input
                    aria-label="Message the assistant"
                    dir="auto"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      voice.active
                        ? "Voice call is active"
                        : "Type a message..."
                    }
                    maxLength={3000}
                    disabled={voice.active || voice.connecting || busy}
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={
                      !input.trim() || busy || voice.active || voice.connecting
                    }
                  >
                    <Send size={18} />
                  </button>
                </form>
                <p className="composer-hint">
                  Replies in {replyLanguage}. Your messages can be in any
                  language.
                </p>
              </div>
            )}
          </section>
          {display.page !== "reception" && (
            <form
              className="workspace-composer global-composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <input
                aria-label="Ask the assistant from this page"
                placeholder="Ask the AI to do something on this page..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={voice.active || busy}
              />
              <button disabled={!input.trim() || voice.active || busy}>
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => setDisplay({ page: "reception" })}
              >
                View conversation
              </button>
            </form>
          )}
          {receipt && (
            <section
              className="action-receipt workspace-panel"
              aria-label="Action receipt"
              role="status"
            >
              <span className="eyebrow">CONFIRMED</span>
              <h2>{receipt.title}</h2>
              <p>{receipt.summary}</p>
              <dl>
                {receipt.fields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="workspace-actions">
                {[
                  "book",
                  "reschedule",
                  "cancel",
                  "request_reschedule",
                ].includes(receipt.action) && (
                  <button
                    onClick={() =>
                      setDisplay({
                        page:
                          user?.role === "doctor" ? "doctor" : "appointments",
                        mode: "list",
                      })
                    }
                  >
                    View appointments
                  </button>
                )}
                <button onClick={() => setReceipt(undefined)}>
                  Dismiss receipt
                </button>
              </div>
            </section>
          )}
          {credentials && (
            <section
              className="credentials-card"
              aria-label="Private account credentials"
            >
              <h2>Save your login details</h2>
              <p>
                Your current session continues. Use these details next time. The
                password is only shown in this session.
              </p>
              <p>
                <strong>Email:</strong> {credentials.email}
              </p>
              <p>
                <strong>Temporary password:</strong>{" "}
                <code>{credentials.password}</code>
              </p>
              <p>
                You can change it in My account. No email or text message has
                been sent.
              </p>
              <button onClick={() => setCredentials(undefined)}>
                I saved these details
              </button>
            </section>
          )}
          {pending && (
            <section className="pending-card" aria-label="Review action">
              <span className="eyebrow">REVIEW BEFORE SAVING</span>
              <h2>{pending.summary}</h2>
              <dl>
                {Object.entries(pending.details)
                  .filter(([k]) => !["action", "id", "slotId"].includes(k))
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{detailLabels[key] || key}</dt>
                      <dd>
                        {value !== null && typeof value === "object"
                          ? Object.entries(value).map(([k, v]) => (
                              <p key={k}>
                                <strong>{k}:</strong>{" "}
                                {v == null || v === ""
                                  ? "Not provided"
                                  : String(v)}
                              </p>
                            ))
                          : value == null || value === ""
                            ? "Not provided"
                            : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              <p>
                Confirm by speaking during a call, typing your approval, or
                using the button.
              </p>
              <div className="workspace-actions">
                <button
                  className="primary-action"
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  Confirm {pending.details.action.replaceAll("_", " ")}
                </button>
                <button
                  onClick={() => {
                    setPending(undefined);
                    voice.send({
                      type: "conversation.item.create",
                      item: {
                        type: "message",
                        role: "user",
                        content: [
                          {
                            type: "input_text",
                            text: "I dismissed the pending action. Do not confirm it.",
                          },
                        ],
                      },
                    });
                  }}
                >
                  Dismiss
                </button>
              </div>
            </section>
          )}
          {(display.page === "appointments" || display.page === "doctor") &&
            (user ? (
              <AppointmentWorkspace
                key={`${display.page}-${user.id}`}
                user={user}
                visits={display.page === "doctor" ? clinic : visits}
                slots={slots}
                clinic={display.page === "doctor"}
                display={display}
                onDisplay={setDisplay}
                onPrepare={(p) => void prepare(p)}
                search={
                  search?.scope ===
                  (display.page === "doctor" ? "clinic" : "mine")
                    ? search
                    : undefined
                }
                onSearch={async (query) => {
                  await applyEffect(
                    await api<ActionResult>("/api/workspace", {
                      action: "search_appointments",
                      args: {
                        query,
                        scope: display.page === "doctor" ? "clinic" : "mine",
                      },
                    }),
                  );
                }}
                onClearSearch={() => setSearch(undefined)}
              />
            ) : (
              <div className="workspace-panel">
                <h2>Sign in to see your appointments</h2>
                <button
                  className="primary-action"
                  onClick={() => {
                    authReturnTo.current = display;
                    setDisplay({ page: "account", accountSection: "signin" });
                  }}
                >
                  Sign in or create account
                </button>
              </div>
            ))}
          {display.page === "settings" && (
            <AppearanceSettings signedIn={Boolean(user)} />
          )}
          {display.page === "account" && (
            <AccountWorkspace
              key={`${user?.id || "guest"}-${display.accountSection || "profile"}-${authEmail}-${JSON.stringify([user?.name, user?.phone, user?.dateOfBirth, user?.gender])}`}
              user={user}
              initialEmail={authEmail}
              section={display.accountSection}
              onAuth={authenticate}
              onPrepare={(p) => void prepare(p)}
              onPassword={async (p) => {
                voice.stop();
                await applyEffect(
                  await api<ActionResult>("/api/auth", {
                    action: "password",
                    ...p,
                  }),
                );
              }}
            />
          )}
          {display.page === "specialists" && (
            <section className="specialist-grid">
              {doctors.map((d) => (
                <article className="workspace-panel" key={d.id}>
                  <div className="doctor-initials">{d.initials}</div>
                  <h2>{d.name}</h2>
                  <p>{d.title}</p>
                  <p>{d.department}</p>
                  <button onClick={() => setDisplay({ page: "appointments" })}>
                    Browse appointments
                  </button>
                </article>
              ))}
            </section>
          )}
          <details
            className="behind-scenes"
            open={display.behindScenes || undefined}
          >
            <summary>Behind the scenes: how this voice AI works</summary>
            <div className="behind-grid">
              <article>
                <h3>1. Direct voice conversation</h3>
                <p>
                  Your microphone connects to OpenAI Realtime over WebRTC. Audio
                  goes into the model and speech comes back directly. Transcript
                  events make the conversation readable.
                </p>
              </article>
              <article>
                <h3>2. Natural turn-taking</h3>
                <p>
                  Semantic voice activity detection estimates when you finish
                  speaking. You can interrupt and switch among languages the
                  model supports. Replies follow your selected Reply language,
                  which defaults to English. Accuracy varies by language,
                  accent, and noise.
                </p>
              </article>
              <article>
                <h3>3. Tools with your permissions</h3>
                <p>
                  The model calls the same server actions as the UI. The server
                  checks your session, role, appointment ownership, and
                  availability. Changes are prepared for your confirmation.
                </p>
              </article>
              <article>
                <h3>4. Memory for your account</h3>
                <p>
                  Up to 200 recent transcript messages are saved privately in
                  Supabase. Recent messages provide context on your next visit.
                  Doctors cannot read another user's chat history. Clear your
                  history in My account.
                </p>
              </article>
            </div>
            <p>
              Typed conversations use the OpenAI Responses API. Voice uses{" "}
              {"gpt-realtime-2"} by default. This is a fictional scheduling
              demo, not a medical consultation.
            </p>
            <details className="mira-activity" open>
              <summary>
                What Mira is doing{traces.length ? ` (${traces.length})` : ""}
              </summary>
              <p>
                Recent AI actions on this page. Updates after each action
                finishes.
              </p>
              {responseMs !== undefined && (
                <p>
                  Last text reply took {(responseMs / 1000).toFixed(1)} seconds,
                  including AI processing.
                </p>
              )}
              {!traces.length ? (
                <div className="mira-activity-empty">
                  <strong>No actions yet</strong>
                  <p>
                    Ask Mira to show your calendar or check available
                    appointments. The actions and results will appear here.
                  </p>
                </div>
              ) : (
                <ul
                  className="mira-activity-list"
                  aria-label="Recent AI actions"
                >
                  {traces
                    .slice()
                    .reverse()
                    .map((t, i) => (
                      <li
                        key={i}
                        className={`mira-activity-item is-${t.status}`}
                      >
                        <div>
                          <strong>{t.label}</strong>
                          <span className="mira-activity-status">
                            {t.status === "review"
                              ? "Awaiting approval"
                              : t.status === "signin"
                                ? "Sign-in needed"
                                : t.status === "failed"
                                  ? "Unsuccessful"
                                  : "Completed"}
                          </span>
                        </div>
                        <p>{t.detail}</p>
                        <small>
                          {t.source === "voice" ? "Voice" : "Text"} request ·{" "}
                          {t.durationMs < 1000
                            ? `${t.durationMs} ms`
                            : `${(t.durationMs / 1000).toFixed(1)} s`}
                        </small>
                      </li>
                    ))}
                </ul>
              )}
              <small>
                Latest 50 actions, newest first. Resets on refresh. Timing
                covers action processing, not the full spoken reply.
              </small>
            </details>
          </details>
          <footer className="workspace-footer">
            <span>
              Clinic Assistant - Built by{" "}
              <a
                href="https://yashjobalia.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Yash Jobalia
              </a>
            </span>{" "}
            <span>Fictional scheduling demo - America/Chicago</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
