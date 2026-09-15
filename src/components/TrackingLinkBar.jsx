import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

// Lead profile: mint a login-free progress link for the customer and copy it or send it on WhatsApp.
export default function TrackingLinkBar({ lead }) {
  const { accessToken } = useAuth();
  const [link, setLink] = useState('');
  const [state, setState] = useState(''); // '' | 'loading' | 'copied' | error text

  const getLink = async () => {
    if (link) return link;
    setState('loading');
    const res = await fetch(`${API_BASE}/track/link/${lead.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not create the link');
    const url = `${window.location.origin}/track/${body.token}`;
    setLink(url);
    setState('');
    return url;
  };

  const copy = async () => {
    try {
      const url = await getLink();
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState(''), 2500);
    } catch (err) {
      setState(err.message || 'Copy failed');
    }
  };

  const sendWhatsApp = async () => {
    try {
      const url = await getLink();
      const digits = String(lead.mobile || '').replace(/\D/g, '');
      const phone = digits.length === 10 ? `91${digits}` : digits;
      const firstName = String(lead.customerName || '').trim().split(/\s+/)[0] || '';
      const text = `Hi ${firstName}, track your loan application with InstaFin anytime here: ${url}`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    } catch (err) {
      setState(err.message || 'Could not open WhatsApp');
    }
  };

  const busy = state === 'loading';
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mt-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[180px]">
        <p className="text-xs uppercase font-bold text-blue-700">Customer tracking link</p>
        <p className="text-xs text-gray-600 mt-0.5">The customer sees their stage, banks and document progress without logging in. Valid 30 days.</p>
        {state && state !== 'loading' && state !== 'copied' && <p className="text-xs text-red-600 mt-1">{state}</p>}
      </div>
      <button onClick={copy} disabled={busy} className="text-xs font-bold bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-xl hover:bg-blue-100 disabled:opacity-50">
        {state === 'copied' ? 'Copied ✓' : busy ? 'Creating…' : 'Copy link'}
      </button>
      <button onClick={sendWhatsApp} disabled={busy} className="text-xs font-bold bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-700 disabled:opacity-50">
        Send on WhatsApp
      </button>
    </div>
  );
}
