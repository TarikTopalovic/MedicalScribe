# MediScribe renderer

The interface is the Design Canvas export, and nothing else is allowed to
change it.

```
design/MediScribe.dc.html   the export — the source of truth, never hand-edited
tools/dc2jsx.py             transpiles the export into React
src/generated/              GENERATED. Screen.jsx + design.css. Do not edit.
src/viewModel.js            every value the screens read, in one object
src/App.jsx                 behaviour: capture, transcription, drafting
src/sources.js              where the screens' records come from
src/data.js                 design constants and the scripted consultation
```

## Changing the design

Change it in Design Canvas, export it, replace `design/MediScribe.dc.html`, and
run:

```bash
npm run design     # regenerate src/generated
npm run build
```

Never edit `src/generated/` or the export by hand — the next regeneration
overwrites both. If a redesign adds a new value to the markup it arrives as an
extra entry in `VIEW_MODEL_KEYS` at the top of `Screen.jsx`, which lists every
value the design expects; produce it in `viewModel.js` or it renders empty.

`npm run design:check` regenerates and fails if the committed output has
drifted from the export. Run it in CI to keep the two in step.

### Checking it really matches

The export can be rendered by its own runtime and compared against the built
app, node for node:

```bash
node tools/parity.mjs        # serves both at http://localhost:4175/
```

Open the page and click *Uporedi*. It walks both DOM trees and lists every
difference in tag, inline style and text. The expected differences are the
third processing mode and the demonstration badge, which the app adds.

## Modes

The consent screen offers three, and the backend enforces the difference:

| Mode | Audio | Transcript text | Note |
| --- | --- | --- | --- |
| `Lokalna transkripcija` | stays on the device | stays on the device | written on the device |
| `Hibridna obrada` | stays on the device | sent to the external model | external model |
| `Vanjska transkripcija` | sent to MAI/Whisper | sent | external model |

Anything leaving the device needs the clinician's explicit per-recording
approval; the record button stays disabled until it is given.

## Demonstration mode

If the bridge on `localhost:3001` is unreachable or has no provider
configured, the app replays the consultation that ships with the design so it
can always be shown end to end. That state is visible: the status badge reads
`Demonstracija` and the capture notice says the microphone is not active.
`?demo=1` forces it.

No audio, transcript, or draft is written to browser storage, the URL, the
console, or a file. Only the clinician's department choice is remembered.
