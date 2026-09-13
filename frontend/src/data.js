// Design constants and the demo consultation, taken verbatim from the
// Design Canvas export. The demo records drive presentation mode; the rest
// (chips, phases, error copy, governance list) are used by the live app too.


export const TR = [
  { sp: 'dr. Begić', d: true, t: 'Dobar dan, Amina. Sjedite. Recite mi šta vas dovodi danas.' },
  { sp: 'Amina H.', d: false, t: 'Kašljem već pet dana. Suh kašalj, najgori mi je noću.' },
  { sp: 'Amina H.', d: false, t: 'Sinoć sam imala i temperaturu, mjerila sam 38 i po.' },
  { sp: 'dr. Begić', d: true, t: 'Imate li bolove u grudima ili nedostatak zraka?' },
  { sp: 'Nepoznat govornik', d: false, unk: true, t: 'Bola nema. Zadišem se kad se penjem stepenicama, prije toga nisam.' },
  { sp: 'dr. Begić', d: true, t: 'Uzimate li nešto od lijekova? I znate li za neku alergiju?' },
  { sp: 'Amina H.', d: false, t: 'Paracetamol po potrebi. Na penicilin sam alergična, kao dijete sam dobila osip.' },
  { sp: 'dr. Begić', d: true, t: 'U redu, to ćemo zapisati. Sad ću izmjeriti temperaturu i saturaciju, pa ću vas poslušati.' },
  { sp: 'dr. Begić', d: true, t: 'Temperatura 37,8. Saturacija 97 posto. Puls 88.' },
  { sp: 'dr. Begić', d: true, t: 'Auskultatorno: oslabljen šum desno bazalno, pukota nema.' },
  { sp: 'dr. Begić', d: true, t: 'Grlo je blago crveno, limfni čvorovi nisu uvećani.' },
  { sp: 'dr. Begić', d: true, t: 'Najvjerovatnije je virusna infekcija, ali zbog nalaza desno bazalno tražit ćemo snimak pluća.' },
  { sp: 'dr. Begić', d: true, low: true, t: 'Nastavite paracetamol i puno tekućine. Ako zatreba antibiotik, zbog alergije idemo na azitromicin.' },
  { sp: 'Amina H.', d: false, t: 'Kad da se vratim?' },
  { sp: 'dr. Begić', d: true, t: 'Kontrola za tri dana, ili ranije ako se pogorša. Snimak napravite danas.' }
];

export const SOAP = [
  { label: 'Subjektivno', items: [
    { a: 1, t: 'Uporan suh kašalj u trajanju od pet dana, izraženiji noću.' },
    { a: 2, t: 'Subjektivna febrilnost do 38,5 °C prethodne noći.' },
    { a: 4, t: 'Bez bola u grudima. Dispneja pri naporu, novonastala.' },
    { a: 6, t: 'Terapija kod kuće: paracetamol po potrebi. Alergija na penicilin (osip u djetinjstvu).' }
  ]},
  { label: 'Objektivno', items: [
    { a: 8, t: 'T 37,8 °C · SpO₂ 97 % · puls 88/min.' },
    { a: 9, t: 'Auskultatorno oslabljen šum desno bazalno, bez pukota.' },
    { a: 10, t: 'Farinks blago hiperemičan, limfni čvorovi neuvećani.' }
  ]},
  { label: 'Procjena', interp: true, items: [] },
  { label: 'Plan', items: [
    { a: 11, t: 'Rtg pluća danas.' },
    { a: 12, t: 'Paracetamol 500 mg po potrebi, obilna hidracija.' },
    { a: 12, t: 'U slučaju bakterijske superinfekcije azitromicin — penicilin kontraindiciran.' },
    { a: 14, t: 'Kontrola za tri dana ili prije u slučaju pogoršanja.' }
  ]}
];

export const FLAGS = [
  { a: 6, kind: 'Alergija izgovorena u razgovoru', text: 'Penicilin — osip u djetinjstvu. Potvrdite prije unosa u karton.', dot: '#E0642A' },
  { a: 8, kind: 'Vitalni znaci prepisani iz govora', text: 'T 37,8 °C · SpO₂ 97 % · puls 88/min — provjerite uz mjerač.', dot: '#0071E3' },
  { a: 12, kind: 'Niska pouzdanost prepoznavanja', text: '„azitromicin” · 92 % — potvrdite naziv lijeka u konačnom transkriptu.', dot: '#C77700' },
  { a: 4, kind: 'Govornik nije prepoznat', text: 'Jedan segment nema govornika. Označite ga ručno prije odobrenja.', dot: '#8A5B00' }
];

