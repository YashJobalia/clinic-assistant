# Clinic Assistant

Built by Yash Jobalia.

Public URL: https://clinic.yashjobalia.com

Repository: https://github.com/YashJobalia/clinic-assistant

Local folder, npm package, and Vercel project: `clinic-assistant`.

The existing `careline_*` database objects, cookies, and internal tool identifiers are retained for compatibility.

A voice-first portfolio project by Yash Jobalia. A fictional clinic is the setting for demonstrating direct speech-to-speech conversation, tool calling, persistent context, and server-enforced permissions.

The local app opens on the voice demo. Patients and doctors share one account pool. Both can use the UI or ask the assistant to navigate and carry out permitted actions.

## What it demonstrates

- OpenAI Realtime over WebRTC, automatic input-language detection, selectable reply language (English by default), semantic turn detection, and interruption support.
- Installable PWA with mobile bottom navigation, app icons, and an offline reconnect page. Voice and account actions require connectivity. See [PWA setup and testing](docs/pwa.md).
- Text conversations through the Responses API with the same server action layer.
- Reviewable, signed action drafts, followed by explicit spoken, typed, or button confirmation.
- Required name, date of birth, email, and international phone on registration. Manual signup requires a password; AI registration generates a unique temporary password and keeps the session signed in.
- Shared patient/doctor identities with protected doctor assignments. Doctors can manage clinic appointments and book with another doctor as a patient.
- Appointment list and monthly calendar, past visits, cancellation reasons, doctor reschedule requests, and atomic patient rescheduling.
- Conversational intake notes: concern, duration, severity, and optional context. The doctor sees these notes with the appointment.
- Account-specific transcript history in Supabase, restored on return or refresh, with a clear-history control.
- Profile editing, sign-out, manual password changes, and confirmed AI-generated password changes.
- A collapsible explanation and live tool activity below the voice assistant.

## Run locally

Requires Node.js 22+ and a configured Supabase project.

```sh
npm ci
# Create .env.local from .env.example only if you do not already have one.
npm run dev
```

Open http://localhost:3000. Secrets belong in server environment variables. Never put an OpenAI or Supabase service-role key in a NEXT_PUBLIC variable.

Required: OPENAI_API_KEY, OPENAI_MODEL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SESSION_SECRET.
Optional: OPENAI_REALTIME_MODEL (defaults to gpt-realtime-2), SUPABASE_SERVICE_ROLE_KEY (local registration adapter). Without the server key, registration uses the register-patient Supabase Edge Function. See [account and voice reliability](docs/reliability-verification.md) for recovery setup and verification results.

See [workspace setup and demo accounts](docs/workspace.md) for schema, architecture, limitations, and credentials. The database schema and demo fixtures have been applied to the configured hosted project. Website changes are local and have not been deployed to Vercel.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:workspace
# Explicit opt-in: uses and changes the hosted fictional demo accounts.
# Set RUN_LIVE_WORKSPACE=1, then:
npm run test:workspace:live
# Optional paid synthetic microphone-to-calendar check:
npm run eval:realtime -- --live
```

The workspace tests replace the original receptionist UI journey. Older UI specifications remain as historical coverage of the previous interface and are excluded from the current default browser suite. The legacy text/audio/phone engine remains available for comparison; its deterministic tests still run with npm test.

See [verification record](docs/workspace-verification.md). The optional [Twilio phone adapter](docs/phone-demo.md) is separate from browser Realtime and still needs a number and persistent WebSocket host.
