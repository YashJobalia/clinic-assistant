"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/workspace";
import type { Message } from "@/lib/clinic";
import { completedToolCalls, decodeToolArguments } from "@/lib/workspace-tool";
import { type ReplyLanguage } from "@/lib/voice-language";
import { actionActivity, type ActionActivity } from "@/lib/action-activity";
import { idleAction, explicitGoodbye } from "@/lib/call-lifecycle";
export function useRealtimeVoice(options: {
  replyLanguage: ReplyLanguage;
  onMessage: (message: Message, ownerId: string) => void;
  onEffect: (effect: ActionResult) => Promise<void>;
  beforeAction: () => Promise<void>;
  onError: (message: string) => void;
  onTrace: (activity: ActionActivity) => void;
}) {
  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });
  const [status, setStatus] = useState("Ready when you are");
  const [processing, setProcessing] = useState("");
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = performance.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [active]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const generation = useRef(0);
  const pending = useRef<{ token: string; turn: number } | null>(null);
  const turn = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const goodbyeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lifecycle = useRef({
    lastActivity: 0,
    warned: false,
    speaking: false,
    responding: false,
    userSpeaking: false,
    tools: 0,
    ending: false,
    goodbyeId: "",
  });
  const stop = useCallback(() => {
    generation.current++;
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    if (idleTimer.current) clearInterval(idleTimer.current);
    if (goodbyeTimer.current) clearTimeout(goodbyeTimer.current);
    idleTimer.current = null;
    goodbyeTimer.current = null;
    lifecycle.current = {
      lastActivity: 0,
      warned: false,
      speaking: false,
      responding: false,
      userSpeaking: false,
      tools: 0,
      ending: false,
      goodbyeId: "",
    };
    connectionTimer.current = null;
    disconnectTimer.current = null;
    abort.current?.abort();
    abort.current = null;
    channel.current?.close();
    peer.current?.close();
    stream.current?.getTracks().forEach((t) => t.stop());
    if (audio.current) {
      audio.current.pause();
      audio.current.srcObject = null;
    }
    peer.current = null;
    stream.current = null;
    channel.current = null;
    audio.current = null;
    pending.current = null;
    setActive(false);
    setConnecting(false);
    setMuted(false);
    setSpeakerMuted(false);
    setElapsedSeconds(0);
    setStatus("Ready when you are");
    setProcessing("");
  }, []);
  useEffect(() => stop, [stop]);
  const send = useCallback((event: unknown) => {
    if (channel.current?.readyState === "open")
      channel.current.send(JSON.stringify(event));
  }, []);
  const endPolitely = useCallback(
    (idle = false) => {
      if (lifecycle.current.ending || channel.current?.readyState !== "open")
        return;
      lifecycle.current.ending = true;
      setProcessing("");
      if (lifecycle.current.responding) send({ type: "response.cancel" });
      send({ type: "output_audio_buffer.clear" });
      send({
        type: "response.create",
        response: {
          metadata: { purpose: "goodbye" },
          tool_choice: "none",
          instructions: `In ${callbacks.current.replyLanguage}, say one brief, warm goodbye${idle ? ", explaining you will end the quiet call and they can return when ready" : ""}. Do not ask another question or claim any unsaved action succeeded.`,
        },
      });
      setStatus("Saying goodbye...");
      goodbyeTimer.current = setTimeout(stop, 15000);
    },
    [send, stop],
  );
  const start = useCallback(async () => {
    stop();
    const version = generation.current;
    setConnecting(true);
    setStatus("Connecting live voice...");
    connectionTimer.current = setTimeout(() => {
      if (version !== generation.current) return;
      stop();
      callbacks.current.onError(
        "Voice took too long to connect. Check microphone permission and your connection, then retry or type below.",
      );
    }, 35000);
    try {
      if (!navigator.onLine)
        throw new Error(
          "You are offline. Reconnect to start a call, or keep your message ready to send.",
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access requires HTTPS or localhost. You can continue by typing.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (version !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      media.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (version !== generation.current) return;
          stop();
          callbacks.current.onError(
            "Your microphone disconnected. Reconnect it and start a new call, or continue by typing.",
          );
        };
      });
      const pc = new RTCPeerConnection();
      peer.current = pc;
      const output = new Audio();
      output.autoplay = true;
      audio.current = output;
      pc.ontrack = (e) => {
        output.srcObject = e.streams[0];
        void output
          .play()
          .catch(() =>
            callbacks.current.onError(
              "Audio playback was blocked. End and restart the call.",
            ),
          );
      };
      media.getTracks().forEach((t) => pc.addTrack(t, media));
      let ownerId = "";
      const dc = pc.createDataChannel("oai-events");
      channel.current = dc;
      dc.onopen = () => {
        if (version !== generation.current) return;
        if (connectionTimer.current) clearTimeout(connectionTimer.current);
        connectionTimer.current = null;
        setConnecting(false);
        setActive(true);
        lifecycle.current.lastActivity = performance.now();
        idleTimer.current = setInterval(() => {
          const state = lifecycle.current;
          if (state.ending) return;
          const action = idleAction(
            performance.now() - state.lastActivity,
            state.warned,
            state.speaking ||
              state.responding ||
              state.userSpeaking ||
              state.tools > 0,
          );
          if (action === "end") endPolitely(true);
          if (action === "check_in") {
            state.warned = true;
            state.lastActivity = performance.now();
            send({
              type: "response.create",
              response: {
                tool_choice: "none",
                instructions: `In ${callbacks.current.replyLanguage}, gently ask once whether they are still there. Say you can pause and they can return later. Do not repeat intake questions.`,
              },
            });
          }
        }, 1000);
        setStatus("Listening - speak in any supported language");
        send({
          type: "response.create",
          response: {
            instructions: `Immediately offer a warm greeting and introduce yourself briefly as Mira, Clinic Assistant's AI voice assistant, in ${callbacks.current.replyLanguage}. If previous conversation exists, offer to continue or start something new without reciting private details. Otherwise ask how you can help. Do not take actions yet.`,
          },
        });
      };
      let chain = Promise.resolve();
      const handledCalls = new Set<string>();
      dc.onclose = () => {
        if (version !== generation.current) return;
        stop();
        callbacks.current.onError(
          "The voice connection closed. Start a new call or continue by typing. Check any pending action before trying it again.",
        );
      };
      dc.onmessage = (e) => {
        if (version !== generation.current) return;
        let event;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }
        const state = lifecycle.current;
        if (event.type === "response.created") {
          state.responding = true;
          if (
            !state.ending &&
            !state.speaking &&
            !state.userSpeaking &&
            !state.tools
          )
            setProcessing("Thinking...");
          if (event.response?.metadata?.purpose === "goodbye")
            state.goodbyeId = event.response.id;
        }
        if (event.type === "response.done") state.responding = false;
        if (event.type === "input_audio_buffer.speech_started") {
          turn.current++;
          state.userSpeaking = true;
          state.warned = false;
          state.lastActivity = performance.now();
          setStatus("Listening...");
          setProcessing("");
        }
        if (event.type === "input_audio_buffer.speech_stopped") {
          state.userSpeaking = false;
          state.lastActivity = performance.now();
          setStatus("Thinking...");
          if (!state.ending && !state.tools) setProcessing("Thinking...");
        }
        if (
          event.type ===
            "conversation.item.input_audio_transcription.completed" &&
          event.transcript
        ) {
          callbacks.current.onMessage(
            { role: "user", content: event.transcript },
            ownerId,
          );
          if (explicitGoodbye(event.transcript)) endPolitely();
        }
        if (
          event.type === "response.output_audio_transcript.done" &&
          event.transcript
        )
          callbacks.current.onMessage(
            {
              role: "assistant",
              content: event.transcript.replace(/[\u2013\u2014]/g, "-"),
            },
            ownerId,
          );
        if (event.type === "output_audio_buffer.started") {
          state.speaking = true;
          setProcessing("");
          setStatus(
            state.ending ? "Saying goodbye..." : "Speaking - you can interrupt",
          );
        }
        if (
          event.type === "output_audio_buffer.stopped" ||
          event.type === "output_audio_buffer.cleared"
        ) {
          state.speaking = false;
          state.lastActivity = performance.now();
          if (
            state.ending &&
            state.goodbyeId &&
            event.response_id === state.goodbyeId
          ) {
            stop();
            return;
          }
          if (!state.ending) {
            setStatus("Listening...");
            setProcessing(
              state.tools
                ? "Processing your request..."
                : state.responding
                  ? "Thinking..."
                  : "",
            );
          }
        }
        if (event.type === "error") {
          setProcessing("");
          callbacks.current.onError(
            event.error?.message || "Voice connection error.",
          );
        }
        const calls = completedToolCalls(event);
        if (event.type === "response.done" && !calls.length && !state.tools)
          setProcessing("");
        if (!calls.length || state.ending) return;
        const callTurn = turn.current;
        state.tools++;
        chain = chain
          .then(async () => {
            if (version !== generation.current) return;
            for (const call of calls) {
              if (lifecycle.current.ending) return;
              if (handledCalls.has(call.call_id)) continue;
              handledCalls.add(call.call_id);
              const tick = performance.now();
              let result: unknown;
              let action = "";
              let actionArgs: Record<string, unknown> = {};
              try {
                if (call.name !== "careline_action")
                  throw new Error("Unknown action");
                const args = decodeToolArguments(call.arguments);
                action = args.action;
                actionArgs = args.args;
                if (
                  !lifecycle.current.userSpeaking &&
                  !lifecycle.current.speaking
                )
                  setProcessing(
                    (
                      {
                        availability: "Checking availability...",
                        list_specialists: "Finding specialists...",
                        list_appointments: "Checking appointments...",
                        search_appointments: "Finding your appointment...",
                        get_account: "Checking account details...",
                        lookup_account: "Looking up your account...",
                        prepare: "Preparing your request...",
                        confirm: "Saving your confirmed request...",
                        navigate: "Opening the page...",
                      } as Record<string, string>
                    )[action] || "Processing your request...",
                  );
                if (args.action === "end_call") {
                  send({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: call.call_id,
                      output: JSON.stringify({ ending: true }),
                    },
                  });
                  endPolitely();
                  return;
                }
                if (
                  args.action === "confirm" &&
                  (!pending.current ||
                    pending.current.token !== args.token ||
                    callTurn <= pending.current.turn ||
                    callTurn !== turn.current)
                )
                  throw new Error(
                    "Ask for confirmation and wait for the next user turn first.",
                  );
                if (args.action === "confirm")
                  await callbacks.current.beforeAction();
                if (version !== generation.current || lifecycle.current.ending)
                  return;
                if (args.action === "confirm" && callTurn !== turn.current)
                  throw new Error(
                    "The user spoke again. Clarify their latest intent before confirming.",
                  );
                const r = await fetch("/api/workspace", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: args.action,
                    args: args.args,
                    token: args.token || undefined,
                  }),
                  signal: AbortSignal.timeout(20000),
                });
                const effect = await r.json();
                if (!r.ok) throw new Error(effect.error);
                if (version !== generation.current) return;
                if (effect.pending)
                  pending.current = {
                    token: effect.pending.token,
                    turn: turn.current,
                  };
                if (args.action === "confirm") pending.current = null;
                const { credentials, ...safe } = effect;
                result = {
                  ...safe,
                  ...(credentials
                    ? { credentialsDeliveredPrivately: true }
                    : {}),
                };
                try {
                  const update = callbacks.current.onEffect(effect);
                  if (credentials || effect.signedOut || effect.clearedHistory)
                    await update;
                  else
                    void update.catch(() =>
                      callbacks.current.onError(
                        "The screen could not refresh. Check the saved result before repeating changes.",
                      ),
                    );
                } catch {
                  callbacks.current.onError(
                    "The action returned a result, but the screen could not update. Refresh to check it before repeating the request.",
                  );
                }
                if (version !== generation.current) return;
              } catch (err) {
                result = {
                  error:
                    err instanceof Error &&
                    ["TimeoutError", "AbortError", "TypeError"].includes(
                      err.name,
                    )
                      ? "The action's result could not be verified because the connection failed. Do not retry changes automatically. Check appointments or account details first."
                      : err instanceof Error
                        ? err.message
                        : "Action failed",
                };
              }
              callbacks.current.onTrace(
                actionActivity(
                  action,
                  actionArgs,
                  result,
                  performance.now() - tick,
                  "voice",
                ),
              );
              send({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: call.call_id,
                  output: JSON.stringify(result),
                },
              });
            }
            if (
              calls.length &&
              !lifecycle.current.ending &&
              !lifecycle.current.responding &&
              !lifecycle.current.userSpeaking
            ) {
              setProcessing(lifecycle.current.speaking ? "" : "Thinking...");
              send({ type: "response.create" });
            }
          })
          .catch(() => {
            if (version === generation.current) setProcessing("");
            callbacks.current.onError(
              "Could not process a voice event. Please retry.",
            );
          })
          .finally(() => {
            if (version === generation.current) {
              lifecycle.current.tools--;
              lifecycle.current.lastActivity = performance.now();
              if (
                lifecycle.current.ending ||
                lifecycle.current.speaking ||
                lifecycle.current.userSpeaking
              )
                setProcessing("");
            }
          });
      };
      pc.onconnectionstatechange = () => {
        if (version !== generation.current) return;
        if (pc.connectionState === "connected") {
          if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
          disconnectTimer.current = null;
          setStatus("Listening - speak in any supported language");
        } else if (pc.connectionState === "disconnected") {
          setStatus("Connection interrupted - trying to recover...");
          if (!disconnectTimer.current)
            disconnectTimer.current = setTimeout(() => {
              if (version !== generation.current) return;
              stop();
              callbacks.current.onError(
                "Voice could not reconnect. Start a new call or continue by typing. Check pending changes before repeating them.",
              );
            }, 8000);
        } else if (pc.connectionState === "failed") {
          stop();
          callbacks.current.onError(
            "Voice disconnected. Please start a new call.",
          );
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      abort.current = new AbortController();
      const r = await fetch("/api/realtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/sdp",
          "X-Reply-Language": callbacks.current.replyLanguage,
        },
        body: offer.sdp,
        signal: abort.current.signal,
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error);
      }
      ownerId = r.headers.get("X-Careline-User") || "";
      const sdp = await r.text();
      if (version !== generation.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (e) {
      if (version !== generation.current) return;
      stop();
      callbacks.current.onError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow it in your browser's site settings, then retry. You can also type below."
          : e instanceof Error && e.name === "NotFoundError"
            ? "No microphone was found. Connect one or continue by typing."
            : e instanceof Error && e.name === "NotReadableError"
              ? "Your microphone is busy or unavailable. Close other apps using it, then retry."
              : e instanceof Error
                ? e.message
                : "Microphone unavailable. You can continue by typing.",
      );
    }
  }, [send, stop, endPolitely]);
  function toggleMute() {
    const value = !muted;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !value));
    setMuted(value);
  }
  function setDraft(token?: string) {
    pending.current = token ? { token, turn: turn.current } : null;
  }
  function toggleSpeaker() {
    if (!audio.current) return;
    audio.current.muted = !audio.current.muted;
    setSpeakerMuted(audio.current.muted);
  }
  async function updateReplyLanguage(replyLanguage: ReplyLanguage) {
    if (!active) return;
    const version = generation.current;
    const r = await fetch("/api/realtime", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyLanguage }),
    });
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || "Could not change the reply language.");
    if (version !== generation.current) return;
    if (channel.current?.readyState !== "open")
      throw new Error(
        "Voice connection is unavailable. Please restart the call.",
      );
    send({
      type: "session.update",
      session: { type: "realtime", instructions: data.instructions },
    });
  }
  return {
    status,
    processing,
    active,
    connecting,
    muted,
    speakerMuted,
    elapsedSeconds,
    toggleSpeaker,
    start,
    stop,
    endPolitely,
    toggleMute,
    send,
    setDraft,
    updateReplyLanguage,
  };
}
