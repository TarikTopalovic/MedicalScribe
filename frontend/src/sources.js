// The session source the view model reads from.
//
// Presentation mode replays the consultation that ships with the design so the
// app can always be shown end to end. Live mode returns the same shape built
// from the real microphone session. Nothing below the source layer knows which
// one is running, so the screens behave identically.

import { TR, SOAP, FLAGS, VISITS, MICS, genNote, datumKratki, sat } from "./data.js";

const DEMO_REPORTS = (s) => [
  { name: "Amina Hodžić", kind: s.approved ? "Posjeta · potpisano" : "Posjeta · nacrt", date: "12.09.2026.", version: s.approved ? "v2" : "v1", status: s.approved ? "Zaključano" : "Nacrt" },
  { name: "Mirza Selimović", kind: "Kontrola hipertenzije", date: "12.09.2026.", version: "v1", status: "Potpisano" },
  { name: "Lejla Kovač", kind: "Bol u leđima", date: "12.09.2026.", version: "v3", status: "Nacrt" },
  { name: "Nedim Karić", kind: "Posjeta · potpisano", date: "11.09.2026.", version: "v1", status: "Potpisano" },
  { name: "Ivana Marić", kind: "Prva posjeta", date: "11.09.2026.", version: "v2", status: "Potpisano" },
];

const DEMO_HISTORY = (s, activeName, cloud) => [
  [
    s.approved
      ? { title: "v2 · potpisano", at: "10:41", text: activeName + " je odobrio nalaz. Zapis zaključan.", dot: "#1F7A36" }
      : { title: "v1 · nacrt", at: "10:34", text: "Nacrt čeka provjeru ljekara.", dot: "#C77700" },
    { title: "Konačni transkript", at: "10:33", text: "Jedna izjava, 15 segmenata. Privremeni tekst zamijenjen konačnim.", dot: "#0071E3" },
    { title: "Sesija otvorena", at: "10:15", text: "Saglasnost potvrđena · " + (cloud ? "vanjska obrada" : "lokalna obrada"), dot: "#C2C2C7" },
  ],
  [
    { title: "v1 · potpisano", at: "09:22", text: "Bez izmjena nakon nacrta.", dot: "#1F7A36" },
    { title: "v1 · nacrt kreiran", at: "09:04", text: "Lokalna obrada, 11 segmenata.", dot: "#C2C2C7" },
  ],
  [
    { title: "v3 · nacrt", at: "09:58", text: "Plan dopunjen fizikalnom terapijom.", dot: "#C77700" },
    { title: "v2 · izmjena transkripta", at: "09:47", text: "Ispravljena strana bola; nacrt označen zastarjelim i pripremljen ponovo.", dot: "#0071E3" },
    { title: "v1 · nacrt kreiran", at: "09:33", text: "Lokalna obrada, 19 segmenata.", dot: "#C2C2C7" },
  ],
  [
    { title: "v1 · potpisano", at: "11.09. 16:12", text: "Pregledano i potpisano isti dan.", dot: "#1F7A36" },
    { title: "v1 · nacrt kreiran", at: "11.09. 15:50", text: "Lokalna obrada, 9 segmenata.", dot: "#C2C2C7" },
  ],
  [
    { title: "v2 · potpisano", at: "11.09. 10:40", text: "Dopunjena porodična anamneza.", dot: "#1F7A36" },
    { title: "v1 · nacrt kreiran", at: "11.09. 10:12", text: "Lokalna obrada, 22 segmenta.", dot: "#C2C2C7" },
  ],
];

export function demoSource(app) {
  const s = app.state;
  const active = s.accounts[s.activeAcc] || s.accounts[0];
  return {
    demo: true,
    lines: TR,
    soap: SOAP,
    flags: FLAGS,
    visits: VISITS,
    reports: DEMO_REPORTS(s),
    history: DEMO_HISTORY(s, active.name, s.mode === "cloud"),
    mics: MICS.map((m) => ({ v: m, id: "" })),
    patientLabel: "Amina H.",
    genNote,
  };
}

const clock = (at) => (at ? sat(at) : "--:--");
const day = (at) => (at ? datumKratki(at) : "");

// A note section carries its evidence, so the draft panel can link every line
// back to the transcript segment it came from.
function liveSoap(sections) {
  const labels = ["Subjektivno", "Objektivno", "Procjena", "Plan"];
  return labels.map((label, index) => {
    const section = sections?.[index];
    return {
      label,
      interp: label === "Procjena",
      items: (section?.items || []).map((item) => ({
        a: Number.isInteger(item.evidence?.[0]) ? item.evidence[0] : 0,
        t: item.text,
      })),
    };
  });
}