export const CONSENT = [
  { title: 'Snimanje razgovora', body: 'Pacijent je obaviješten da se razgovor sluša radi pripreme nalaza.' },
  { title: 'Način obrade', body: 'Pacijentu je rečeno da li zvuk ostaje na uređaju ili ide vanjskom obrađivaču.' },
  { title: 'Transkript i pravo na brisanje', body: 'Transkript ostaje u memoriji sesije. Pacijent može zatražiti brisanje odmah.' }
];

export const VISITS = [
  { time: '09:00', name: 'Mirza Selimović', reason: 'Kontrola hipertenzije', status: 'Potpisano' },
  { time: '09:30', name: 'Lejla Kovač', reason: 'Bol u donjem dijelu leđa', status: 'Nacrt', draft: true },
  { time: '10:15', name: 'Amina Hodžić', reason: 'Uporan kašalj i temperatura', status: 'Na čekanju', now: true },
  { time: '10:45', name: 'Vedad Đulić', reason: 'Rezultati laboratorije', status: 'Zakazano' },
  { time: '11:15', name: 'Senka Pašić', reason: 'Prva posjeta · migrene', status: 'Zakazano' },
  { time: '11:45', name: 'Damir Alagić', reason: 'Obnova recepta', status: 'Zakazano' }
];

export const CHIP = {
  'Potpisano': ['#F0F7F1', '#1F7A36'],
  'Nacrt': ['#FCF3E3', '#9A5B00'],
  'Na čekanju': ['#E9F2FE', '#0058B9'],
  'Zakazano': ['#F2F2F4', '#6E6E73'],
  'Zaključano': ['#F0F7F1', '#1F7A36']
};

export const DEPTS = ['Porodična medicina', 'Interna medicina', 'Pedijatrija', 'Radiologija'];
export const PROFILES = ['MAI Transcribe 2', 'Whisper Large v3'];
export const MICS = ['Ugrađeni mikrofon', 'USB mikrofon ordinacije', 'Slušalice s mikrofonom'];

export const PHASES = {
  boundary: 'Završavam izjavu…',
  provisional: 'Privremeni transkript',
  quality: 'Provjera kvaliteta',
  final: 'Konačni transkript',
  draft: 'Pripremam lokalni nacrt'
};

export const ERRORS = {
  approval: { title: 'Vanjska obrada nije potvrđena', text: 'Za slanje izjave vanjskom obrađivaču potrebna je vaša potvrda na ekranu sesije. Snimanje nije pokrenuto.', local: true },
  payment: { title: 'Vanjska transkripcija nije dostupna', text: 'Obrađivač je odbio zahtjev zbog nedostatka kredita. Nijedan zvuk nije poslan. Lokalna obrada je dostupna.', local: true },
  eu: { title: 'Klinička ruta u EU nije dostupna', text: 'Konfiguracija za obradu kliničkih podataka u EU trenutno nije aktivna, pa je vanjska obrada blokirana. Lokalna obrada je dostupna.', local: true },
  thermal: { title: 'Lokalna transkripcija zaustavljena', text: 'Obrada je prekinuta da se uređaj ohladi. Ponovni pokušaj nije automatski — pokrenite ga sami kad temperatura padne.' },
  network: { title: 'Veza s obrađivačem prekinuta', text: 'Zahtjev nije uspio. Zvuk nije automatski ponovno poslan, a ručno upisani tekst je sačuvan u memoriji sesije.' },
  mic: { title: 'Mikrofon ili format nisu podržani', text: 'Potreban je mono zapis 16 kHz. Odaberite drugi ulazni uređaj u postavkama ili promijenite pretraživač.' },
  // Added for the live session: a quiet room and a busy queue are ordinary
  // situations, and naming them stops the app from blaming the connection.
  silence: { title: 'Govor nije prepoznat', text: 'U ovoj izjavi nije zabilježen govor, pa ništa nije zapisano. Provjerite odabrani mikrofon u postavkama i ponovite izjavu.' },
  busy: { title: 'Obrada još traje', text: 'Više izjava čeka lokalnu obradu. Sačekajte da se trenutne završe prije nove izjave — ništa nije izgubljeno.' }
};

export const GOVERNANCE = [
  { t: 'Osnov obrade i odobrenje ustanove postoje prije prve vanjske izjave.' },
  { t: 'Ugovor o obradi podataka i EU ruta potvrđeni za odabrani profil.' },
  { t: 'Zvuk, transkript i nacrt se ne upisuju u pohranu pretraživača, zapise konzole ni adresu stranice.' },
  { t: 'Pacijent je obaviješten o načinu obrade i pravu na brisanje.' },
  { t: 'Nalaz ulazi u karton samo nakon provjere i potpisa ljekara.' }
];

export const initials = (n) => n.split(' ').map(w => w[0]).join('');
export const accIni = (n) => n.replace(/^dr\.\s*/, '').split(' ').map(w => w[0]).join('');
export const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
export const genNote = () => SOAP.map(sec => sec.items.map(i => i.t).join(' '));
