// Performance budget of the initial web bundle (step 7.9, D26, ADR 0018).
//
// "Initial" is exactly what `frontend/dist/index.html` asks for before the
// first paint: the entry script, its stylesheet, any modulepreload, and the
// page itself. Those paths carry a content hash, so they are read from the
// built HTML instead of guessed with a glob (a lazy chunk can also be called
// `index-*.js`). Run after `npm run build --workspace frontend`.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const dist = join(__dirname, 'frontend', 'dist');
let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  throw new Error('size-limit: build the frontend first (npm run build --workspace frontend)');
}

const assets = [
  ...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="\/(assets\/[^"]+\.(?:js|mjs|css))"/g),
].map((m) => join('frontend', 'dist', m[1]));

module.exports = [
  {
    name: 'Initial bundle (entry JS + CSS + index.html, gzip)',
    path: [...new Set(assets), 'frontend/dist/index.html'],
    gzip: true,
    limit: '200 kB',
  },
];
