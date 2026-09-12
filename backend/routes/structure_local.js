// Lightweight, local-only draft creation. It never makes a model request.
const express = require("express");

const router = express.Router();

router.post("/", (req, res) => {
  const { transcript } = req.body;
  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ greska: "Polje 'transcript' je obavezno i mora biti tekst." });
  }
  if (transcript.length > 12000) {
    return res.status(400).json({ greska: "Transkript je predugačak za nacrt." });
  }
  return res.json({
    subjective: transcript.trim(),
    objective: "",
    assessment: "Potrebna je klinička procjena; dijagnoza nije automatski izvedena.",
    plan: "Kliničar treba pregledati, dopuniti i odobriti nacrt.",
    warnings: [
      "Lokalno generisan nacrt; obavezna je provjera i odobrenje kliničara.",
      "Automatska dijagnoza nije generisana.",
    ],
  });
});

module.exports = router;
