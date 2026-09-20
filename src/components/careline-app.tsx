"use client";
import { newPasswordAttributes, PASSWORD_HINT } from "@/lib/password";
import { useHandsFreeVoice } from "./use-hands-free-voice";
import { ConversationLab } from "./conversation-lab";
import { isBackchannel } from "@/lib/voice-activity";
import {
  type ChatResult,
  type Language,
  type Preferences,
  type TurnMetric,
  type Handoff,
  type Source,
} from "@/lib/conversation";
import { speechSource } from "@/lib/stream-speech";
import type { Registration } from "@/lib/patient";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  LayoutDashboard,
  LogOut,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  departments,
  doctors,
  doctorFor,
  formatSlot,
  greeting,
  type Appointment,
  type Message,
  type Proposal,
  type Slot,
} from "@/lib/clinic";
type User = { id: string; email: string; name: string; patientId?: string };
type View = "reception" | "appointments" | "specialists" | "account";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function CarelineApp() {
  const [language, setLanguage] = useState<Language>("auto");
  const [pauseMs, setPauseMs] = useState(1000);
  const [turns, setTurns] = useState<TurnMetric[]>([]);
  const [preferences, setPreferences] = useState<Preferences>();
  const [handoff, setHandoff] = useState<Handoff>();
  const [sources, setSources] = useState<Source[]>([]);
  const [cancellation, setCancellation] =
    useState<ChatResult["cancellation"]>();
  const memoryToken = useRef<string | undefined>(undefined);
  const requestAbort = useRef<AbortController | null>(null);
  const interrupted = useRef(false);
  const suspended = useRef(false);
  const speechTurn = useRef<string | undefined>(undefined);
  const updateMetric = (id: string, patch: Partial<TurnMetric>) =>
    setTurns((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const [view, setView] = useState<View>("reception");
  const [user, setUser] = useState<User | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [proposal, setProposal] = useState<Proposal>();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [registration, setRegistration] = useState<Registration>();
  const [credentials, setCredentials] = useState<{
    patientId: string;
    password: string;
  }>();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [cancelId, setCancelId] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const callVersion = useRef(0);
  const sending = useRef(false);
  const speechVersion = useRef(0);
  const speechAbort = useRef<AbortController | null>(null);
  const speechAudio = useRef<HTMLAudioElement | null>(null);
  const speechUrl = useRef<string | null>(null);
  const stopSpeech = useCallback(() => {
    suspended.current = false;
    speechVersion.current++;
    speechAbort.current?.abort();
    speechAbort.current = null;
    if (speechAudio.current) {
      speechAudio.current.onended = null;
      speechAudio.current.onerror = null;
      speechAudio.current.pause();
      speechAudio.current.removeAttribute("src");
      speechAudio.current = null;
    }
    if (speechUrl.current) URL.revokeObjectURL(speechUrl.current);
    speechUrl.current = null;
  }, []);
  const voice = useHandsFreeVoice({
    active: active && view === "reception",
    paused: busy,
    pauseMs,
    speaking,
    onSpeechStart: () => {
      if (speechAudio.current || speechAbort.current) {
        const started = performance.now();
        suspended.current = true;
        interrupted.current = true;
        speechAudio.current?.pause();
        if (speechTurn.current)
          updateMetric(speechTurn.current, {
            interruptionStopMs: performance.now() - started,
          });
      }
      setSpeaking(false);
    },
    onAudio: transcribeTurn,
    onError: setError,
  });
  const refresh = useCallback(async () => {
    const clinic = await api<{ slots: Slot[]; liveReady: boolean }>(
      "/api/clinic",
    );
    setSlots(clinic.slots);
  }, []);
  const refreshBookings = useCallback(async () => {
    const result = await api<{ appointments: Appointment[] }>(
      "/api/appointments",
    );
    setBookings(result.appointments);
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      api<{ user: User | null; liveReady: boolean }>("/api/auth"),
      api<{ slots: Slot[]; liveReady: boolean }>("/api/clinic"),
    ])
      .then(([auth, clinic]) => {
        if (!mounted) return;
        setUser(auth.user);
        setProfileName(auth.user?.name || "");
        setSlots(clinic.slots);
        if (auth.user) {
          void refreshBookings().catch((e) => setError(e.message));
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshBookings]);
  useEffect(() => {
    transcript.current?.scrollTo({
      top: transcript.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSeconds((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(
    () => () => {
      callVersion.current++;
      requestAbort.current?.abort();
      stopSpeech();
    },
    [stopSpeech],
  );
  async function speak(
    text: string,
    metricId?: string,
    speechEndedAt?: number,
  ) {
    const speechStarted = performance.now();
    stopSpeech();
    if (muted) {
      setSpeaking(false);
      return;
    }
    speechTurn.current = metricId;
    const version = speechVersion.current;
    const controller = new AbortController();
    speechAbort.current = controller;
    setSpeaking(true);
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.replace(/[*#]/g, ""), language }),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "Voice playback is unavailable. You can still read and type messages.",
        );
      const source = await speechSource(response, controller.signal);
      if (version !== speechVersion.current) {
        URL.revokeObjectURL(source.url);
        return;
      }
      const url = source.url;
      speechUrl.current = url;
      const audio = new Audio(url);
      speechAudio.current = audio;
      let measured = false;
      audio.onplaying = () => {
        if (suspended.current) {
          audio.pause();
          return;
        }
        if (!measured && metricId) {
          measured = true;
          updateMetric(metricId, {
            speechStartMs: performance.now() - speechStarted,
            ...(speechEndedAt === undefined
              ? {}
              : { responseLatencyMs: performance.now() - speechEndedAt }),
          });
        }
      };
      audio.onended = () => {
        if (version !== speechVersion.current) return;
        stopSpeech();
        setSpeaking(false);
      };
      audio.onerror = () => {
        if (version !== speechVersion.current) return;
        stopSpeech();
        setSpeaking(false);
        setError(
          "Voice playback failed. You can still read and type messages.",
        );
      };
      await Promise.all([
        source.load(),
        suspended.current ? Promise.resolve() : audio.play(),
      ]);
    } catch (error) {
      if (version !== speechVersion.current) return;
      stopSpeech();
      setSpeaking(false);
      setError(
        error instanceof Error
          ? error.message
          : "Could not play the voice response.",
      );
    }
  }
  function endCall() {
    requestAbort.current?.abort();
    voice.stop();
    speechVersion.current++;
    callVersion.current++;
    setActive(false);
    setSpeaking(false);
    setBusy(false);
    sending.current = false;
    stopSpeech();
  }
  async function startCall() {
    voice.stop();
    setBusy(true);
    setError("");
    try {
      await api("/api/session", "POST", {});
      await voice.start();
      setActive(true);
      setSeconds(0);
      const hello = messages.length
        ? "I'm listening. We can continue our conversation by voice."
        : user
          ? "Welcome back to Clinic Assistant. What brings you in today?"
          : greeting;
      setMessages((v) =>
        v.length ? v : [{ role: "assistant", content: hello }],
      );
      setChoices([]);
      setNotice("");
      setActions([]);
      speak(hello);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function resetConversation() {
    endCall();
    setProposal(undefined);
    setRegistration(undefined);
    setChoices([]);
    setMessages([]);
    memoryToken.current = undefined;
    interrupted.current = false;
    setPreferences(undefined);
    setHandoff(undefined);
    setCancellation(undefined);
    setSources([]);
    setTurns([]);
    setError("");
    setNotice("");
  }
  function openAuth() {
    setAuthError("");
    dialog.current?.showModal();
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ needsConfirmation: boolean }>(
        "/api/auth",
        "POST",
        {
          action: authMode,
          email: form.get("email"),
          password: form.get("password"),
          ...(authMode === "signup" ? { name: form.get("name") } : {}),
        },
      );
      if (result.needsConfirmation) {
        setAuthError(
          "Check your email to confirm your account, then return here and sign in.",
        );
        setAuthMode("signin");
        return;
      }
      const auth = await api<{ user: User }>("/api/auth");
      setUser(auth.user);
      setProfileName(auth.user.name);
      resetConversation();
      dialog.current?.close();
      await refreshBookings();
      setNotice(
        "You’re signed in. Your appointments will be saved to your account.",
      );
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setAuthBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("/api/auth", "POST", { action: "signout" });
      resetConversation();
      setUser(null);
      setMessages([]);
      setProposal(undefined);
      setBookings([]);
      setCredentials(undefined);
      setRegistration(undefined);
      setView("reception");
      setNotice("You’ve been signed out.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send(
    text: string,
    voiceTiming?: {
      endedAt: number;
      endpointMs: number;
      transcriptionMs: number;
    },
  ) {
    if (!text.trim() || sending.current) return;
    sending.current = true;
    const version = callVersion.current;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    const started = performance.now();
    const metricId = crypto.randomUUID();
    setTurns((rows) =>
      [
        ...rows,
        {
          id: metricId,
          mode: voiceTiming ? ("voice" as const) : ("text" as const),
          status: "ok" as const,
          chatMs: 0,
          ...(voiceTiming
            ? {
                transcriptionMs: voiceTiming.transcriptionMs,
                endpointMs: voiceTiming.endpointMs,
              }
            : {}),
        },
      ].slice(-50),
    );
    setBusy(true);
    setError("");
    setInput("");
    setProposal(undefined);
    setRegistration(undefined);
    setCancellation(undefined);
    setHandoff(undefined);
    setSources([]);
    setChoices([]);
    stopSpeech();
    setSpeaking(false);
    const updated = [
      ...messages,
      { role: "user" as const, content: text.trim() },
    ];
    setMessages(updated);
    try {
      const result = await api<ChatResult>(
        "/api/chat",
        "POST",
        {
          messages: updated.slice(-24),
          language,
          memoryToken: memoryToken.current,
          interrupted: interrupted.current,
        },
        controller.signal,
      );
      if (version !== callVersion.current) return;
      setMessages([...updated, { role: "assistant", content: result.text }]);
      setProposal(result.proposal);
      setRegistration(result.registration);
      setActions(result.actions);
      memoryToken.current = result.memoryToken;
      interrupted.current = false;
      setPreferences(result.preferences);
      setHandoff(result.handoff);
      setCancellation(result.cancellation);
      setSources(result.sources || []);
      updateMetric(metricId, {
        chatMs: performance.now() - started,
        diagnostics: result.diagnostics,
      });
      if (active) void speak(result.text, metricId, voiceTiming?.endedAt);
    } catch (e) {
      if (version === callVersion.current) {
        updateMetric(metricId, {
          status: "error",
          chatMs: performance.now() - started,
        });
        if (!controller.signal.aborted) setError((e as Error).message);
      }
    } finally {
      if (version === callVersion.current) {
        setBusy(false);
        sending.current = false;
      }
    }
  }
  async function confirmBooking() {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = await api<{ code: string }>(
        "/api/appointments",
        proposal.replaces ? "PATCH" : "POST",
        { token: proposal.token },
      );
      setProposal(undefined);
      setChoices([]);
      const text = `${proposal.replaces ? "Your appointment has been rescheduled" : "Your appointment is confirmed"}. Your appointment code is ${confirmed.code}. You can find it in My appointments.`;
      setMessages((v) => [...v, { role: "assistant", content: text }]);
      setNotice(`Appointment confirmed. Code: ${confirmed.code}`);
      if (active)
        speak(text.replace(confirmed.code, confirmed.code.split("").join(" ")));
      await Promise.all([refresh(), refreshBookings()]).catch(() => {
        setError(
          "Your appointment was saved, but the appointment list could not refresh. Reload to see it.",
        );
      });
    } catch (e) {
      setError((e as Error).message);
      void refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function transcribeTurn(
    audio: Blob,
    timing: { endedAt: number; endpointMs: number },
  ) {
    const version = callVersion.current;
    if (!active || busy || sending.current) return;
    const started = performance.now();
    const controller = new AbortController();
    requestAbort.current = controller;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("language", language);
      const type = audio.type.split(";")[0];
      data.set(
        "audio",
        audio,
        `recording.${type === "audio/mp4" ? "mp4" : type === "audio/ogg" ? "ogg" : "webm"}`,
      );
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      const result = await response.json();
      if (version !== callVersion.current) return;
      if (!response.ok)
        throw new Error(result.error || "Could not transcribe that turn.");
      if (
        interrupted.current &&
        (!result.text?.trim() || isBackchannel(result.text))
      ) {
        suspended.current = false;
        interrupted.current = false;
        if (speechAudio.current) {
          await speechAudio.current.play();
          setSpeaking(true);
        }
      } else if (result.text?.trim())
        await send(result.text, {
          ...timing,
          transcriptionMs: performance.now() - started,
        });
    } catch (e) {
      if (version === callVersion.current && !controller.signal.aborted) {
        stopSpeech();
        setSpeaking(false);
        voice.stop();
        setError((e as Error).message);
      }
    } finally {
      if (version === callVersion.current) setBusy(false);
    }
  }
  async function confirmRegistration() {
    if (!registration || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        patientId: string;
        password: string;
        user: User | null;
        needsSignIn: boolean;
      }>("/api/registration", "POST", {
        token: registration.token,
        confirmed: true,
      });
      setCredentials({
        patientId: result.patientId,
        password: result.password,
      });
      setUser(result.user);
      setProfileName(result.user?.name || "");
      setRegistration(undefined);
      const text = result.needsSignIn
        ? "Your demo account is created. Please sign in using the patient ID and password shown on screen."
        : "Your demo patient account is created. What brings you in today?";
      setMessages((v) => [...v, { role: "assistant", content: text }]);
      if (active) speak(text);
      if (result.user) await refreshBookings();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancelBooking() {
    if (!cancelId) return;
    setBusy(true);
    try {
      await api("/api/appointments", "DELETE", { id: cancelId });
      cancelDialog.current?.close();
      setCancelId(undefined);
      setCancellation(undefined);
      setMessages((rows) => [
        ...rows,
        { role: "assistant", content: "Your appointment has been cancelled." },
      ]);
      setNotice("Appointment cancelled.");
      await Promise.all([refreshBookings(), refresh()]).catch(() => {
        setError(
          "Your appointment was cancelled, but the list could not refresh. Reload to see it.",
        );
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visibleBookings = bookings;
  const available = slots;
  const nav = [
    { id: "reception" as const, label: "Voice demo", icon: Headphones },
    {
      id: "appointments" as const,
      label: "My appointments",
      icon: CalendarDays,
    },
    { id: "specialists" as const, label: "Our specialists", icon: Stethoscope },
    { id: "account" as const, label: "My account", icon: UserRound },
  ];
  const status = voice.hearingSpeech
    ? "I'm listening"
    : busy
      ? "Thinking..."
      : speaking
        ? "Your receptionist is speaking"
        : active
          ? registration || proposal
            ? "Review and confirm below"
            : voice.listening
              ? "Listening - go ahead"
              : "Microphone paused"
          : "Ready when you are";
  return (
    <div className="app-shell">
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
              onClick={() => setView(n.id)}
              className={`nav-item ${view === n.id ? "selected" : ""}`}
              aria-current={view === n.id ? "page" : undefined}
            >
              <n.icon size={19} />
              {n.label}
              {view === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          Built by Yash Jobalia
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Clinic Assistant <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">AI DEMO</span>
            {user ? (
              <button className="user-pill" onClick={() => setView("account")}>
                <span className="avatar-small">
                  {(user.name || user.email).slice(0, 1).toUpperCase()}
                </span>
                <span>{user.name || "My account"}</span>
              </button>
            ) : (
              <Button variant="outline" size="sm" onClick={openAuth}>
                Sign in <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">VOICE &amp; CONVERSATIONAL AI</div>
              <h1>
                {view === "reception"
                  ? "Try the voice agent."
                  : view === "appointments"
                    ? "My appointments"
                    : view === "specialists"
                      ? "Our specialists"
                      : "My account"}
              </h1>
              <p>
                {view === "reception"
                  ? "Speak naturally, change your mind, or switch languages. Try it with a fictional appointment."
                  : view === "appointments"
                    ? "Review your upcoming visits and manage your demo appointments."
                    : view === "specialists"
                      ? "Browse the fictional physicians available in this demo."
                      : "Manage your profile and keep your appointments connected."}
              </p>
            </div>
          </div>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert alert-success" role="status">
              <CheckCircle2 size={17} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "reception" && (
            <>
              {sources.length > 0 && (
                <div className="source-cards" aria-label="Clinic sources">
                  {sources.map((source) => (
                    <a
                      key={source.id}
                      href={source.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source: {source.title} ↗
                    </a>
                  ))}
                </div>
              )}
              {handoff && (
                <Card className="handoff-card">
                  <h3>Staff-handoff preview</h3>
                  <p>
                    No staff have been contacted. This preview stays in this
                    browser session.
                  </p>
                  <dl>
                    <dt>Reason</dt>
                    <dd>{handoff.reason}</dd>
                    <dt>Summary</dt>
                    <dd>{handoff.summary}</dd>
                    <dt>Still needed</dt>
                    <dd>{handoff.unresolved}</dd>
                  </dl>
                  <Button
                    variant="outline"
                    onClick={() => setHandoff(undefined)}
                  >
                    Dismiss preview
                  </Button>
                </Card>
              )}
              {cancellation && (
                <Card className="proposal">
                  <div>
                    <h3>Review cancellation</h3>
                    <p>{cancellation.label}</p>
                    <small>Your appointment is still confirmed.</small>
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setCancelId(cancellation.id);
                      cancelDialog.current?.showModal();
                    }}
                  >
                    Review cancellation
                  </Button>
                </Card>
              )}
              {credentials && (
                <Card className="proposal">
                  <div>
                    <h3>Your demo patient account</h3>
                    <p>Save these details to sign in again.</p>
                    <p>
                      Patient ID: <strong>{credentials.patientId}</strong>
                    </p>
                    <p>
                      Demo password: <strong>{credentials.password}</strong>
                    </p>
                    <small>
                      Fictional demo accounts only. Do not use real patient
                      information.
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setCredentials(undefined)}
                  >
                    Dismiss credentials
                  </Button>
                </Card>
              )}
              {registration && (
                <Card className="proposal">
                  <div>
                    <h3>Confirm your patient account</h3>
                    <p>Name: {registration.name}</p>
                    <p>Date of birth: {registration.dateOfBirth}</p>
                    <small>
                      Confirm to save these fictional details and create your
                      demo account.
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setRegistration(undefined);
                      setMessages((v) => [
                        ...v,
                        {
                          role: "assistant",
                          content:
                            "No account was created. Tell me what you would like to change, or ask me a clinic question.",
                        },
                      ]);
                    }}
                  >
                    Not now
                  </Button>
                  <Button disabled={busy} onClick={confirmRegistration}>
                    Confirm account
                  </Button>
                </Card>
              )}
              <div className="reception-grid">
                <Card className="call-card">
                  <div className="card-top">
                    <span className="overline">
                      <Headphones size={15} /> VOICE AGENT
                    </span>
                    <span className="availability">
                      <span className="online-dot" />
                      {active ? "Connected" : "Available"}
                    </span>
                  </div>
                  <div className="call-center">
                    <div
                      className={`voice-orbit ${voice.hearingSpeech || speaking ? "pulsing" : ""}`}
                    >
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="voice-core">
                        <div className="waveform">
                          {[16, 30, 45, 26, 54, 36, 20].map((h, i) => (
                            <i
                              key={i}
                              style={{
                                height: h,
                                animationDelay: `${i * 0.12}s`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="orbit-star">
                        <Sparkles size={17} />
                      </span>
                    </div>
                    <h2>{status}</h2>
                    <p>
                      {active
                        ? "Speak naturally, or type in the conversation panel."
                        : "Try asking for a time, then change the day or doctor."}
                    </p>
                    <div className="call-duration">
                      {active
                        ? `${Math.floor(seconds / 60)
                            .toString()
                            .padStart(
                              2,
                              "0",
                            )}:${(seconds % 60).toString().padStart(2, "0")}`
                        : "No sign-in needed to try it."}
                    </div>
                    <div className="call-controls">
                      {active ? (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={
                              muted
                                ? "Enable spoken responses"
                                : "Mute spoken responses"
                            }
                            onClick={() => {
                              setMuted((v) => !v);
                              stopSpeech();
                              setSpeaking(false);
                            }}
                          >
                            {muted ? (
                              <VolumeX size={20} />
                            ) : (
                              <Volume2 size={20} />
                            )}
                          </Button>
                          <Button
                            className={voice.enabled ? "recording-button" : ""}
                            onClick={() =>
                              voice.enabled ? voice.stop() : void voice.start()
                            }
                          >
                            {voice.enabled ? (
                              <Mic size={19} />
                            ) : (
                              <MicOff size={19} />
                            )}
                            {voice.enabled
                              ? "Mute microphone"
                              : "Enable microphone"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            aria-label="End call"
                            onClick={endCall}
                          >
                            <PhoneOff size={20} />
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={startCall}
                          disabled={busy || loading}
                          className="start-call"
                        >
                          <Phone size={18} />
                          Start conversation
                          <ArrowRight size={17} />
                        </Button>
                      )}
                    </div>
                    <span className="audio-note">
                      {active
                        ? "Hands-free: pause briefly when you finish speaking. Listening resumes after each reply."
                        : "Allow microphone access to talk hands-free. You can also type."}
                    </span>
                  </div>
                  <div className="call-footer">
                    <ShieldCheck size={16} />
                    <span>
                      Demo only. Use fictional patient details. No medical
                      advice.
                    </span>
                  </div>
                </Card>
                <Card className="conversation-card">
                  <div className="card-top">
                    <h2>Conversation</h2>
                    <span className="transcript-tag">LIVE TRANSCRIPT</span>
                  </div>
                  <div
                    className="transcript"
                    ref={transcript}
                    role="log"
                    aria-live="polite"
                    aria-label="Conversation transcript"
                  >
                    {messages.length === 0 ? (
                      <div className="conversation-empty">
                        <span>
                          <Headphones size={26} />
                        </span>
                        <h3>Start a conversation</h3>
                        <p>
                          Type a message below, or start a voice conversation.
                        </p>
                        <div className="example-query">
                          “I’d like to see a dermatologist.”
                        </div>
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div className={`message ${m.role}`} key={i}>
                          <span className="message-label">
                            {m.role === "assistant" ? "CLINIC ASSISTANT" : "YOU"}
                          </span>
                          <p>{m.content}</p>
                        </div>
                      ))
                    )}
                    {busy && (
                      <div className="thinking">
                        <span />
                        <span />
                        <span /> One moment…
                      </div>
                    )}
                    {choices.length > 0 && !busy && (
                      <div className="quick-replies">
                        {choices.map((c) => (
                          <button key={c} onClick={() => void send(c)}>
                            {c}
                            <ArrowRight size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                    {actions.map((a, i) => (
                      <div className="tool-action" key={`${a}-${i}`}>
                        <Check size={13} />
                        {a}
                      </div>
                    ))}
                  </div>
                  <form
                    className="message-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(input);
                    }}
                  >
                    <input
                      aria-label="Message the receptionist"
                      placeholder="Type a message..."
                      value={input}
                      maxLength={1000}
                      onChange={(e) => setInput(e.target.value)}
                    />
                    <Button
                      size="icon"
                      aria-label="Send message"
                      disabled={busy || !input.trim()}
                    >
                      <Send size={17} />
                    </Button>
                  </form>
                </Card>
              </div>
              {proposal && (
                <Card className="proposal">
                  <div className="proposal-icon">
                    <CalendarDays size={25} />
                  </div>
                  <div>
                    <span className="overline">
                      {proposal.replaces
                        ? "REVIEW YOUR RESCHEDULE"
                        : "REVIEW YOUR APPOINTMENT"}
                    </span>
                    {proposal.replaces && (
                      <p>
                        Moving from {formatSlot(proposal.replaces.slot)}. Your
                        original appointment stays confirmed until this move
                        succeeds.
                      </p>
                    )}
                    <h3>{doctorFor(proposal.slot.doctor_id)?.name}</h3>
                    <p>
                      {formatSlot(proposal.slot)} · {proposal.patientName}
                    </p>
                    <small>
                      Demo booking - saved to your account after confirmation
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setProposal(undefined);
                      setChoices([]);
                      setMessages((v) => [
                        ...v,
                        {
                          role: "assistant",
                          content:
                            "What would you like to change about this appointment?",
                        },
                      ]);
                    }}
                  >
                    Change details
                  </Button>
                  <Button onClick={confirmBooking} disabled={busy}>
                    <Check size={16} />
                    {proposal.replaces
                      ? "Confirm reschedule"
                      : "Confirm appointment"}
                  </Button>
                </Card>
              )}
              <ConversationLab
                turns={turns}
                preferences={preferences}
                language={language}
                onLanguage={setLanguage}
                pauseMs={pauseMs}
                onPause={setPauseMs}
                onClear={() => setTurns([])}
              />
            </>
          )}
          {view === "appointments" && (
            <>
              <div className="section-heading">
                <h2>
                  My appointments{" "}
                  <span className="count-badge">{visibleBookings.length}</span>
                </h2>
                <Button onClick={() => setView("reception")}>
                  <Plus size={16} />
                  New appointment
                </Button>
              </div>
              {!user ? (
                <Card className="empty-state">
                  <UserRound size={30} />
                  <h2>Your appointments belong to you.</h2>
                  <p>Sign in to view your saved bookings.</p>
                  <Button onClick={openAuth}>Sign in</Button>
                </Card>
              ) : visibleBookings.length === 0 ? (
                <Card className="empty-state">
                  <CalendarDays size={32} />
                  <h2>Your next chapter of care starts here.</h2>
                  <p>
                    No appointments yet. Our receptionist can help you find a
                    time.
                  </p>
                  <Button onClick={() => setView("reception")}>
                    Talk to the receptionist <ArrowRight size={16} />
                  </Button>
                </Card>
              ) : (
                <div className="appointments-list">
                  {visibleBookings.map((b) => (
                    <Card key={b.id} className="appointment-row">
                      <strong aria-label="Appointment code">
                        {b.appointment_code}
                      </strong>
                      <span className="doctor-avatar">
                        {doctorFor(b.slot.doctor_id)?.initials}
                      </span>
                      <div className="appointment-detail">
                        <h3>{doctorFor(b.slot.doctor_id)?.name}</h3>
                        <p>{doctorFor(b.slot.doctor_id)?.title}</p>
                        <span>
                          <Clock3 size={14} />
                          {formatSlot(b.slot)}
                        </span>
                        <small>Patient: {b.patient_name}</small>
                      </div>
                      <span className={`status-badge ${b.status}`}>
                        {b.status === "confirmed" ? "Confirmed" : "Cancelled"}
                      </span>
                      {b.status === "confirmed" &&
                        new Date(b.slot.starts_at) > new Date() && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setCancelId(b.id);
                              cancelDialog.current?.showModal();
                            }}
                          >
                            Cancel appointment
                          </Button>
                        )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "specialists" && (
            <>
              <div className="filter-tabs">
                <button
                  className={departmentFilter === "all" ? "chosen" : ""}
                  onClick={() => setDepartmentFilter("all")}
                >
                  All specialties
                </button>
                {departments.map((d) => (
                  <button
                    key={d.id}
                    className={departmentFilter === d.id ? "chosen" : ""}
                    onClick={() => setDepartmentFilter(d.id)}
                  >
                    {d.id === "ent" ? "ENT" : d.name}
                  </button>
                ))}
              </div>
              <div className="specialist-grid">
                {doctors
                  .filter(
                    (d) =>
                      departmentFilter === "all" ||
                      d.department === departmentFilter,
                  )
                  .map((d) => (
                    <Card key={d.id} className="specialist-card">
                      <div className="specialist-top">
                        <span className="doctor-avatar large">
                          {d.initials}
                        </span>
                        <span className="availability">
                          <span className="online-dot" />
                          Demo physician
                        </span>
                      </div>
                      <h2>{d.name}</h2>
                      <p>{d.title}</p>
                      <div className="specialist-meta">
                        <CalendarDays size={16} />
                        Weekday consultations · 30 minutes
                      </div>
                      <div className="specialist-meta">
                        <Clock3 size={16} />
                        {
                          available.filter((s) => s.doctor_id === d.id).length
                        }{" "}
                        available demo slots
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setView("reception");
                          setNotice(`Ask the receptionist for ${d.name}.`);
                        }}
                      >
                        Book a consultation <ArrowRight size={15} />
                      </Button>
                    </Card>
                  ))}
              </div>
            </>
          )}
          {view === "account" &&
            (user ? (
              <Card className="account-card">
                <span className="doctor-avatar large">
                  {(user.name || user.email)[0].toUpperCase()}
                </span>
                <h2>Your profile</h2>
                <p>Your appointments are private to this account.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await api("/api/auth", "POST", {
                        action: "profile",
                        name: profileName,
                      });
                      setUser({ ...user, name: profileName });
                      setNotice("Profile updated.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Display name
                    <input
                      value={profileName}
                      minLength={2}
                      maxLength={60}
                      required
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </label>
                  <label>
                    {user.patientId ? "Patient ID" : "Email"}
                    <input value={user.patientId || user.email} disabled />
                  </label>
                  <Button disabled={busy}>Save profile</Button>
                </form>
                <Button variant="ghost" onClick={signOut}>
                  <LogOut size={16} />
                  Sign out
                </Button>
              </Card>
            ) : (
              <Card className="empty-state">
                <Users size={32} />
                <h2>A simpler way to manage your care.</h2>
                <p>
                  Create an account to save bookings and return to them anytime.
                </p>
                <Button onClick={openAuth}>
                  Sign in or create account <ArrowRight size={16} />
                </Button>
              </Card>
            ))}
          <footer className="page-footer">
            <span>Clinic Assistant · Built by Yash Jobalia</span>
            <span>Fictional scheduling demo · America/Chicago</span>
          </footer>
        </main>
      </div>
      <dialog ref={dialog} className="auth-dialog">
        <button
          className="dialog-close"
          aria-label="Close sign in"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <span className="brand-mark">
          <Plus size={25} />
        </span>
        <h2>
          {authMode === "signin" ? "Welcome back." : "Your care starts here."}
        </h2>
        <p>
          {authMode === "signin"
            ? "Sign in to manage your Clinic Assistant appointments."
            : "Create your account for this fictional clinic demo."}
        </p>
        <form onSubmit={submitAuth}>
          {authMode === "signup" && (
            <label>
              Display name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Alex Morgan"
              />
            </label>
          )}
          <label>
            {authMode === "signin" ? "Patient ID or email" : "Email address"}
            <input
              name="email"
              type="text"
              autoComplete="username"
              required
              placeholder="Patient ID or email"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                authMode === "signin" ? "current-password" : "new-password"
              }
              required
              {...(authMode === "signin"
                ? { minLength: 1, maxLength: 128 }
                : newPasswordAttributes)}
            />
          </label>
          {authMode !== "signin" && <small>{PASSWORD_HINT}</small>}
          {authError && (
            <p className="form-error" role="alert">
              {authError}
            </p>
          )}
          <Button disabled={authBusy}>
            {authBusy
              ? "One moment…"
              : authMode === "signin"
                ? "Sign in"
                : "Create account"}
            <ArrowRight size={16} />
          </Button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setAuthMode((v) => (v === "signin" ? "signup" : "signin"));
            setAuthError("");
          }}
        >
          {authMode === "signin"
            ? "New to Clinic Assistant? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </dialog>
      <dialog ref={cancelDialog} className="auth-dialog">
        <h2>Cancel this appointment?</h2>
        <p>The slot will become available for another demo booking.</p>
        <div className="dialog-actions">
          <Button
            variant="outline"
            onClick={() => cancelDialog.current?.close()}
          >
            Keep appointment
          </Button>
          <Button variant="destructive" disabled={busy} onClick={cancelBooking}>
            Confirm cancellation
          </Button>
        </div>
      </dialog>
    </div>
  );
}
