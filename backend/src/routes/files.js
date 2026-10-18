// GET /api/files/:token — serves a Google Drive file behind a signed, expiring
// link made by fileStore().createSignedUrl(). No login: the token is the auth,
// same as a Supabase signed URL.
import express from 'express';
import { verifyFileLink, driveStream } from '../lib/fileStore.js';
import { contentDisposition } from '../utils/downloadName.js';

const router = express.Router();

router.get('/:token', async (req, res) => {
  const link = verifyFileLink(req.params.token);
  if (!link) return res.status(403).send('Link expired or invalid');
  try {
    const file = await driveStream(link.f);
    res.setHeader('Content-Type', file.headers.get('content-type') || 'application/octet-stream');
    // ?dl=1 forces a download instead of opening in the browser tab.
    const name = link.n.replace(/^\d{6}_/, '');
    res.setHeader('Content-Disposition', contentDisposition(name, Boolean(req.query.dl)));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error('[FILES] Drive fetch failed:', err.message);
    res.status(err.statusCode === 404 ? 404 : 502).send('File unavailable');
  }
});

export default router;
