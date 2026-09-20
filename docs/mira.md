# Mira, Clinic Assistant's voice assistant

Mira has a shared, role-specific website guide in `src/lib/mira-capabilities.ts`. Both text and Realtime instructions include it; `get_capabilities` refreshes it after identity changes. The guide covers navigation, scheduling, profiles, passwords, conversation memory, voice, PWA behavior and unsupported services.

Database facts come from tools, not memory. Mira must distinguish an empty search, missing permission and a service failure. It provides a useful next step instead of guessing or claiming an operation succeeded.

## Guest onboarding

For private tasks, Mira asks whether the visitor already has an account. `start_signin` opens a private form with an optionally supplied email and preserves the original task. Sign-in clears pending mutation tokens and loads the authenticated user's history. A Continue with Mira card resumes the original request without replaying credentials or copying an entire guest transcript into another account.

New users may choose manual signup or guided registration collecting name, DOB, email and international phone one field at a time, with optional gender. Registration requires review and confirmation. AI-created passwords remain private. The updated registration function was deployed as version 3 and verified against the hosted database. See `reliability-verification.md` for the latest checks.

Email, name, phone and DOB are not authentication factors on their own. The `lookup_account` tool checks an exact email or full international phone and returns only `found`, `not_found` or `rate_limited`. It never returns a name, profile, role, user ID or password. A match opens private sign-in for a guest; a phone match does not disclose the login email. No match leads to spelling/country-code confirmation before offering signup. Failed lookup or password login does not imply there is no account. Requests are limited to ten lookups per authenticated session (including guest sessions) per hour by a private database counter. This deliberately permits minimal exact-contact existence checking for the requested demo flow; it is not a searchable public directory or proof of identity.

## Search and permissions

`search_appointments` accepts a name, exact email, full phone with optional formatting, appointment reference or doctor ID. It is available through Mira and the appointment search form.

The hosted `careline_search_visits` RPC returns matching appointment IDs only. Its private implementation verifies a real signed-in profile, checks clinic access from the protected doctor role, uses literal parameterized matching and caps results at 101 to signal truncation. The application re-reads matching appointment records under normal RLS and returns at most 100 results. No passwords, auth metadata or private conversation records are exposed.

- Patients: search their own appointments only.
- Doctors: search their own appointments or the clinic appointments they can already read.
- Guests: guided authentication, no private search results.

The guest account lookup is separate from private appointment search. Its hosted migration is `20260917075131_account_access_lookup.sql`. Direct database tests cover email and formatted-phone matches, missing accounts, invalid/partial input, unauthenticated rejection, guest profile isolation and the lookup budget. A real model guest conversation returned a verified match for the demo email and opened the private sign-in form rather than offering duplicate registration.

The additive database migration was applied to the hosted Clinic Assistant project. Website changes remain local; no Vercel deployment was made.

## Validation

The browser onboarding test confirms email prefill, private password handling and task continuation. Direct hosted RPC tests confirm own-email matching, formatted-phone matching, doctor clinic access, rejection of patient clinic scope, exclusion of another patient's records, unauthenticated rejection and literal handling of SQL-like input. TypeScript, the production build and six browser/live checks pass, along with all 30 unit tests. A real model request to find clinic appointments by email invoked contact search and returned the two expected demo visits. Tools supply clinic-local time labels and past/upcoming status to avoid presenting raw UTC storage timestamps as clinic times.

Supabase advisors reported no new search-function findings. Existing anonymous-session policy notices remain expected for owner-bound guest conversation storage. The project also reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
