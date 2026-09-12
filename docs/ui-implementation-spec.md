# MediScribe UI implementation specification

This document defines the Electron desktop UI still required to turn the current
prototype into a usable clinician-facing workflow. It does not authorize a
clinical deployment: every transcription and note remains a reviewable draft.

## Product rules the UI must preserve

- Default language is Bosnian (`bs-BA`); all clinician-facing text, errors,
  labels, and warnings must be Bosnian.
- Never show provisional text as authoritative. Only a final transcription can
  be used to prepare a note.
- The clinician must explicitly approve each external audio upload. The UI must
  state which provider/profile will receive audio before recording starts.
- Audio, transcripts, and drafts must not be saved to browser storage,
  analytics, console logs, URLs, or crash reports by default.
- All note fields are editable and visibly marked as a draft. The UI must never
  offer a “sign”, “diagnose”, “prescribe”, or automatic approval action.
- The UI must remain responsive on basic PCs: one capture session and one
  processing operation only; no parallel audio uploads, local model launches,
  background polling, or visual effects requiring a GPU.

## 1. Application shell

Implement a single-column layout that works at 320 px through desktop widths.
The top area contains:

- Product name and a compact status badge: `Lokalno`, `Vanjska obrada`,
  `Obrada u toku`, or `Greška`.
- A prominent language label: `Jezik transkripcije: bosanski`.
- A settings button opening a small modal/drawer, not a separate page.
- A privacy link opening the cloud-processing explanation.

The page must have one visible primary task at a time. Keep line lengths and
button targets accessible; all interactive controls need keyboard focus,
semantic labels, and an accessible name.

## 2. Start/session screen

Before microphone access, show a short explanation and two selectable modes:

| Mode | UI wording | Behavior |
| --- | --- | --- |
| Local | `Lokalna transkripcija` | Uses the local streaming provider when installed and available. |
| Cloud | `Vanjska transkripcija (MAI / Whisper)` | Sends only completed utterances to the configured OpenRouter profile. |

Cloud mode must be disabled with an explanatory reason when the server says it
is disabled, missing a key, lacks credit, or lacks the required EU/DPA clinical
configuration. The user must be able to switch back to local mode without
losing typed text.

For cloud mode, require an unchecked confirmation checkbox with this meaning:

> Potvrđujem da imam osnov i odobrenje za slanje ove audio izjave vanjskom
> obrađivaču.

The record button stays disabled until that checkbox is checked. The UI must
not claim legal compliance; link to the governance checklist instead.

## 3. Settings panel

Implement these non-secret settings. Secrets stay server-side and are never
rendered in the UI.

- Processing mode: local or cloud.
- Cloud transcription profile: `MAI Transcribe 2` or `Whisper Large v3`.
- A read-only summary of where audio is sent: local machine, normal OpenRouter
  route, or EU in-region route.
- Local thermal safety readout when supplied by the backend: normal, cooling
  required, or unavailable. It must not expose raw device paths.
- Microphone selection when the browser offers more than one input.
- Clear-current-session action, with confirmation, that clears in-memory
  transcript, note fields, and capture state.

Changes must apply only to a new utterance/session. A profile cannot change
while audio is recording or a request is pending.

## 4. Recording and live transcript panel

The recording area needs these states:

1. **Ready** — primary `Pokreni snimanje` button and brief microphone/privacy
   notice.
2. **Recording** — elapsed timer, red recording indicator, audio-level meter
   with a text equivalent, and `Završi izjavu` button.
3. **Speech boundary detected** — local mode should show `Završavam izjavu…`;
   cloud mode should make exactly one request for the completed utterance.
4. **Processing** — disable duplicate actions, show which phase is occurring:
   `Privremeni transkript`, `Provjera kvaliteta`, `Konačni transkript`, or
   `Pripremam lokalni nacrt`.
5. **Error** — keep manually entered transcript text, stop capture, offer a
   retry that does not silently resend audio, and show a short safe error.

For local streaming, display provisional text in a visually distinct region
labelled `Privremeno — može se promijeniti`. Replace it with final segments
when the authoritative pass completes. Include timing/segment metadata only in
an expandable technical view; clinicians should see readable timestamps, not
model internals.

For the current cloud API, do not promise word-by-word real-time output. Show
that completed audio is being processed after the utterance ends. If a future
provider supports true streaming, it must still use the same final/provisional
distinction.

## 5. Transcript review panel

After finalization, show:

