// api/feedback.js (CommonJS, with ping + logging)
const { put, list } = require('@vercel/blob');

const CSV_NAME = 'kidcircle-feedback.csv';
const CSV_HEADERS = [
  'Submission Date','Submission Time','Parent Name','Email','Children Ages',
  'Dubai Neighborhood','Overall Rating','Most Useful Features',
  'Concerns/Hesitations','Suggestions for Improvement','Would Recommend','Source'
];

function toCsvValue(v){ const s=(v??'').toString(); return `"${s.replace(/"/g,'""')}"`; }
function toCsvRow(row){
  return [
    toCsvValue(row.submittedDate),toCsvValue(row.submittedTime),toCsvValue(row.parentName),
    toCsvValue(row.email),toCsvValue(row.childrenAges),toCsvValue(row.neighborhood),
    toCsvValue(row.rating),toCsvValue(row.usefulness),toCsvValue(row.concerns),
    toCsvValue(row.improvements),toCsvValue(row.recommendation),toCsvValue(row.source||'website'),
  ].join(',')+'\n';
}
function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Quick health check: /api/feedback?ping=1
  if (req.method === 'GET' && req.query && req.query.ping) {
    return res.status(200).json({ ok: true, ping: 'pong' });
  }

  if (req.method === 'POST') {
    try {
      const chunks = [];
      await new Promise((resolve) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
      });
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};
      const now = new Date();
      const entry = {
        ...body,
        submittedAt: now.toISOString(),
        submittedDate: now.toLocaleDateString(),
        submittedTime: now.toLocaleTimeString(),
        source: 'website',
      };

      // Read existing CSV (if any)
      let existing = '';
      const { blobs } = await list({ prefix: CSV_NAME });
      const existingBlob = blobs.find(b => b.pathname === CSV_NAME);
      if (existingBlob) {
        const resp = await fetch(existingBlob.url);
        existing = await resp.text();
      } else {
        existing = CSV_HEADERS.join(',') + '\n';
      }

      // Append new row
      const updated = existing + toCsvRow(entry);

      // Write back (private, stable name)
      await put(CSV_NAME, updated, {
        access: 'private',
        addRandomSuffix: false,
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error('POST /api/feedback failed:', e);
      return res.status(500).json({ ok: false, error: 'FUNCTION_INVOCATION_FAILED' });
    }
  }

  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
};