// api/feedback.js
import { put, list } from '@vercel/blob';

const CSV_NAME = 'kidcircle-feedback.csv';
const CSV_HEADERS = [
  'Submission Date',
  'Submission Time',
  'Parent Name',
  'Email',
  'Children Ages',
  'Dubai Neighborhood',
  'Overall Rating',
  'Most Useful Features',
  'Concerns/Hesitations',
  'Suggestions for Improvement',
  'Would Recommend',
  'Source'
];

function toCsvValue(v) {
  const s = (v ?? '').toString();
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsvRow(row) {
  return [
    toCsvValue(row.submittedDate),
    toCsvValue(row.submittedTime),
    toCsvValue(row.parentName),
    toCsvValue(row.email),
    toCsvValue(row.childrenAges),
    toCsvValue(row.neighborhood),
    toCsvValue(row.rating),
    toCsvValue(row.usefulness),
    toCsvValue(row.concerns),
    toCsvValue(row.improvements),
    toCsvValue(row.recommendation),
    toCsvValue(row.source || 'website'),
  ].join(',') + '\n';
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    try {
      const chunks = [];
      await new Promise((resolve) => {
        req.on('data', (c) => chunks.push(c));
        req.on('end', resolve);
      });
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));

      const now = new Date();
      const entry = {
        ...body,
        submittedAt: now.toISOString(),
        submittedDate: now.toLocaleDateString(),
        submittedTime: now.toLocaleTimeString(),
        source: 'website',
      };

      // Build updated CSV content (read-if-exists then append)
      let existing = '';
      const { blobs } = await list({ prefix: CSV_NAME });
      const existingBlob = blobs.find(b => b.pathname === CSV_NAME);
      if (existingBlob) {
        const resp = await fetch(existingBlob.url);
        existing = await resp.text();
      } else {
        existing = CSV_HEADERS.join(',') + '\n';
      }
      const updated = existing + toCsvRow(entry);

      await put(CSV_NAME, updated, {
        access: 'private',
        addRandomSuffix: false, // keep stable name
      });

      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('POST /feedback error', e);
      res.status(500).json({ ok: false, error: 'failed_to_save' });
    }
    return;
  }

  if (req.method === 'GET') {
    // Secure download: /api/feedback?download=1&token=YOUR_TOKEN
    const { download, token } = req.query || {};
    const adminToken = process.env.ADMIN_TOKEN;
    if (download && token && adminToken && token === adminToken) {
      const { blobs } = await list({ prefix: CSV_NAME });
      const existingBlob = blobs.find(b => b.pathname === CSV_NAME);
      if (!existingBlob) {
        res.status(404).send('No feedback yet');
        return;
      }
      const resp = await fetch(existingBlob.url);
      const csv = await resp.text();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${CSV_NAME}"`);
      res.status(200).send(csv);
      return;
    }
    res.status(403).json({ ok: false, error: 'forbidden' });
    return;
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' });
}