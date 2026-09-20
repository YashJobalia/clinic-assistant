# Evaluating Clinic Assistant

Run `npm run eval` for deterministic orchestration and voice-detector tests.
Run `npm run eval -- --live` for eight real-model conversations with fictional
fixture services, without writing patient accounts or appointments. This consumes
API credit and saves `artifacts/evaluation-live.json` with model, timestamp,
latency, token usage and pass/fail results. Assertions are transparent heuristics,
not a substitute for human review of each response.

Run `npm run eval:audio -- --live` to generate English, Spanish and Hindi WAV
fixtures and transcribe them using automatic language detection. The report in
`artifacts/evaluation-audio.json` includes word error rate and target-entity recall.
Add `--reuse` to reuse generated WAV files. These fixtures are synthetic speech;
they do not establish performance across accents, noise or microphones.

Browser verification:

```sh
npx playwright test e2e/text-chat.spec.ts e2e/conversation-lab.spec.ts e2e/hands-free.spec.ts
```

The hands-free test drives real browser capture, encoding and acoustic detection
using a deterministic audio fixture while mocking paid APIs. The conversation-lab
tests check language propagation, signed-memory transport, source cards, mobile
layout, transcript-free diagnostic export, stale confirmation removal and explicit
reschedule confirmation. The existing live journey tests are separately opt-in via
`RUN_LIVE_AI_TESTS=1`; those create fictional accounts and bookings in the connected
development database.

## A repeatable human voice benchmark

Use fictional details and the same microphone/browser for baseline and candidate.
Record at least 20 turns per condition before comparing median and p95 latency.
Export the developer view after each session, label the condition and model, and
keep the reports together. Do not compare text latency with voice latency.

| Condition | Example | Review criterion |
| --- | --- | --- |
| Mid-sentence pause | “Next Tuesday … after two” | No premature turn at the chosen pause setting |
| Correction | “Actually Wednesday, same doctor” | Date changes; doctor and time preference remain |
| Backchannel | “mm-hmm” during playback | Playback resumes without an extra model turn |
| Interruption | “Wait, change the doctor” | Speech pauses; next response handles the correction |
| Noise | Fan, typing, brief click | Avoid false speech; verify with real-room recordings |
| Ambiguity | “05/06” or a similar-sounding name | Clarification rather than an invented interpretation |
| Provider failure | Transcription/chat/speech unavailable | Clear error, retry or typed fallback |
| Booking conflict | Replacement slot taken before confirmation | Original appointment remains confirmed |
| Language switch | English question followed by Spanish | Auto mode follows language; identifiers remain exact |

Voice response latency runs from the last local speech detection to the browser's
first `playing` event. Speech startup runs from the TTS request to that event.
Playback-stop timing measures the local pause call, not human-perceived or provider
interruption detection delay. Token costs use optional configured rates and exclude
STT/TTS, cached-token discounts and hosting. No rate means “not configured”.

The detector adapts its noise threshold and offers three silence timeouts. It is
acoustic, not semantic turn detection. Real noisy-room, accent and accessibility
testing, native speech-to-speech comparison, and human conversational ratings are
future validation work; do not present the synthetic results as those benchmarks.
