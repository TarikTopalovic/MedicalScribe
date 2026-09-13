import { useEffect, useMemo, useState } from "react";
import RecorderSafe from "./components/RecorderSafe.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
const PRAZAN_NACRT = { subjective: "", objective: "", assessment: "", plan: "", warnings: [] };
const POLJA = [
  ["subjective", "Subjektivno", "Izgovoreni sadržaj iz konačnog transkripta."],
  ["objective", "Objektivno", "Nema automatskog izvora."],
  ["assessment", "Procjena", "Nema automatskog izvora."],
  ["plan", "Plan", "Nema automatskog izvora."],
];

function sigurnosnaPoruka(poruka) {
  const text = String(poruka || "");
  if (text.includes("Nedostaje OpenRouter kredit")) return "Vanjska transkripcija nije dostupna zbog nedostatka kredita. Možete unijeti tekst ručno.";
  if (text.includes("Klinička cloud obrada") || text.includes("EU")) return "Klinička vanjska obrada nije dostupna dok EU ruta i ugovor o obradi podataka nisu aktivni.";
  if (text.includes("Potvrda")) return "Za vanjsku obradu potrebna je jasna potvrda prije snimanja.";
  if (text.includes("mikrofon") || text.includes("Microphone")) return "Mikrofon nije dostupan. Provjerite dozvole uređaja i pokušajte ponovo.";
  return "Obrada nije uspjela. Zvučni zapis nije automatski ponovo poslan; pokušajte namjerno ili unesite tekst ručno.";
}

