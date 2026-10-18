// Fetch a file that needs the login token and save it. The server names it
// (Content-Disposition: "<Lead>_<DD-MM-YYYY>.zip"); fallbackName if it doesn't.
export async function downloadWithAuth(url, token, fallbackName) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Download failed (${res.status})`);
  }
  const cd = res.headers.get('content-disposition') || '';
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="([^"]+)"/i);
  const name = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName;
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

// "<Lead>_<Document>_<DD-MM-YYYY>.<ext>" — same rule as the backend's downloadName.
export function fileDownloadName(lead, doc, originalFile) {
  const ext = (String(originalFile || '').match(/\.[a-z0-9]{1,6}$/i) || [''])[0];
  const [y, m, d] = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10).split('-');
  const clean = (s) => String(s || '').replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return [clean(lead) || 'Lead', clean(doc) || 'Document', `${d}-${m}-${y}`].join('_') + ext;
}
