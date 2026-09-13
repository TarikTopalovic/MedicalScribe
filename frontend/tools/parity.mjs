// Design parity harness.
//
// Serves the Design Canvas export rendered by its own runtime next to the
// built app, from one origin, so a page script can walk both DOM trees and
// report every difference in structure, inline style and text.
//
//   node tools/parity.mjs      then open http://localhost:4175/
//
// Build the app first (`npm run build`). No dependencies beyond what the
// renderer already installs.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PARITY_PORT || 4175);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".map": "application/json" };

// The export expects React on window; Design Canvas supplies it from a CDN.
const REACT_UMD = [
  "node_modules/react/umd/react.production.min.js",
  "node_modules/react-dom/umd/react-dom.production.min.js",
];

const HARNESS = `<!doctype html><html lang="bs"><head><meta charset="utf-8"><title>Design parity</title>
<style>body{margin:0;font:13px/1.5 ui-sans-serif,system-ui;background:#1d1d1f;color:#f2f2f5}
header{display:flex;gap:12px;align-items:center;padding:10px 14px}
button{padding:7px 14px;border-radius:999px;border:0;background:#0071E3;color:#fff;font-weight:600;cursor:pointer}
#out{padding:0 14px 14px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;max-height:40vh;overflow:auto}
iframe{width:50%;height:62vh;border:0;background:#fff}</style></head><body>
<header><button onclick="run()">Uporedi</button><span id="sum">Klikni kad su oba ekrana na istom koraku.</span></header>
<div><iframe id="ref" src="./ref/"></iframe><iframe id="app" src="./app/index.html?demo=1"></iframe></div>
<pre id="out"></pre>
<script>
const ser = (el, d) => { let out=''; for (const n of el.childNodes) {
  if (n.nodeType===3) { const t=n.textContent.replace(/\\s+/g,' ').trim(); if (t) out += '  '.repeat(d)+'T '+t+'\\n'; }
  else if (n.nodeType===1) {
    const s=(n.getAttribute('style')||'').split(';').map(x=>x.trim().replace(/\\s+/g,' ')).filter(Boolean).sort().join(';');
    const a=[...n.attributes].filter(x=>x.name!=='style'&&x.name!=='class'&&x.name!=='data-dc-tpl').map(x=>x.name+'='+x.value).sort().join(',');
    out += '  '.repeat(d)+n.tagName.toLowerCase()+' {'+s+'} ('+a+')\\n'+ser(n,d+1);
  } } return out; };
// The export's runtime wraps interpolated text in an extra empty span, and
// spells readonly the long way. Neither changes what is drawn.
const norm = (s) => s.split('\\n').map(l => l.replace('readonly=readonly','readonly=')).filter(l => !/^\\s*span \\{\\} \\(\\)$/.test(l)).map(l => l.trim());
const dump = (id) => { const doc = document.getElementById(id).contentDocument;
  const rootEl = doc.querySelector('div[style*="min-height"]'); return rootEl ? ser(rootEl,0) : 'NO ROOT'; };
function run() {
  const a = norm(dump('ref')), b = norm(dump('app')), lines = [];
  for (let k = 0; k < Math.max(a.length,b.length); k++) if (a[k] !== b[k]) lines.push('@'+k+'\\n  export: '+(a[k]||'—')+'\\n  app:    '+(b[k]||'—'));
  document.getElementById('sum').textContent = 'export ' + a.length + ' čvorova · app ' + b.length + ' · razlika ' + lines.length;
  document.getElementById('out').textContent = lines.join('\\n\\n') || 'Identično.';
}
</script></body></html>`;

function serveFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") return serveHtml(res, HARNESS);
  if (url === "/ref/" || url === "/ref/index.html") {
    const html = fs.readFileSync(path.join(root, "design", "MediScribe.dc.html"), "utf8")
      .replace('<script src="./support.js"></script>',
        '<script src="./react.js"></script><script src="./react-dom.js"></script><script src="./support.js"></script>');
    return serveHtml(res, html);
  }
  if (url === "/ref/react.js") return serveFile(res, path.join(root, REACT_UMD[0]));
  if (url === "/ref/react-dom.js") return serveFile(res, path.join(root, REACT_UMD[1]));
  if (url.startsWith("/ref/")) return serveFile(res, path.join(root, "design", url.slice(5)));
  if (url.startsWith("/app/")) return serveFile(res, path.join(root, "dist", url.slice(5)));
  return res.writeHead(404).end("not found");
}).listen(PORT, () => {
  if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
    console.error("Build the renderer first: npm run build");
  }
  console.log(`Design parity harness: http://localhost:${PORT}/`);
});

function serveHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
