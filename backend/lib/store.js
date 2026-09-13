// Optional Supabase persistence.
//
// Everything here is server-side: the secret key never reaches the renderer,
// and the renderer never talks to Supabase. Audio is never stored — only the
// final transcript and the draft revisions, both owned by one clinician and
// fenced off by the row-level policies in supabase/migrations.
//
// Persistence is best-effort by design. A consultation must not fail because a
// database is unreachable, so every write reports failure to the caller and the
// session carries on in memory.

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CLINICIAN = process.env.MEDISCRIBE_CLINICIAN_EMAIL || "";

const configured = Boolean(URL_BASE && KEY && CLINICIAN);
let ownerId = null;

function headers(extra) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra };
}

async function rest(path, options = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1${path}`, {
    ...options,
    headers: headers(options.headers),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    // Supabase error bodies can quote the offending row; keep them out of logs.
    const error = new Error(`Supabase ${response.status}`);
    error.status = response.status;
    throw error;
  }
  // `return=minimal` answers 201 with an empty body, not 204.
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

// The schema owns rows by auth user. Until the app has real sign-in there is
// one configured clinician, created on first use.
async function resolveOwner() {
  if (ownerId) return ownerId;
  const search = new URLSearchParams({ page: "1", per_page: "200" });
  const listed = await fetch(`${URL_BASE}/auth/v1/admin/users?${search}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  });
  if (listed.ok) {
    const body = await listed.json();
    const found = (body.users || []).find((user) => user.email === CLINICIAN);
    if (found) {
      ownerId = found.id;
      return ownerId;
    }
  }
  const created = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ email: CLINICIAN, email_confirm: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!created.ok) throw new Error("Supabase clinician account unavailable");
  ownerId = (await created.json()).id;
  return ownerId;
}

async function openSession() {
  const owner = await resolveOwner();
  const rows = await rest("/clinical_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ owner_id: owner, language: "bs", status: "open" }),
  });
  return rows[0].id;
}

// One completed utterance. Timing is what the recorder measured; a missing
// confidence stays null rather than being invented.
async function addSegment(recordId, segment) {
  await rest("/transcript_segments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      session_id: recordId,
      segment_index: segment.index,
      speaker: segment.speaker || "unknown",
      transcript_text: segment.text.slice(0, 4000),
      start_ms: Math.max(0, Math.round(segment.startMs)),
      end_ms: Math.max(1, Math.round(segment.endMs)),
      confidence: segment.confidence ?? null,
    }),
  });
}

async function saveDraft(recordId, draft) {
  const existing = await rest(`/draft_notes?session_id=eq.${recordId}&select=revision&order=revision.desc&limit=1`);
  const revision = (existing[0]?.revision || 0) + 1;
  if (revision > 1) {
    await rest(`/draft_notes?session_id=eq.${recordId}&is_current=eq.true`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ is_current: false }),
    });
  }
  const [subjective, objective, assessment, plan] = draft.sections.map((section) =>
    section.items.map((item) => item.text).join(" "));
  await rest("/draft_notes", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      session_id: recordId,
      revision,
      subjective, objective, assessment, plan,
      warnings: draft.warnings || [],
      evidence: draft.sections.map((section) => ({
        label: section.label,
        items: section.items.map((item) => item.evidence || []),
      })),
      is_current: true,
    }),
  });
  await rest(`/clinical_sessions?id=eq.${recordId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "finalized", finalized_at: new Date().toISOString() }),
  });
  return revision;
}

// The reports screen: finalized sessions with their current draft.
async function listReports(limit = 20) {
  const owner = await resolveOwner();
  const select = "id,created_at,finalized_at,status,draft_notes(revision,subjective,objective,assessment,plan,is_current)";
  const rows = await rest(
    `/clinical_sessions?owner_id=eq.${owner}&select=${select}&order=created_at.desc&limit=${limit}`);
  return rows.map((row) => {
    const current = (row.draft_notes || []).find((note) => note.is_current) || row.draft_notes?.[0];
    return {
      id: row.id,
      createdAt: row.created_at,
      finalizedAt: row.finalized_at,
      status: row.status,
      revision: current?.revision || 0,
      summary: (current?.subjective || "").slice(0, 90),
    };
  });
}

module.exports = { configured, openSession, addSegment, saveDraft, listReports };
