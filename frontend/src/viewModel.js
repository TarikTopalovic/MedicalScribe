// The view model that feeds the generated design.
//
// This is the design export's own renderVals(), moved out of the export and
// pointed at a session source instead of its sample records. Every key the
// markup reads is produced here; `src` is either the scripted demo session or
// the live microphone session, so the two behave identically on screen.
import { CHIP, CONSENT, PROFILES, PHASES, ERRORS, GOVERNANCE, DEPTS, initials, accIni, mmss } from "./data.js";

export function buildViewModel(app, src) {
    const s = app.state;
    const active = s.accounts[s.activeAcc] || s.accounts[0];
    const consentDone = s.consent.every(Boolean);
    // `cloud` means the audio itself leaves the device; `hybrid` keeps the
    // audio local and sends only the finished transcript text out.
    const cloud = s.mode === 'cloud';
    const hybrid = s.mode === 'hybrid';
    const external = cloud || hybrid;
    const cloudRoute = s.cloudProfile === PROFILES[0] ? 'EU ruta u regionu' : 'standardna OpenRouter ruta';
    const captureBusy = s.running || !!s.phase;
    const shown = s.finished ? src.lines.length - 1 : s.idx;
    const err = s.errKey ? ERRORS[s.errKey] : null;

    const seg = (i) => (s.segOverride[i] !== undefined ? s.segOverride[i] : src.lines[i].t);
    const speakerOf = (i) => (s.speakerFixed[i] ? src.patientLabel : src.lines[i].sp);

    const note = s.note || src.genNote();
    const noteReady = s.finished;

    const soapLive = src.soap.map(sec => {
      const items = sec.items.filter(it => it.a <= s.idx || s.finished);
      return { label: sec.label, items, empty: items.length === 0 };
    });
    const filled = soapLive.reduce((n, x) => n + x.items.length, 0);
    const total = src.soap.reduce((n, x) => n + x.items.length, 0);

    const flags = (s.finished ? src.flags : src.flags.filter(f => f.a <= s.idx))
      .filter(f => !(src.lines[f.a] && src.lines[f.a].unk && s.speakerFixed[f.a]));

    const statusMap = src.demo
      ? { label: 'Demonstracija', bg: '#F2F2F4', border: '#E3E3E7', fg: '#6E6E73', dot: '#86868B' }
      : err
      ? { label: 'Greška', bg: '#FDF3F1', border: '#F6D9D3', fg: '#8E1F14', dot: '#C0281A' }
      : s.phase
        ? { label: 'Obrada u toku', bg: '#FCF3E3', border: '#EEDFC2', fg: '#8A5B00', dot: '#C77700' }
        : cloud
          ? { label: 'Vanjska obrada', bg: '#E9F2FE', border: '#CFE2FA', fg: '#0058B9', dot: '#0071E3' }
          : hybrid
            ? { label: 'Hibridno', bg: '#EDF1FD', border: '#D5DCF7', fg: '#3B3F94', dot: '#5A61D6' }
            : { label: 'Lokalno', bg: '#F0F7F1', border: '#D6EBD9', fg: '#1F7A36', dot: '#30B050' };

    const meterActive = s.running;
    const meterBars = [0.4, 0.85, 0.6, 1, 0.5, 0.75].map((h, i) => ({
      scale: meterActive ? 1 : h * 0.4,
      color: meterActive ? '#0071E3' : '#DEDEE3',
      anim: meterActive ? 'zbar ' + (620 + i * 90) + 'ms ease-in-out infinite' : 'none'
    }));

    const modeOptions = [
      {
        key: 'local', title: 'Lokalna transkripcija',
        body: 'Koristi lokalni streaming model kad je instaliran. Zvuk ostaje na ovom računaru.',
        reason: s.thermal === 'potrebno hlađenje' ? 'Uređaj se hladi — lokalna obrada je privremeno usporena.' : ''
      },
      {
        key: 'hybrid', title: 'Hibridna obrada',
        body: 'Zvuk se prepisuje na ovom računaru. Vanjskom modelu ide samo konačni tekst transkripta, nikada zvuk.',
        reason: s.cloudBlocked ? ERRORS[s.cloudBlocked].title + ' — ' + ERRORS[s.cloudBlocked].text : ''
      },
      {
        key: 'cloud', title: 'Vanjska transkripcija (MAI / Whisper)',
        body: 'Šalje samo završene izjave na profil ' + s.cloudProfile + ' (' + cloudRoute + ').',
        reason: s.cloudBlocked ? ERRORS[s.cloudBlocked].title + ' — ' + ERRORS[s.cloudBlocked].text : ''
      }
    ].map(m => {
      const on = s.mode === m.key;
      const blocked = (m.key === 'cloud' || m.key === 'hybrid') && !!s.cloudBlocked;
      return {
        title: m.title, body: m.body, reason: m.reason,
        disabled: blocked, settingsDisabled: blocked || captureBusy,
        opacity: blocked ? 0.55 : 1, settingsOpacity: blocked || captureBusy ? 0.55 : 1,
        bg: on ? '#F5F8FD' : '#FBFBFC', border: on ? '#C9DEF8' : '#E9E9EC',
        ring: on ? '#0071E3' : '#D2D2D7', fill: on ? '#0071E3' : 'transparent',
        pick: () => app.setState({ mode: m.key, cloudApproved: false })
      };
    });

    const segments = src.lines.slice(0, shown + 1).map((l, i) => {
      const editing = s.segEdit === i;
      return {
        sp: speakerOf(i), t: seg(i),
        color: l.d ? '#0058B9' : '#8A5A2B',
        span: mmss(i * 14) + ' – ' + mmss(i * 14 + 13),
        warn: l.low ? 'Niska pouzdanost · 92 %' : (l.unk && !s.speakerFixed[i] ? 'Govornik nije prepoznat' : ''),
        unknown: !!l.unk && !s.speakerFixed[i],
        edited: s.segOverride[i] !== undefined,
        editing, reading: !editing,
        bg: s.jump === i ? '#F5F8FD' : 'transparent',
        edit: () => app.setState({ segEdit: i, segDraft: seg(i) }),
        fixSpeaker: () => app.setState(st => ({ speakerFixed: Object.assign({}, st.speakerFixed, { [i]: true }) }))
      };
    });

    const noteFields = src.soap.map((sec, i) => {
      const evidence = sec.items.map(it => it.a).filter((v, k, arr) => arr.indexOf(v) === k)
        .map(a => ({ label: 'Replika ' + (a + 1), jump: () => app.setState({ jump: a }) }));
      return {
        label: sec.label,
        text: note[i] || '',
        rows: sec.interp ? 3 : 4,
        placeholder: sec.interp ? 'npr. Akutna infekcija gornjih dišnih puteva — potvrditi radiografijom' : 'Nacrt je prazan — upišite sadržaj',
        touched: !!s.noteTouched[i],
        border: s.approved ? '#E9E9EC' : '#D2D2D7',
        bg: s.approved ? '#FAFAFC' : '#FFFFFF',
        evidence, hasEvidence: evidence.length > 0, noEvidence: evidence.length === 0,
        note: sec.interp ? 'Procjena nije izrečena u razgovoru. Lokalni nacrt je ostavio polje prazno umjesto da pretpostavi dijagnozu — upišite procjenu ili je označite kao neodređenu.' : '',
        onInput: (e) => {
          const v = e.target.value;
          app.setState(st => {
            const next = (st.note || src.genNote()).slice();
            next[i] = v;
            return { note: next, noteTouched: Object.assign({}, st.noteTouched, { [i]: true }) };
          });
        }
      };
    });

    const visits = src.visits.map(v => {
      const status = v.now && s.approved ? 'Potpisano' : v.status;
      const c = CHIP[status] || CHIP['Zakazano'];
      return {
        time: v.time, name: v.name, reason: v.reason, status, initials: v.initials || initials(v.name),
        chipBg: c[0], chipFg: c[1],
        actionable: !!(v.now || v.draft),
        actionLabel: v.now ? (s.approved ? 'Otvori' : 'Započni') : 'Pregledaj',
        action: v.now ? (s.approved ? app.go('reports') : app.go('consent')) : app.go('review')
      };
    });

    const reports = src.reports.map((r, i) => {
      const c = CHIP[r.status];
      return Object.assign({}, r, { chipBg: c[0], chipFg: c[1], bg: i === s.sel ? '#F5F8FD' : '#fff', select: () => app.setState({ sel: i }) });
    });

    const HIST = src.history;

    const lowConf = src.lines.slice(0, shown + 1).some((l, i) => l.low || (l.unk && !s.speakerFixed[i]));

    return {
      isSignin: s.screen === 'signin', isApp: s.screen !== 'signin',
      isToday: s.screen === 'today', isConsent: s.screen === 'consent', isVisit: s.screen === 'visit',
      isReview: s.screen === 'review', isReports: s.screen === 'reports',
      signIn: app.go('today'), goToday: app.go('today'), goVisit: app.go('visit'),
      goReview: app.go('review'), goReports: app.go('reports'),
      showBack: s.screen !== 'today' && s.screen !== 'reports',
      goBack: app.go('today'),
      tabs: [
        { label: 'Danas', go: app.go('today'), count: '', live: false, bg: s.screen === 'today' ? '#1D1D1F' : '#fff', fg: s.screen === 'today' ? '#fff' : '#1D1D1F', border: s.screen === 'today' ? '#1D1D1F' : '#E3E3E7' },
        { label: 'Izvještaji', go: app.go('reports'), count: '', live: false, bg: s.screen === 'reports' ? '#1D1D1F' : '#fff', fg: s.screen === 'reports' ? '#fff' : '#1D1D1F', border: s.screen === 'reports' ? '#1D1D1F' : '#E3E3E7' }
      ].concat(s.idx >= 0 && !s.approved ? [{
        label: s.finished ? 'Sesija · na pregledu' : 'Sesija u toku',
        go: app.go(s.finished ? 'review' : 'visit'), count: '', live: s.running,
        bg: (s.screen === 'visit' || s.screen === 'review') ? '#1D1D1F' : '#fff',
        fg: (s.screen === 'visit' || s.screen === 'review') ? '#fff' : '#1D1D1F',
        border: (s.screen === 'visit' || s.screen === 'review') ? '#1D1D1F' : '#E3E3E7'
      }] : []),

      statusLabel: statusMap.label, statusBg: statusMap.bg, statusBorder: statusMap.border, statusFg: statusMap.fg, statusDot: statusMap.dot,
      hasDrafts: true,
      draftsTitle: (s.approved ? 2 : 3) + ' nacrta čeka provjeru',
      modeShort: cloud ? 'Vanjska · ' + s.cloudProfile : (hybrid ? 'Hibridno · nalaz vanjski' : 'Lokalno na uređaju'),
      railNote: src.demo
        ? 'Demonstracija bez mikrofona: pokrenite lokalni servis ili unesite OpenRouter ključ za stvarnu sesiju.'
        : cloud
        ? 'Vanjska obrada: ' + s.cloudProfile + '. Šalju se samo završene izjave.'
        : hybrid
          ? 'Hibridna obrada: zvuk ostaje na uređaju, a konačni tekst ide vanjskom modelu za nalaz.'
          : 'Lokalna obrada: zvuk ostaje na ovom računaru i ne pohranjuje se.',

      errorActive: !!err, errorTitle: err ? err.title : '', errorText: err ? err.text : '',
      errorOffersLocal: !!(err && err.local && external),
      switchToLocal: () => app.setState({ mode: 'local', errKey: null }),
      retryError: () => app.setState({ errKey: null }),
      dismissError: () => app.setState({ errKey: null }),

      openSettings: () => app.setState({ settingsOpen: true, privacyOpen: false, accountMenuOpen: false }),
      openPrivacy: () => app.setState({ privacyOpen: true, settingsOpen: false, accountMenuOpen: false }),
      closeModals: () => app.setState({ settingsOpen: false, privacyOpen: false }),
      settingsOpen: s.settingsOpen, privacyOpen: s.privacyOpen, governance: GOVERNANCE,
      settingsLocked: captureBusy ? 'Način i profil se ne mogu mijenjati dok snimanje ili obrada traje. Izmjene se primjenjuju na novu izjavu.' : '',
      routeSummary: cloud
        ? 'Završene izjave idu na ' + s.cloudProfile + ' · ' + cloudRoute + '. Djelimičan zvuk se ne šalje.'
        : hybrid
          ? 'Zvuk se prepisuje na uređaju. Vanjskom modelu ide samo konačni tekst transkripta · ' + cloudRoute + '.'
          : 'Zvuk ostaje na ovom računaru. Ništa se ne šalje van ordinacije.',
      thermalText: s.thermal,
      profileOptions: PROFILES.map(p => ({
        name: p, disabled: captureBusy, opacity: captureBusy ? 0.55 : 1,
        bg: s.cloudProfile === p ? '#0071E3' : '#fff',
        fg: s.cloudProfile === p ? '#fff' : '#1D1D1F',
        border: s.cloudProfile === p ? '#0071E3' : '#D9D9DE',
        pick: () => app.setState({ cloudProfile: p, cloudApproved: false })
      })),
      mics: src.mics, mic: s.mic, captureBusy,
      onMicChange: (e) => app.setState({ mic: e.target.value }),
      errorSims: [
        { key: 'approval', label: 'Nema odobrenja' }, { key: 'payment', label: 'Naplata odbijena' },
        { key: 'eu', label: 'EU ruta blokirana' }, { key: 'thermal', label: 'Toplinska zaštita' },
        { key: 'network', label: 'Prekid veze' }, { key: 'mic', label: 'Mikrofon nije podržan' }
      ].map(e => ({ label: e.label, fire: app.fireError(e.key) })),

      deptOptions: (active.depts || [active.dept]).map(d => ({
        name: d,
        bg: d === active.dept ? '#0071E3' : '#fff',
        fg: d === active.dept ? '#fff' : '#1D1D1F',
        border: d === active.dept ? '#0071E3' : '#D9D9DE',
        pick: () => app.pickDept(d)
      })),
      pwType: s.pwVisible ? 'text' : 'password',
      pwHidden: !s.pwVisible, pwShown: !!s.pwVisible,
      pwLabel: s.pwVisible ? 'Sakrij lozinku' : 'Prikaži lozinku',
      togglePw: () => app.setState(st => ({ pwVisible: !st.pwVisible })),
      rulesOpen: !!s.rulesOpen,
      rulesArrow: s.rulesOpen ? 'rotate(180deg)' : 'none',
      toggleRules: () => app.setState(st => ({ rulesOpen: !st.rulesOpen })),
      toggleRemember: () => app.setState(st => ({ remember: !st.remember })),
      rememberMark: s.remember ? '✓' : '',
      rememberBg: s.remember ? '#0071E3' : '#fff',
      rememberBorder: s.remember ? '#0071E3' : '#D2D2D7',
      deptSavedNote: (active.depts || []).length > 1 ? 'Sačuvani odjeli — odaberite za ovu smjenu' : 'Sačuvano s prijašnje prijave',
      canAddDept: DEPTS.some(d => (active.depts || []).indexOf(d) === -1),
      deptPickerOpen: s.deptPickerOpen,
      deptPickerBg: s.deptPickerOpen ? '#F1F7FE' : '#fff',
      toggleDeptPicker: () => app.setState(st => ({ deptPickerOpen: !st.deptPickerOpen })),
      addableDepts: DEPTS.filter(d => (active.depts || []).indexOf(d) === -1).map(d => ({
        name: d, add: () => app.pickDept(d, true)
      })),
      accountMenuOpen: s.accountMenuOpen,
      accountRowBg: s.accountMenuOpen ? '#F0F0F3' : '#fff',
      toggleAccountMenu: () => app.setState(st => ({ accountMenuOpen: !st.accountMenuOpen })),
      activeName: active.name, activeDept: active.dept, activeIni: accIni(active.name),
      activeShort: active.name.replace(/^dr\.\s*/, 'dr. '),
      accounts: s.accounts.map((a, i) => ({
        name: a.name, dept: a.dept, ini: accIni(a.name),
        mark: i === s.activeAcc ? '✓' : '',
        bg: i === s.activeAcc ? '#F5F8FD' : 'transparent',
        avBg: i === s.activeAcc ? '#D9E7FA' : '#F0F0F3',
        avFg: i === s.activeAcc ? '#0058B9' : '#6E6E73',
        pick: () => app.setState({ activeAcc: i, dept: a.dept, accountMenuOpen: false })
      })),
      addAccount: () => app.setState({ accountMenuOpen: false, screen: 'signin' }),
      askLogOut: app.ask({ title: 'Odjaviti se?', body: 'Trenutna sesija i nacrt se brišu iz memorije. Ova radnja se ne može vratiti.', label: 'Odjavi se', danger: true, action: 'logout' }),

      consentItems: CONSENT.map((c, i) => ({
        title: c.title, body: c.body, mark: s.consent[i] ? '✓' : '',
        bg: s.consent[i] ? '#F5F8FD' : '#FBFBFC',
        border: s.consent[i] ? '#C9DEF8' : '#E9E9EC',
        dotBg: s.consent[i] ? '#0071E3' : '#fff',
        dotBorder: s.consent[i] ? '#0071E3' : '#D2D2D7',
        toggle: () => app.setState(st => { const n = st.consent.slice(); n[i] = !n[i]; return { consent: n }; })
      })),
      consentProgress: s.consent.filter(Boolean).length + ' od 3 potvrđeno',
      modeOptions, cloudChosen: cloud, cloudProfile: s.cloudProfile, cloudRoute,
      toggleCloudApproval: () => app.setState(st => ({ cloudApproved: !st.cloudApproved })),
      approvalMark: s.cloudApproved ? '✓' : '',
      approvalBoxBg: s.cloudApproved ? '#0071E3' : '#fff',
      approvalBoxBorder: s.cloudApproved ? '#0071E3' : '#D2D2D7',
      startVisit: app.start,
      startBlocked: !consentDone || (external && (!s.cloudApproved || !!s.cloudBlocked)),
      startBtnBg: (!consentDone || (external && (!s.cloudApproved || !!s.cloudBlocked))) ? '#C7C7CC' : '#0071E3',
      startHint: !consentDone
        ? 'Potvrdite sve tri stavke saglasnosti.'
        : (external && s.cloudBlocked ? 'Vanjska obrada je blokirana — prebacite se na lokalnu.' :
          (external && !s.cloudApproved ? 'Označite potvrdu za vanjsku obradu.' :
            (cloud ? 'Mikrofon se aktivira nakon pokretanja. Prima: ' + s.cloudProfile + '.' :
              (hybrid ? 'Mikrofon se aktivira nakon pokretanja. Zvuk ostaje na uređaju; vanjski model dobiva samo tekst.' : 'Mikrofon se aktivira nakon pokretanja. Obrada ostaje na uređaju.')))),

      clock: mmss(Math.max(0, (shown + 1) * 14)),
      recLabel: s.running ? 'Snima se' : (s.phase ? PHASES[s.phase] : (s.finished ? 'Izjava završena' : 'Spremno')),
      recDot: s.running ? '#E0301A' : (s.phase ? '#C77700' : '#C7C7CC'),
      recAnim: s.running ? 'zpulse 1.2s infinite' : 'none',
      phaseLabel: s.phase ? PHASES[s.phase] : '',
      meterBars, meterText: s.running ? 'Nivo zvuka: dobar' : 'Nivo zvuka: nema signala',
      finishUtterance: app.finish,
      finishBlocked: !s.running,
      finishBtnBg: s.running ? '#1D1D1F' : '#C7C7CC',
      reviewBlocked: !s.finished,
      reviewBtnBg: s.finished ? '#0071E3' : '#F7F7F9',
      reviewBtnFg: s.finished ? '#fff' : '#B0B0B5',
      reviewBtnBorder: s.finished ? '#0071E3' : '#E9E9EC',
      captureNotice: src.demo
        ? 'Demonstracija: prikazuje se pripremljeni primjer razgovora. Mikrofon nije aktivan i ništa se ne snima.'
        : cloud
        ? 'Vanjska obrada: zvuk završene izjave ide na ' + s.cloudProfile + ' (' + cloudRoute + '). Nema pohrane snimka.'
        : hybrid
          ? 'Hibridna obrada: zvuk se prepisuje na uređaju i ne pohranjuje se. Van uređaja ide samo konačni tekst.'
          : 'Lokalna obrada: zvuk ostaje u baferu od 3 s i ne pohranjuje se. Mikrofon: ' + s.mic + '.',
      lines: src.lines.slice(0, shown + 1).map((l, i) => ({
        sp: speakerOf(i), t: seg(i), color: l.d ? '#0058B9' : '#8A5A2B', at: mmss(i * 14),
        warn: l.low ? 'Niska pouzdanost' : (l.unk && !s.speakerFixed[i] ? 'Govornik nije prepoznat' : '')
      })),
      lineCount: (shown + 1) + ' od ' + src.lines.length + ' segmenata',
      provisional: s.provisional,
      idleNotice: s.idx < 0 ? 'Mikrofon je aktivan. Transkript se pojavljuje kako razgovor teče.' : '',
      soap: soapLive, progress: Math.round(filled / total * 100) + '%',
      flags, noFlags: flags.length === 0,

      segments, segDraft: s.segDraft,
      onSegInput: (e) => app.setState({ segDraft: e.target.value }),
      saveSeg: () => app.setState(st => ({
        segOverride: Object.assign({}, st.segOverride, { [st.segEdit]: st.segDraft }),
        segEdit: null, noteStale: true
      })),
      cancelSeg: () => app.setState({ segEdit: null, segDraft: '' }),
      confidenceWarning: lowConf ? 'Jedan ili više segmenata ima nisku pouzdanost ili nepoznatog govornika. Provjerite ih prije odobrenja nalaza.' : '',
      manualOpen: s.manualOpen, manualText: s.manualText,
      manualLabel: s.manualOpen ? 'Sakrij ručni tekst' : 'Dodaj ručni tekst',
      toggleManual: () => app.setState(st => ({ manualOpen: !st.manualOpen })),
      onManualInput: (e) => app.setState({ manualText: e.target.value }),
      askRepeat: app.ask({ title: 'Ponoviti ovu izjavu?', body: 'Konačni transkript ove izjave se odbacuje i snimanje počinje ispočetka. Zvuk se ne šalje ponovo automatski.', label: 'Ponovi izjavu', danger: false, action: 'repeat' }),
      askClearSession: app.ask({ title: 'Obrisati trenutnu sesiju?', body: 'Transkript, nacrt i stanje snimanja brišu se iz memorije. Ova radnja se ne može vratiti.', label: 'Obriši sesiju', danger: true, action: 'clear' }),

      noteFields, noteStale: s.noteStale && noteReady,
      noteChip: s.approved ? 'Potpisano · v2' : (noteReady ? 'Nacrt · nije zapis' : 'Čeka konačni transkript'),
      noteChipBg: s.approved ? '#F0F7F1' : '#FCF3E3',
      noteChipFg: s.approved ? '#1F7A36' : '#9A5B00',
      noteMeta: noteReady ? 'Pripremljeno lokalno iz konačnog transkripta · 15 segmenata' : 'Nacrt nastaje nakon konačnog transkripta',
      regenerate: () => app.regenerate(src),
      copyDraft: () => app.copyDraft(note),
      copyLabel: s.copied ? 'Kopirano' : 'Kopiraj nacrt',
      approved: s.approved, notApproved: !s.approved,
      askApprove: app.ask({ title: 'Odobriti i potpisati nalaz?', body: 'Potpisom nalaz ulazi u karton pacijenta i zapis se zaključava. Svaka kasnija izmjena otvara novu verziju.', label: 'Odobri i potpiši', danger: false, action: 'approve' }),
      approveBlocked: !noteReady || (s.noteStale && noteReady),
      approveBtnBg: (!noteReady || (s.noteStale && noteReady)) ? '#C7C7CC' : '#0071E3',
      approveHint: !noteReady
        ? 'Nalaz se može odobriti samo iz konačnog transkripta. Završite izjavu.'
        : (s.noteStale ? 'Transkript je izmijenjen — pripremite nacrt ponovo prije potpisa.' : 'Nacrt je vidljiv samo vama. Potpisom ulazi u karton pacijenta.'),
      approvedMeta: active.name + ' · 12.09.2026. u 10:41.',
      processingRows: [
        { k: 'Snimak', v: 'Nije pohranjen' },
        { k: 'Transkript', v: 'Memorija sesije' },
        { k: 'Obrada', v: cloud ? s.cloudProfile + ' · ' + cloudRoute : (hybrid ? 'Transkript na uređaju · nalaz ' + cloudRoute : 'Lokalni model na uređaju') },
        { k: 'Mikrofon', v: s.mic },
        { k: 'Toplinska zaštita', v: s.thermal }
      ],

      reports, history: HIST[s.sel], selName: reports[s.sel].name + ' · ' + reports[s.sel].date,
      draftCount: s.approved ? 2 : 3, visits,

      confirmOpen: !!s.confirm,
      confirmTitle: s.confirm ? s.confirm.title : '',
      confirmBody: s.confirm ? s.confirm.body : '',
      confirmLabel: s.confirm ? s.confirm.label : '',
      confirmBtnBg: s.confirm && s.confirm.danger ? '#C0281A' : '#0071E3',
      confirmNo: () => app.setState({ confirm: null }),
      confirmYes: () => {
        const c = s.confirm;
        app.setState({ confirm: null });
        if (!c) return;
        if (c.action === 'clear') app.clearSession();
        if (c.action === 'logout') { app.clearTimers(); app.clearSession(); app.setState({ screen: 'signin' }); }
        if (c.action === 'approve') app.setState({ approved: true });
        if (c.action === 'repeat') {
          app.clearTimers();
          app.setState({ screen: 'visit', idx: -1, running: false, finished: false, phase: null, provisional: '', note: null, noteStale: false, segOverride: {}, segEdit: null });
        }
      },

      scrollRef: app.scrollRef
    };
}