export default function AppSafe() {
  const [config, setConfig] = useState(null);
  const [mode, setMode] = useState("cloud");
  const [profile, setProfile] = useState("mai");
  const [approved, setApproved] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [draft, setDraft] = useState(PRAZAN_NACRT);
  const [busy, setBusy] = useState(false);
  const [captureState, setCaptureState] = useState("ready");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [draftStale, setDraftStale] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${BACKEND_URL}/api/config`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.greska);
        return body;
      })
      .then((body) => {
        if (!active) return;
        setConfig(body);
        if (body.cloud?.defaultProfile) setProfile(body.cloud.defaultProfile);
        if (!body.cloud?.available && body.local?.available) setMode("local");
      })
      .catch(() => active && setError("Povezivanje s lokalnim servisom nije uspjelo. Snimanje nije pokrenuto."));
    return () => { active = false; };
  }, []);

  const cloudAvailable = Boolean(config?.cloud?.available);
  const locked = busy || captureState !== "ready";
  const status = useMemo(() => {
    if (error) return ["Greška", "status-error"];
    if (busy || captureState === "processing") return ["Obrada u toku", "status-processing"];
    if (mode === "cloud") return ["Vanjska obrada", "status-cloud"];
    return ["Lokalno", "status-local"];
  }, [busy, captureState, error, mode]);

  async function pripremiNacrt(text = transcript) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setBusy(true);
    setError("");
    setMessage("Pripremam lokalni nacrt…");
    try {
      const response = await fetch(`${BACKEND_URL}/api/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: cleaned }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.greska);
      setDraft({ ...PRAZAN_NACRT, ...body });
      setDraftStale(false);
      setMessage("Lokalni nacrt je spreman za kliničku provjeru. Ništa nije trajno sačuvano.");
    } catch (err) {
      setError(sigurnosnaPoruka(err.message));
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  function primiTranskript(text) {
    const finalText = text.trim();
    setTranscript(finalText);
    setError("");
    setMessage("Konačni transkript je spreman. Pripremam lokalni nacrt…");
    pripremiNacrt(finalText);
  }

  function promijeniTranskript(value) {
    setTranscript(value);
    if (draft.subjective || draft.objective || draft.assessment || draft.plan) setDraftStale(true);
  }

  function obrisiSesiju() {
    setTranscript(""); setDraft(PRAZAN_NACRT); setDraftStale(false); setApproved(false); setError("");
    setMessage("Trenutna sesija je obrisana iz memorije."); setClearOpen(false);
  }

  async function kopirajNacrt() {
    const content = POLJA.map(([key, label]) => `${label}\n${draft[key] || ""}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true); window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Kopiranje nije dostupno na ovom uređaju. Označite tekst i kopirajte ga ručno.");
    }
  }

  const profileName = profile === "whisper" ? "Whisper Large v3" : "MAI Transcribe 2";

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">+</span><span>MediScribe</span></div>
      <div className={`status-badge ${status[1]}`}><span aria-hidden="true" />{status[0]}</div>
      <p className="language-label">Jezik transkripcije: <strong>bosanski</strong></p>
      <div className="top-actions"><button className="text-button" onClick={() => setPrivacyOpen(true)}>Privatnost</button><button className="icon-button" aria-label="Otvori postavke" onClick={() => setSettingsOpen(true)}>⚙</button></div>
    </header>

    {error && <section className="notice notice-error" role="alert"><div><strong>Obrada zahtijeva pažnju</strong><p>{error}</p></div><button className="text-button" onClick={() => setError("")}>Odbaci</button></section>}
    <div className="workspace">
      <section className="intro-panel"><p className="eyebrow">NOVA IZJAVA</p><h1>Pripremite pregledan nacrt, uz potpunu kontrolu kliničara.</h1><p>Transkript i nacrt ostaju samo u memoriji trenutne sesije. Nacrt nije medicinski zapis i mora se provjeriti prije upotrebe.</p></section>

      <section className="panel mode-panel" aria-labelledby="mode-title">
        <div className="section-heading"><div><p className="eyebrow">1. NAČIN OBRADE</p><h2 id="mode-title">Odaberite način transkripcije</h2></div><span className="memory-chip">Bez trajne pohrane</span></div>
        <div className="mode-grid">
          <button className={`mode-option ${mode === "local" ? "selected" : ""}`} disabled={!config?.local?.available || locked} onClick={() => setMode("local")}><span className="mode-radio" aria-hidden="true" /><span><strong>Lokalna transkripcija</strong><small>{config?.local?.available ? "Zvuk se obrađuje na ovom računaru." : (config?.local?.reason || "Lokalni servis nije povezan s desktop aplikacijom.")}</small></span></button>
          <button className={`mode-option ${mode === "cloud" ? "selected" : ""}`} disabled={!cloudAvailable || locked} onClick={() => setMode("cloud")}><span className="mode-radio" aria-hidden="true" /><span><strong>Vanjska transkripcija</strong><small>{cloudAvailable ? "Samo završena izjava šalje se odabranom obrađivaču." : (config?.cloud?.reason || "Vanjska obrada nije dostupna.")}</small></span></button>
        </div>
        {mode === "cloud" && <label className="approval"><input type="checkbox" checked={approved} disabled={locked || !cloudAvailable} onChange={(event) => setApproved(event.target.checked)} /><span>Potvrđujem da imam osnov i odobrenje za slanje ove audio izjave vanjskom obrađivaču. <button type="button" className="inline-link" onClick={() => setPrivacyOpen(true)}>Saznaj više.</button></span></label>}
      </section>

      <section className="panel recording-panel" aria-labelledby="record-title">
        <div className="section-heading"><div><p className="eyebrow">2. SNIMANJE</p><h2 id="record-title">Zabilježite izjavu</h2></div><span className="route-label">{mode === "cloud" ? `${profileName} · ${config?.cloud?.routeLabel || "vanjska ruta"}` : "lokalni uređaj"}</span></div>
        <p className="recording-copy">{mode === "cloud" ? "Zvučni zapis se šalje tek nakon završetka izjave. Nema slanja djelimičnog audio zapisa." : "Lokalna transkripcija nije dostupna u ovoj verziji desktop poveznice."}</p>
        <RecorderSafe enabled={mode === "cloud" && cloudAvailable} remoteProcessingApproved={approved} profile={profile} onTranscript={primiTranskript} onError={(value) => { setError(sigurnosnaPoruka(value)); setMessage(""); }} onProcessing={() => { setError(""); setMessage("Obrađujem završenu izjavu…"); }} onStateChange={setCaptureState} />
        {message && <p className="processing-message" aria-live="polite">{message}</p>}
      </section>

      <section className="panel transcript-panel" aria-labelledby="transcript-title">
        <div className="section-heading"><div><p className="eyebrow">3. PREGLED</p><h2 id="transcript-title">Konačni transkript</h2></div>{transcript && <span className="final-chip">Konačan</span>}</div>
        <p className="muted">Uredite završeni tekst prije pripreme nacrta. Izmjena označava postojeći nacrt kao zastario.</p>
        <textarea aria-label="Konačni transkript" className="transcript-area" value={transcript} onChange={(event) => promijeniTranskript(event.target.value)} placeholder="Konačni transkript će se pojaviti nakon obrade ili ga ovdje unesite ručno." rows="7" />
        <div className="panel-actions"><button className="button secondary" onClick={() => setClearOpen(true)}>Obriši trenutnu sesiju</button><button className="button primary" onClick={() => pripremiNacrt()} disabled={!transcript.trim() || busy}>{draftStale ? "Ponovo pripremi lokalni nacrt" : "Pripremi lokalni nacrt"}</button></div>
      </section>

      <section className="panel draft-panel" aria-labelledby="draft-title">
        <div className="section-heading"><div><p className="eyebrow">4. NACRT</p><h2 id="draft-title">SOAP nacrt za provjeru</h2></div><span className="draft-chip">Nije zapis</span></div>
        <div className="clinical-warning">Nacrt nije potvrđen medicinski zapis. Kliničar mora provjeriti, dopuniti i odobriti sadržaj prije upotrebe.</div>
        {draftStale && <div className="stale-warning">Transkript je izmijenjen nakon pripreme nacrta. Pripremite nacrt ponovo prije upotrebe.</div>}
        <div className="soap-grid">{POLJA.map(([key, label, source]) => <label className="soap-field" key={key}><span><strong>{label}</strong><small>{source}</small></span><textarea aria-label={label} value={draft[key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} rows="4" /></label>)}</div>
        {draft.warnings.length > 0 && <aside className="warnings"><strong>Upozorenja</strong><ul>{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></aside>}
        <div className="panel-actions"><button className="button secondary" onClick={kopirajNacrt} disabled={!transcript.trim()}>{copied ? "Kopirano" : "Kopiraj nacrt"}</button><button className="button primary" onClick={() => pripremiNacrt()} disabled={!transcript.trim() || busy}>Ponovo pripremi lokalni nacrt</button></div>
      </section>
    </div>

    {settingsOpen && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-heading"><h2 id="settings-title">Postavke</h2><button className="icon-button" aria-label="Zatvori postavke" onClick={() => setSettingsOpen(false)}>×</button></div><p className="muted">Promjene se primjenjuju na novu izjavu. Tajne i API ključevi se ne prikazuju u aplikaciji.</p><fieldset disabled={locked}><legend>Profil vanjske transkripcije</legend><div className="profile-row"><button className={`profile-button ${profile === "mai" ? "active" : ""}`} onClick={() => setProfile("mai")}>MAI Transcribe 2</button><button className={`profile-button ${profile === "whisper" ? "active" : ""}`} onClick={() => setProfile("whisper")}>Whisper Large v3</button></div></fieldset><div className="settings-info"><strong>Odredište zvuka</strong><span>{mode === "cloud" ? (config?.cloud?.routeDescription || "Vanjski obrađivač") : "Lokalni uređaj"}</span></div><button className="button secondary" onClick={() => { setSettingsOpen(false); setClearOpen(true); }}>Obriši trenutnu sesiju</button></section></div>}
    {privacyOpen && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title"><div className="modal-heading"><h2 id="privacy-title">Privatnost i obrada</h2><button className="icon-button" aria-label="Zatvori privatnost" onClick={() => setPrivacyOpen(false)}>×</button></div><p>Vanjska obrada šalje samo završenu izjavu na odabrani profil. Djelimični audio se ne šalje, a aplikacija ne pohranjuje audio, transkript ili nacrt u preglednik.</p><p>Za kliničke podatke vanjska ruta se smije koristiti tek kada su aktivni tačna EU regija, ugovor o obradi podataka i odobrenje ustanove.</p><p className="muted">Ova aplikacija ne daje pravni savjet i ne zamjenjuje politiku vaše ustanove.</p></section></div>}
    {clearOpen && <div className="modal-backdrop" role="presentation"><section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="clear-title"><h2 id="clear-title">Obrisati trenutnu sesiju?</h2><p>Transkript, nacrt i stanje odobrenja brišu se iz memorije. Ova radnja se ne može vratiti.</p><div className="panel-actions"><button className="button secondary" onClick={() => setClearOpen(false)}>Odustani</button><button className="button danger" onClick={obrisiSesiju}>Obriši sesiju</button></div></section></div>}
  </main>;
}
