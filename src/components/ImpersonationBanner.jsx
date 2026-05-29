import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function ImpersonationBanner() {
  const { impersonating, stopImpersonation, user } = useAuth();

  if (!impersonating) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-4 py-2.5 shadow-lg sticky top-0 z-[9999]">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-sm">
              👁️ Viewing as <span className="underline decoration-dotted underline-offset-2">{impersonating.name}</span>
            </span>
            <span className="text-xs ml-2 opacity-80">
              (Admin: {user?.name || user?.email})
            </span>
          </div>
        </div>
        <button
          onClick={stopImpersonation}
          className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Switch to Admin
        </button>
      </div>
    </div>
  );
}
