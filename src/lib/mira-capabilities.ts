import type { Session } from "./server";
import { semanticCatalog } from "./semantic/catalog";

export function miraCapabilities(user: Pick<Session, "guest" | "role">) {
  return {
    ontology: semanticCatalog(user),
    assistant: "Mira",
    identity: user.guest ? "guest" : user.role || "patient",
    pages: [
      "Voice demo",
      "My appointments: list/calendar, all/upcoming/past/cancelled/reschedule requests",
      "Our specialists",
      "My account: profile, password, sign out",
      "Settings: light, dark or system appearance",
      ...(user.role === "doctor" && !user.guest
        ? ["Doctor panel: clinic appointment list/calendar and intake notes"]
        : []),
    ],
    publicActions: [
      "Explain this website and the voice pipeline",
      "Read the specialist directory and live availability",
      "Look up an account by exact email or full international phone, limited to 10 checks per session per hour",
      "Open private sign-in or manual signup",
      "Open password recovery or request a reset email after reviewing the exact address and confirming; delivery is not guaranteed",
      "Guide new patient registration with name, DOB, email, phone and explicit confirmation",
    ],
    permittedActions: user.guest
      ? []
      : [
          "Read own profile and appointment history",
          "Leave a confirmed summary in own appointment notes for the doctor to review; no email/SMS or read receipt",
          "Search own appointments by name, exact email, full phone, appointment reference or doctor ID",
          "Book a visit for self, except with self as doctor",
          "Reschedule own upcoming confirmed appointment",
          "Cancel own upcoming confirmed appointment",
          "Update own name, DOB, phone and optional gender",
          "Generate a new private password after confirmation",
          "Clear own conversation history",
          "Sign out",
          ...(user.role === "doctor"
            ? [
                "Read/search clinic appointments, including contact matching",
                "Read appointment intake notes",
                "Read patient messages attached to appointments in visit notes",
                "Cancel clinic appointments with optional reason",
                "Request patient rescheduling with optional reason",
              ]
            : []),
        ],
    boundaries: [
      "Account lookup returns only an exact contact match status, never profile details, password retrieval or authentication",
      "No access to another user's private conversation",
      "No self-assigned doctor roles or identity switching through conversation",
      "Doctors cannot edit another patient's profile/password or directly move their appointment",
      "Changes require review and confirmation; a draft does not reserve a slot",
      "No appointment email/SMS notifications, live human transfer, billing or insurance processing; password reset emails are requested through Supabase Auth",
      "No medical diagnosis, prescriptions or real clinic address",
      "Browser microphone permission, private password entry and PWA installation require the user",
      "The Reply language dropdown controls output; input language stays automatic",
      "Service failures must be explained accurately, with a retry or supported alternative",
    ],
    memory:
      "Recent transcript messages are saved per user, up to 200; recent context is supplied to Mira. Audio is processed by OpenAI but not stored in the Clinic Assistant database.",
    voice:
      "Direct OpenAI Realtime WebRTC audio with semantic turn detection, interruption support, parallel transcript events and server-validated tools. Typed chat uses Responses API. Tools enforce the same permissions as manual controls.",
    pwa: "Installable on supported browsers. Offline mode offers a reconnect page; voice, accounts and scheduling require internet.",
  };
}
