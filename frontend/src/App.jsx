// Application behaviour.
//
// The screens come from the design export (src/generated/Screen.jsx) and are
// never edited by hand. This component owns the state those screens read and
// runs the real consultation: microphone capture, one request per completed
// utterance, and a draft note prepared only from a final transcript.
//
// When the local bridge is not reachable the component replays the scripted
// consultation that ships with the design, so the app is always demonstrable
// instead of showing an empty shell.

import React from "react";
import Screen from "./generated/Screen.jsx";
import { buildViewModel } from "./viewModel.js";
import { demoSource, liveSource } from "./sources.js";
import { TR, MICS, PROFILES, genNote, sat } from "./data.js";
import { Capture, listMicrophones } from "./capture.js";
import * as api from "./api.js";

const MODE_IDS = { local: "local", hybrid: "hybrid", cloud: "cloud" };
// The scripted consultation runs at the speed the design export ships with.
const DEMO_SPEED = 2;
const PROFILE_IDS = { [PROFILES[0]]: "mai", [PROFILES[1]]: "whisper" };

// Backend failures become one of the design's safe Bosnian messages. Provider
// bodies, tokens, paths and transcript text are never surfaced.
function errorKey(error) {
  const status = error?.status;
  const text = String(error?.message || "");
  if (status === 402) return "payment";
  if (status === 429) return "busy";
  if (status === 403 && /EU|klinič/i.test(text)) return "eu";
  if (status === 403 || /[Pp]otvrda/.test(text)) return "approval";
  if (/ohladi|temperatur/i.test(text)) return "thermal";
  if (/[Mm]ikrofon|format/.test(text)) return "mic";
  return "network";
}

export default class App extends React.Component {
  state = {
    // --- state the design defines -----------------------------------------
    screen: "signin", dept: "Porodična medicina", activeAcc: 0, accountMenuOpen: false, deptPickerOpen: false,
    accounts: [
      { name: "dr. Emir Begić", dept: "Porodična medicina", depts: ["Porodična medicina"] },
      { name: "dr. Amina Selimović", dept: "Interna medicina", depts: ["Interna medicina"] },
    ],
    remember: true,
    consent: [false, false, false],
    mode: "local", cloudProfile: PROFILES[0], cloudApproved: false, cloudBlocked: null,
    mic: MICS[0], thermal: "normalno",
    idx: -1, running: false, phase: null, finished: false, provisional: "",
    segOverride: {}, speakerFixed: {}, segEdit: null, segDraft: "",
    manualOpen: false, manualText: "",
    note: null, noteTouched: {}, noteStale: false, copied: false, jump: null,
    approved: false, sel: 0,
    settingsOpen: false, privacyOpen: false, confirm: null, errKey: null, errDetail: "",

    // --- state the live consultation adds ---------------------------------
    demo: false, configReady: false, bridgeDown: false,
    liveSegments: [], noteSections: null, noteWarnings: [],
    sessions: [], sessionId: null, pending: 0, mics: [], storedReports: [], micLevel: 0,
    schedule: [], patient: null, notificationsOpen: false,
  };

  scrollRef = React.createRef();
  timers = [];
  capture = null;
  lastMeterUpdate = 0;
  // Counted outside React: the closing clip is handed over in the same tick as
  // the wait that must see it.
  pendingCount = 0;

  setMicLevel = (level) => {
    const now = performance.now();
    if (now - this.lastMeterUpdate < 80) return;
    this.lastMeterUpdate = now;
    this.setState({ micLevel: level });
  };