- Heading `Konačni transkript` and a `Konačan` badge.
- Speaker label, start/end timestamp, confidence warning, and editable text
  for each segment.
- An accessible “jump to segment” control for every note evidence reference.
- A `Uredi transkript` mode with Save/Cancel. Saving an edit must mark the
  note as stale and require a new local draft.
- A warning banner when a segment has low confidence, missing speaker, or
  uncertain language.
- Explicit actions: `Ponovi ovu izjavu`, `Dodaj ručni tekst`, and
  `Obriši trenutnu sesiju`.

Do not auto-merge text from separate utterances without showing their ordering
and timestamps. If a session has several utterances, show a compact timeline
and retain final boundaries.

## 6. Draft note panel

This panel appears only after a final transcript exists. It contains four
editable Bosnian SOAP fields:

- `Subjektivno`
- `Objektivno`
- `Procjena`
- `Plan`

The local draft generator currently copies finalized spoken content into
`Subjektivno` and deliberately leaves clinical interpretation to the
clinician. The UI must make that clear with a persistent banner:

> Nacrt nije potvrđen medicinski zapis. Kliničar mora provjeriti, dopuniti i
> odobriti sadržaj prije upotrebe.

Under each populated field, show evidence links to the supporting transcript
segments. If no evidence exists, show `Nema automatskog izvora` rather than
inventing one. Keep warnings in a clearly separated yellow/amber region;
never style them as alerts requiring a diagnosis.

Required actions:

- `Ponovo pripremi lokalni nacrt` after transcript edits.
- `Kopiraj nacrt` with a transient confirmation; do not put data on the URL.
- `Izvezi za pregled` only after a future explicit export policy is approved.

## 7. Error, privacy, and resilience behavior

Map backend errors to safe Bosnian messages without exposing tokens, provider
responses, file paths, or transcript text:

- Missing approval: explain that external processing needs confirmation.
- Payment required: explain that cloud transcription is unavailable and offer
  local mode.
- EU/DPA safeguard blocked: explain that clinical cloud routing is unavailable
  and offer local mode.
- Thermal limit: tell the user local transcription stopped to let the device
  cool; do not automatically retry.
- Network/provider failure: preserve the in-memory manual transcript, state
  that the audio was not retried automatically, and offer a deliberate retry.
- Unsupported microphone/format: state the supported format and suggest a
  browser/device change.

Every destructive UI action needs a confirmation dialog. Session clearing must
wipe only the current in-memory state. Persistent storage, export, user
accounts, audit logs, and patient identifiers are out of scope until separate
security and data-governance requirements are implemented.

## 8. API/UI contract still to implement

The desktop renderer needs a versioned session API in front of the current provider
core. Implement these endpoints or equivalent WebSocket events:

- `GET /api/config` — safe capability flags, mode availability, profile names,
  language, and non-secret policy status.
- `POST /api/sessions` — creates an in-memory session and returns an opaque ID.
- `POST /api/sessions/:id/audio` — receives one normalized chunk/utterance and
  returns a provisional or final `TranscriptUpdate`.
- `POST /api/sessions/:id/finalize` — finishes an utterance and returns final
  segments only.
- `POST /api/sessions/:id/draft` — accepts only final transcript revision and
  returns the deterministic local `GenerationResult`.
- `DELETE /api/sessions/:id` — clears in-memory session state.

The current Node browser bridge is deliberately minimal. It must be replaced
or connected to this provider-neutral API before claiming full live local
streaming in the UI. API responses must reuse the existing `TranscriptUpdate`,
`TranscriptSegment`, `GenerationResult`, and standardized error shapes.

## 9. Definition of done

The UI implementation is complete only when all of these are demonstrably true:

- A Bosnian microphone session shows provisional local text (when local runtime
  is installed) and replaces it with a final transcript at an utterance end.
- Cloud mode requires visible per-recording approval, sends no partial audio,
  and supports both MAI and Whisper profile selection.
- A final transcript produces a local draft only after finalization.
- Transcript and SOAP fields are editable; transcript edits invalidate a prior
  draft.
- No audio/transcript/note is written to browser storage, console logs, query
  strings, or a server file by default.
- Keyboard-only navigation, screen-reader labels, focus states, small-screen
  layout, and readable error states pass manual accessibility review.
- Local thermal stop, cloud payment failure, EU compliance block, microphone
  denial, network failure, and retry behavior have automated tests.
- The browser production build and Python/backend tests pass on the target
  basic PC without launching more than one local AI decode.
