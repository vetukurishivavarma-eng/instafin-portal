import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

// AI Bot login: type a customer's name (+ attach files) to save, or ask for
// their documents. Folders are per customer, sub-folders per date received.
const EXAMPLES = ['Ravi Kumar PAN', 'show Ravi Kumar', 'Ravi Kumar 2026-10-18', 'leads'];

function formatSize(bytes) {
  if (!bytes) return '';
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function AiBotPage() {
  const { user, logout, refreshAccessToken } = useAuth();
  const [messages, setMessages] = useState([
    { from: 'bot', reply: 'Attach a document and type the customer name to save it. Type a name to see their documents, date-wise.' },
  ]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const post = (body) => fetch(`${API_BASE}/ai-bot/message`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('instafin_token')}` },
    body,
  });

  const send = async (overrideText) => {
    const msg = (overrideText ?? text).trim();
    if (busy || (!msg && !files.length)) return;
    const sending = overrideText ? [] : files;
    setMessages((m) => [...m, { from: 'me', text: msg, files: sending.map((f) => f.name) }]);
    if (!overrideText) {
      setText('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
    }
    setBusy(true);
    try {
      const build = () => {
        const fd = new FormData();
        fd.append('text', msg);
        sending.forEach((f) => fd.append('files', f));
        return fd;
      };
      let res = await post(build());
      if (res.status === 401 && (await refreshAccessToken())) res = await post(build());
      const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      setMessages((m) => [...m, res.ok ? { from: 'bot', ...data } : { from: 'bot', reply: data.error || 'Something went wrong', error: true }]);
    } catch {
      setMessages((m) => [...m, { from: 'bot', reply: 'Network error — try again.', error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-700">InstaFin</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">AI BOT</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-500">{user?.name}</span>
            <button onClick={logout} className="text-sm font-medium text-gray-600 hover:text-red-600">Logout</button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-3">
          {messages.map((m, i) => m.from === 'me' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm">
                {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                {m.files?.map((f) => <div key={f} className="text-blue-100 text-xs mt-1 break-all">📎 {f}</div>)}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={`max-w-[90%] rounded-2xl rounded-bl-sm px-4 py-2 text-sm border ${m.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-800'}`}>
                <div className="whitespace-pre-wrap break-words">{m.reply}</div>
                {m.folders?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.folders.map((f) => (
                      <button key={f} onClick={() => send(`show ${f}`)} className="px-2.5 py-1 rounded-full bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-xs font-medium">📁 {f}</button>
                    ))}
                  </div>
                )}
                {m.dates?.map((d) => (
                  <div key={d.date} className="mt-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">📅 {d.date}</div>
                    <ul className="mt-1 space-y-1">
                      {d.files.map((f) => (
                        <li key={f.url} className="flex items-center justify-between gap-3">
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">{f.name}</a>
                          <span className="text-xs text-gray-400 shrink-0">{formatSize(f.size)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-gray-400 px-1">Working…</div>}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="bg-white border-t">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setText(e)} className="px-2.5 py-1 rounded-full border border-gray-200 text-xs text-gray-500 hover:text-blue-700 hover:border-blue-300">{e}</button>
            ))}
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-800 rounded-lg text-xs max-w-full">
                  <span className="truncate">📎 {f.name}</span>
                  <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-blue-400 hover:text-red-600">✕</button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 10))} />
            <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach files" className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-blue-700 hover:border-blue-300 shrink-0">📎</button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={files.length ? 'Customer name, e.g. Ravi Kumar PAN' : 'Customer name or "leads"'}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button type="submit" disabled={busy} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shrink-0">Send</button>
          </form>
        </div>
      </footer>
    </div>
  );
}
