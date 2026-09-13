// Client for the local MediScribe bridge. Nothing here writes to storage, the
// URL, or the console: audio and transcript text only ever travel in a request
// body and stay in memory afterwards.

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

async function readError(response) {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.greska || `HTTP ${response.status}`);
  error.status = response.status;
  return error;
}

async function json(path, options) {
  const response = await fetch(BASE + path, options);
  if (!response.ok) throw await readError(response);
  return response.json();
}

export function getConfig() {
  return json("/api/config");
}

export function createSession(mode, approved) {
  return json("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, remote_processing_approved: approved }),
  });
}

export function deleteSession(id) {
  return json(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// One completed utterance. Partial audio is never sent.
export function sendUtterance(id, blob, profile, timing) {
  const form = new FormData();
  form.append("audio", blob, "utterance.webm");
  if (profile) form.append("profile", profile);
  if (timing) {
    form.append("startMs", String(Math.round(timing.startMs)));
    form.append("endMs", String(Math.round(timing.endMs)));
  }
  return json(`/api/sessions/${encodeURIComponent(id)}/audio`, { method: "POST", body: form });
}

// The clinic's day, held by the bridge in backend/data/schedule.json.
export function getSchedule() {
  return json("/api/schedule");
}

// Finalized notes already saved. Empty when persistence is off.
export function getReports() {
  return json("/api/reports");
}

// The draft is prepared from the final transcript only.
export function requestDraft(id, segments) {
  return json(`/api/sessions/${encodeURIComponent(id)}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });
}
