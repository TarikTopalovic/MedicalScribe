const fs = require("fs");
const path = require("path");

const source = path.resolve(__dirname, "..", "..", "frontend", "dist");
const destination = path.resolve(__dirname, "..", "renderer");

if (!fs.existsSync(path.join(source, "index.html"))) {
  throw new Error("Build the frontend before preparing the Electron renderer.");
}
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
