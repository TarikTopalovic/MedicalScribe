// Session API guarantees: nothing leaves the device without approval, and a
// draft is only ever prepared from a final transcript.
const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");

const sessionsRouter = require("../routes/sessions");

let base;
let server;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/sessions", sessionsRouter);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/sessions`;
});

test.after(() => server?.close());

const post = (path, body) => fetch(base + path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

test("a local session needs no external approval", async () => {
  const response = await post("", { mode: "local" });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.mode, "local");
  assert.match(body.id, /^[0-9a-f-]{36}$/);
});

test("cloud and hybrid sessions are refused without approval", async () => {
  for (const mode of ["cloud", "hybrid"]) {
    const response = await post("", { mode });
    assert.equal(response.status, 403, `${mode} must require approval`);
  }
});

test("an approved external session is created", async () => {
  const response = await post("", { mode: "hybrid", remote_processing_approved: true });
  assert.equal(response.status, 201);
});

test("an unknown mode is refused", async () => {
  assert.equal((await post("", { mode: "elsewhere" })).status, 400);
});

test("a draft needs a final transcript", async () => {
  const { id } = await (await post("", { mode: "local" })).json();
  assert.equal((await post(`/${id}/draft`, { segments: [] })).status, 400);
});

test("deleting a session clears it", async () => {
  const { id } = await (await post("", { mode: "local" })).json();
  const removed = await fetch(`${base}/${id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  assert.equal((await post(`/${id}/draft`, { segments: [{ text: "x" }] })).status, 404);
});
