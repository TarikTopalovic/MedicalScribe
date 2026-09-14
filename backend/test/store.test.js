// Persistence is optional. With no Supabase configured the consultation must
// still run, and nothing may be sent anywhere.
const assert = require("node:assert/strict");
const test = require("node:test");

const store = require("../lib/store");

test("persistence stays off unless URL, key and clinician are all set", () => {
  assert.equal(store.configured, Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.MEDISCRIBE_CLINICIAN_EMAIL,
  ));
});

test("the store exposes only server-side operations", () => {
  assert.deepEqual(
    Object.keys(store).sort(),
    ["addSegment", "archiveSession", "configured", "deleteSession", "hasIdentityColumns",
      "listReports", "openSession", "saveDraft"].sort(),
  );
});