function liveFlags(state) {
  const flags = [];
  state.liveSegments.forEach((line, index) => {
    if (line.low) {
      flags.push({ a: index, kind: "Niska pouzdanost prepoznavanja", dot: "#C77700",
        text: "Segment " + (index + 1) + " · potvrdite tekst u konačnom transkriptu." });
    }
    if (line.unk) {
      flags.push({ a: index, kind: "Govornik nije prepoznat", dot: "#8A5B00",
        text: "Segment " + (index + 1) + " nema govornika. Označite ga ručno prije odobrenja." });
    }
  });
  // One line for the whole session: the microphone is the same all the way
  // through, so repeating it per segment would bury everything else.
  const narrow = state.liveSegments.findIndex((line) => line.narrow);
  if (narrow !== -1) {
    flags.push({
      a: narrow, kind: "Mikrofon ne prenosi visoke tonove", dot: "#E0642A",
      text: "Snimku nedostaje pojas suglasnika (s, š, c, t, k), pa nijedan model ne može pouzdano prepoznati riječi. "
        + "Provjerite je li odabran pravi mikrofon i isključite obradu zvuka na uređaju.",
    });
  }
  (state.noteWarnings || []).forEach((warning, index) => {
    flags.push({ a: Number.isInteger(warning.evidence) ? warning.evidence : Math.max(0, state.liveSegments.length - 1),
      kind: warning.kind || "Provjerite prije unosa u karton", text: warning.text || String(warning), dot: "#E0642A" });
  });
  return flags;
}

export function liveSource(app) {
  const s = app.state;
  const sections = liveSoap(s.noteSections);
  const finished = s.sessions.filter((session) => session.finishedAt);
  // Saved notes win over this run's memory: they survive a restart.
  const stored = s.storedReports || [];

  const reports = stored.length
    ? stored.map((report) => ({
        name: report.patient || "Izjava · " + clock(report.createdAt),
        kind: report.summary || "Nacrt bez sadržaja",
        date: day(report.createdAt),
        version: "v" + (report.revision || 1),
        status: report.status === "finalized" ? "Nacrt" : "Na čekanju",
      }))
    : finished.length
      ? finished.map((session) => ({
          name: session.name,
          kind: session.approved ? "Posjeta · potpisano" : "Posjeta · nacrt",
          date: day(session.startedAt),
          version: session.approved ? "v2" : "v1",
          status: session.approved ? "Zaključano" : "Nacrt",
        }))
      : [{ name: "Nema sačuvanih nalaza", kind: "Nalazi ostaju u memoriji do zatvaranja programa", date: day(Date.now()), version: "—", status: "Zakazano" }];

  const history = stored.length
    ? stored.map((report) => [
        { title: "v" + (report.revision || 1) + " · nacrt", at: clock(report.finalizedAt || report.createdAt),
          text: "Nacrt je sačuvan. Zvuk nije pohranjen.", dot: "#C77700" },
        { title: "Sesija otvorena", at: clock(report.createdAt),
          text: "Transkript i nacrt su vezani za ovu sesiju.", dot: "#C2C2C7" },
      ])
    : finished.length
      ? finished.map((session) => session.events)
      : [[{ title: "Nema zapisa", at: "--:--", text: "Pokrenite izjavu da bi se ovdje pojavio tok obrade.", dot: "#C2C2C7" }]];

  // The day: the open action first, then the clinic's booked visits, then
  // whatever this run has already finished.
  const visits = [
    {
      time: clock(Date.now()), name: "Nova izjava", reason: "Pokreni sesiju bez unosa identifikatora pacijenta",
      status: s.finished ? "Nacrt" : "Na čekanju", now: true, initials: "+",
    },
    ...(s.schedule || []).map((visit) => ({
      time: visit.time, name: visit.name, reason: visit.reason,
      status: visit.status, patient: visit, booked: true,
    })),
    ...finished.map((session) => ({
      time: clock(session.startedAt), name: session.name, reason: session.summary || "Snimljena izjava",
      status: session.approved ? "Potpisano" : "Nacrt", draft: !session.approved,
    })),
  ];

  return {
    demo: false,
    lines: s.liveSegments,
    soap: sections,
    flags: liveFlags(s),
    visits,
    reports,
    history,
    mics: s.mics.length ? s.mics : [{ v: "Zadani mikrofon", id: "" }],
    patientLabel: "Pacijent",
    genNote: () => sections.map((section) => section.items.map((item) => item.t).join(" ")),
  };
}

