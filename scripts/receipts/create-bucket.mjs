// Creates the PRIVATE receipts bucket in a Supabase project, or checks the
// one that is there (phase 6.9). Idempotent.
//
// Usage (the env file decides which project):
//   npx dotenv -e api/.env -- node scripts/receipts/create-bucket.mjs            # dev project (local .env)
//   npx dotenv -e api/.env.supabase -- node scripts/receipts/create-bucket.mjs   # production
//
// Private, with the only types the API stores and the API's own size limit:
// the bucket refuses on its own whatever the API would refuse, so a bug in the
// API cannot widen what lands there.

const url = process.env.SUPABASE_URL?.replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/^['"]|['"]$/g, '');
const bucket = process.env.SOPORTES_BUCKET ?? 'soportes';

if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' };
const settings = {
  public: false,
  file_size_limit: 25 * 1024 * 1024,
  allowed_mime_types: ['image/jpeg', 'image/png', 'application/pdf'],
};

const host = new URL(url).host;
const existing = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });

if (existing.ok) {
  const current = await existing.json();
  console.log(`bucket "${bucket}" already exists at ${host}: public=${current.public}`);
  if (current.public) {
    const fixed = await fetch(`${url}/storage/v1/bucket/${bucket}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(settings),
    });
    console.log(`made private: HTTP ${fixed.status}`);
    if (!fixed.ok) process.exit(1);
  }
  process.exit(0);
}

const created = await fetch(`${url}/storage/v1/bucket`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ id: bucket, name: bucket, ...settings }),
});
console.log(
  `create bucket "${bucket}" at ${host}: HTTP ${created.status} ${created.ok ? '' : await created.text()}`,
);
process.exit(created.ok ? 0 : 1);