  // ---------------------------------------------------------------- timers
  clearTimers() {
    clearInterval(this.tick);
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  later = (fn, ms) => {
    this.timers.push(setTimeout(fn, ms));
  };

  // ------------------------------------------------------------- lifecycle
  componentDidMount() {
    this.restoreDepartments();
    this.probeBackend();
  }

  componentDidUpdate() {
    const element = this.scrollRef.current;
    if (element && this.state.screen === "visit") element.scrollTop = element.scrollHeight;
  }

  componentWillUnmount() {
    this.clearTimers();
    this.capture?.release();
  }

  async probeBackend() {
    // Presentation mode is explicit. An unreachable bridge used to silently
    // replace the clinician's own records with the scripted sample
    // consultation, so the same account showed five patients on one run and
    // none on the next. The app now always shows its real state.
    const forced = new URLSearchParams(window.location.search).get("demo");
    if (forced === "1") return this.setState({ demo: true, configReady: true });
    try {
      const config = await api.getConfig();
      this.setState((s) => ({
        demo: false,
        configReady: true,
        bridgeDown: false,
        cloudBlocked: config.cloud?.available ? null : s.cloudBlocked,
        mode: config.local?.available ? "local" : (config.cloud?.available ? "cloud" : s.mode),
        cloudProfile: config.cloud?.defaultProfile === "whisper" ? PROFILES[1] : s.cloudProfile,
        // Said before recording: without a local model the local note is only
        // the spoken record, structured by hand.
        localDraftReason: config.draft?.local?.available
          ? ""
          : (config.draft?.local?.reason || "") + " Nacrt će sadržavati samo izgovoreni tekst.",
      }));
      this.loadMicrophones();
      this.loadReports();
      this.loadSchedule();
    } catch {
      this.setState({ demo: false, configReady: true, bridgeDown: true });
    }
  }

  // Notes already saved server-side. Persistence is optional, so a failure
  // here only means the reports screen shows this run's sessions.
  async loadReports() {
    try {
      const body = await api.getReports();
      this.setState({ storedReports: body.reports || [] });
    } catch { /* the in-memory sessions stay */ }
  }

  // The day's patients come from the bridge, never from the interface code.
  async loadSchedule() {
    try {
      const body = await api.getSchedule();
      this.setState({ schedule: body.visits || [] });
    } catch { /* an empty day is shown rather than an invented one */ }
  }

  async loadMicrophones() {
    try {
      const mics = await listMicrophones();
      if (mics.length) this.setState((s) => ({ mics, mic: s.mic && mics.some((m) => m.v === s.mic) ? s.mic : mics[0].v }));
    } catch { /* the device list stays at its default */ }
  }

  // --------------------------------------------------- accounts/departments
  restoreDepartments() {
    try {
      const raw = window.localStorage.getItem("mediscribe.accounts.depts");
      if (!raw) return;
      const saved = JSON.parse(raw);
      this.setState((st) => ({
        accounts: st.accounts.map((a) => (saved[a.name]
          ? { ...a, dept: saved[a.name].dept || a.dept, depts: saved[a.name].depts || a.depts }
          : a)),
      }));
    } catch { /* storage unavailable; departments stay at their defaults */ }
  }

  saveDepts(accounts) {
    try {
      const map = {};
      accounts.forEach((a) => { map[a.name] = { dept: a.dept, depts: a.depts }; });
      window.localStorage.setItem("mediscribe.accounts.depts", JSON.stringify(map));
    } catch { /* storage unavailable */ }
  }

  go = (screen) => () => this.setState({ screen, accountMenuOpen: false, notificationsOpen: false });

  // A visit from the schedule opens the consent step for that patient.
  startFor = (patient) => () => this.setState({
    patient: patient || null, screen: "consent", accountMenuOpen: false, notificationsOpen: false,
  });

  ask = (c) => () => this.setState({ confirm: c, accountMenuOpen: false, settingsOpen: false });

  pickDept = (d, add) => {
    this.setState((st) => {
      const accounts = st.accounts.map((a, i) => {
        if (i !== st.activeAcc) return a;
        const list = a.depts || [a.dept];
        return { ...a, dept: d, depts: list.indexOf(d) === -1 ? list.concat([d]) : list };
      });
      this.saveDepts(accounts);
      return { accounts, dept: d, deptPickerOpen: add ? false : st.deptPickerOpen };
    });
  };

  fireError = (key) => () => {
    this.clearTimers();
    this.capture?.release();
    const blocking = key === "payment" || key === "eu";
    this.setState((s) => ({
      errKey: key, settingsOpen: false, running: false, phase: null,
      cloudBlocked: blocking ? key : s.cloudBlocked,
      thermal: key === "thermal" ? "potrebno hlađenje" : s.thermal,
    }));
  };

  // ------------------------------------------------------------- session
  start = () => {
    this.clearTimers();
    if (this.state.mode !== "local" && this.state.cloudBlocked) {
      this.setState({ errKey: this.state.cloudBlocked });
      return;
    }
    this.setState({
      screen: "visit", idx: -1, running: true, finished: false, phase: null, provisional: "",
      note: null, noteSections: null, noteWarnings: [], noteStale: false, segOverride: {},
      liveSegments: [], errKey: null, startedAt: Date.now(),
    }, () => { if (this.state.demo) this.runScripted(); else this.runLive(); });
  };

  finish = () => {
    if (this.state.phase === "boundary" || this.state.finished) return;
    if (this.state.demo) return this.finishScripted();
    return this.finishLive();
  };

  clearSession = () => {
    this.clearTimers();
    this.capture?.release();
    if (this.state.sessionId) api.deleteSession(this.state.sessionId).catch(() => {});
    this.setState({
      screen: "today", patient: null, consent: [false, false, false], idx: -1, running: false, phase: null, finished: false,
      provisional: "", segOverride: {}, speakerFixed: {}, segEdit: null, manualOpen: false, manualText: "",
      note: null, noteTouched: {}, noteStale: false, approved: false, cloudApproved: false,
      settingsOpen: false, confirm: null, errKey: null,
      liveSegments: [], noteSections: null, noteWarnings: [], sessionId: null, pending: 0, micLevel: 0,
    });
    this.pendingCount = 0;
  };

  // ----------------------------------------------------- scripted (demo)
  runScripted() {
    this.setState({ idx: 0, phase: "provisional" });
    this.tick = setInterval(() => {
      const s = this.state;
      if (!s.running) return;
      const next = s.idx + 1;
      if (next >= TR.length) { clearInterval(this.tick); this.finishScripted(); return; }
      const upcoming = TR[next + 1];
      this.setState({ idx: next, provisional: upcoming ? upcoming.t.slice(0, 34) + "…" : "" });
    }, 1500 / DEMO_SPEED);
  }

  finishScripted() {
    this.clearTimers();
    this.setState({ running: false, phase: "boundary", provisional: "", idx: TR.length - 1 });
    this.later(() => this.setState({ phase: "quality" }), 700 / DEMO_SPEED);
    this.later(() => this.setState({ phase: "final" }), 1500 / DEMO_SPEED);
    this.later(() => this.setState({ phase: "draft" }), 2300 / DEMO_SPEED);
    this.later(() => this.setState({ phase: null, finished: true, note: genNote() }), 3200 / DEMO_SPEED);
  }

  // -------------------------------------------------------------- live
  async runLive() {
    const { mode, cloudApproved, mic, mics } = this.state;
    const device = mics.find((m) => m.v === mic);
    this.capture = new Capture({
      onBoundary: () => this.setState({ phase: "boundary" }),
      onLevel: this.setMicLevel,
      onUtterance: (clip, timing) => this.transcribe(clip, timing),
    });
    // Call getUserMedia from the record-button gesture. Waiting for a server
    // request first can make Chromium refuse to open its permission prompt.
    const microphone = this.capture.start(device?.id);
    try {
      const session = await api.createSession(MODE_IDS[mode], mode === "local" ? true : cloudApproved);
      this.setState({ sessionId: session.id });
      await microphone;
      // Browsers hide device labels until the first successful permission.
      this.loadMicrophones();
    } catch (error) {
      microphone.catch(() => {});
      this.capture?.release();
      const key = error?.name === "NotAllowedError" || error?.name === "NotFoundError" ? "mic" : errorKey(error);
      this.setState({ running: false, phase: null, errKey: key, errDetail: error?.message || "", micLevel: 0 });
    }
  }

  // The bridge keeps sessions in memory, so restarting it (or a four-hour
  // consultation) makes the renderer hold an id the server no longer knows.
  // That used to end the consultation with a connection error on every single
  // utterance; instead the session is reopened once and the work continues.
  async retryWithNewSession(send) {
    const session = await api.createSession(
      MODE_IDS[this.state.mode],
      this.state.mode === "local" ? true : this.state.cloudApproved,
    );
    this.setState({ sessionId: session.id });
    return send(session.id);
  }

  async transcribe(clip, timing) {
    const { sessionId, cloudProfile } = this.state;
    if (!sessionId) return;
    this.pendingCount += 1;
    this.setState((s) => ({ pending: s.pending + 1, phase: "quality" }));
    try {
      const send = (id) => api.sendUtterance(id, clip, PROFILE_IDS[cloudProfile], timing);
      const result = await send(sessionId).catch((error) => {
        if (error?.status !== 404) throw error;
        return this.retryWithNewSession(send);
      });
      this.pendingCount -= 1;
      this.setState((s) => {
        const liveSegments = s.liveSegments.concat(result.segments.map((segment) => ({
          sp: segment.speaker || "Nepoznat govornik",
          d: segment.role === "doctor",
          unk: !segment.speaker,
          low: segment.confidence != null && segment.confidence < 0.75,
          conf: segment.confidence,
          t: segment.text,
          start: segment.startMs, end: segment.endMs,
        })));
        return {
          liveSegments, idx: liveSegments.length - 1, pending: s.pending - 1,
          phase: s.pending - 1 > 0 ? "quality" : (s.running ? null : s.phase),
          noteStale: s.finished ? true : s.noteStale,
        };
      });
    } catch (error) {
      this.pendingCount -= 1;
      this.setState((s) => ({ pending: s.pending - 1, phase: null, errKey: errorKey(error), errDetail: error?.message || "" }));
    }
  }

  async finishLive() {
    this.setState({ running: false, phase: "boundary", provisional: "", micLevel: 0 });
    try {
      await this.capture?.stop();
      this.capture = null;
      await this.waitForPending();
      if (!this.state.liveSegments.length) {
        // The microphone worked; voice activity detection found no speech.
        this.setState({ phase: null, errKey: "silence" });
        return;
      }
      this.setState({ phase: "final" });
      await this.prepareDraft();
    } catch (error) {
      this.setState({ phase: null, errKey: errorKey(error), errDetail: error?.message || "" });
    }
  }

  waitForPending(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const check = () => {
        // Resolve through setState so every finished utterance is in the
        // transcript the draft is built from.
        if (this.pendingCount <= 0 || Date.now() > deadline) return this.setState({}, resolve);
        return this.later(check, 200);
      };
      check();
    });
  }

  async prepareDraft() {
    const { sessionId, liveSegments, segOverride } = this.state;
    this.setState({ phase: "draft" });
    const segments = liveSegments.map((line, index) => ({
      speaker: line.sp,
      role: line.d ? "doctor" : "patient",
      text: segOverride[index] !== undefined ? segOverride[index] : line.t,
    }));
    try {
      const ask = (id) => api.requestDraft(id, segments);
      const draft = await ask(sessionId).catch((error) => {
        if (error?.status !== 404) throw error;
        return this.retryWithNewSession(ask);
      });
      this.setState((s) => {
        const sections = draft.sections || [];
        const note = sections.map((section) => (section.items || []).map((item) => item.text).join(" "));
        const roles = new Map((draft.speakers || []).map((speaker) => [speaker.index, speaker.role]));
        const liveSegments = s.liveSegments.map((line, index) => {
          const role = roles.get(index);
          if (!role || role === "unknown") return line;
          return { ...line, d: role === "doctor", unk: false, sp: role === "doctor" ? "Ljekar" : "Pacijent" };
        });
        return {
          liveSegments,
          phase: null, finished: true, noteStale: false, noteTouched: {},
          noteSections: sections, noteWarnings: draft.warnings || [], note,
          sessions: s.sessions.some((session) => session.id === s.sessionId)
            ? s.sessions
            : s.sessions.concat([{
                id: s.sessionId,
                name: s.patient?.name || ("Izjava " + sat(Date.now())),
                summary: (sections[0]?.items?.[0]?.text || "Snimljena izjava").slice(0, 70),
                startedAt: s.startedAt, finishedAt: Date.now(), mode: s.mode, approved: false,
                events: [
                  { title: "v1 · nacrt", at: sat(Date.now()), text: "Nacrt pripremljen iz konačnog transkripta.", dot: "#C77700" },
                  { title: "Konačni transkript", at: sat(Date.now()), text: s.liveSegments.length + " segmenata.", dot: "#0071E3" },
                  { title: "Sesija otvorena", at: sat(s.startedAt), text: "Saglasnost potvrđena · " + s.mode, dot: "#C2C2C7" },
                ],
              }]),
        };
      });
      if (draft.persisted) this.loadReports();
    } catch (error) {
      this.setState({ phase: null, errKey: errorKey(error), errDetail: error?.message || "" });
    }
  }

  // ----------------------------------------------------- draft actions
  regenerate = (src) => {
    if (this.state.demo) {
      this.setState({ note: src.genNote(), noteTouched: {}, noteStale: false });
      return;
    }
    this.prepareDraft();
  };

  copyDraft = (note) => {
    const labels = ["Subjektivno", "Objektivno", "Procjena", "Plan"];
    const text = labels.map((label, i) => label + ":\n" + (note[i] || "—")).join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => {});
    this.setState({ copied: true });
    this.later(() => this.setState({ copied: false }), 1800);
  };

  render() {
    const src = this.state.demo ? demoSource(this) : liveSource(this);
    return Screen(buildViewModel(this, src));
  }
}
