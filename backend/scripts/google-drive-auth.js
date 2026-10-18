/**
 * One-time: get a Google Drive refresh token for the portal's storage account.
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-drive-auth.js
 *
 * Open the printed link, sign in with the Gmail account that should hold the
 * documents, allow access. The refresh token is printed here — put it on the
 * backend as GOOGLE_REFRESH_TOKEN (plus the client id/secret, and
 * STORAGE_PROVIDER=gdrive). Scope is drive.file: the portal only sees files it
 * created itself, nothing else in that Drive.
 */
import http from 'http';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.');
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive.file',
  access_type: 'offline',
  prompt: 'consent',
});

http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get('code');
  if (!code) { res.end('No code in the request.'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const body = await r.json();
  if (!body.refresh_token) {
    res.end('Failed - see the terminal.');
    console.error('No refresh token returned:', body);
    process.exit(1);
  }
  res.end('Done. You can close this tab.');
  console.log('\nGOOGLE_REFRESH_TOKEN=' + body.refresh_token + '\n');
  process.exit(0);
}).listen(PORT, '127.0.0.1', () => console.log('Open this link and allow access:\n\n' + url + '\n'));
