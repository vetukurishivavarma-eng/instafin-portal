// GET /api/files/:token — serves a Google Drive file behind a signed, expiring
// link made by fileStore().createSignedUrl(). No login: the token is the auth,
// same as a Supabase signed URL.
import express from 'express';
import { verifyFileLink, driveStream } from '../lib/fileStore.js';

const router = express.Router();

router.get('/:token', async (req, res) => {
  const link = verifyFileLink(req.params.token);
  if (!link) return res.status(403).send('Link expired or invalid');
  try {
    const file = await driveStream(link.f);
    res.setHeader('Content-Type', file.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(link.n)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error('[FILES] Drive fetch failed:', err.message);
    res.status(err.statusCode === 404 ? 404 : 502).send('File unavailable');
  }
});

export default router;
