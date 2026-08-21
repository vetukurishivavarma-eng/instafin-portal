import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import API_BASE from '../config/api';
import { FORM_FIELD_KEYS, FORM_FIELD_LABELS } from '../data/formFieldKeys';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Render pages at this pixel width so drawn boxes are captured with plenty
// of precision regardless of the underlying PDF's native page size.
const RENDER_WIDTH = 900;

/**
 * Full-screen editor: renders the actual PDF page and lets an admin
 * click-drag a box directly over each field's real input area. Produces
 * pixel-accurate {page, xPct, yPct, widthPct, heightPct} boxes — the only
 * approach that works reliably on dense, multi-column bank forms where a
 * single AI-estimated point can't be trusted to land in the right cell.
 */
export default function FormFieldEditor({ form, accessToken, onClose, onSaved }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [renderedSize, setRenderedSize] = useState({ width: RENDER_WIDTH, height: RENDER_WIDTH * 1.4 });
  const [fields, setFields] = useState({}); // key -> { page, xPct, yPct, widthPct, heightPct }
  const [activeKey, setActiveKey] = useState(FORM_FIELD_KEYS[0]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY }
  const [dragRect, setDragRect] = useState(null); // live rubber-band box in canvas px

  // Seed from any existing calibration that already has explicit boxes
  // (manual ones do; older AI-only ones only have a point, which isn't a
  // box we can show accurately, so those start unplaced here).
  useEffect(() => {
    const existing = form.field_map?.fields || {};
    const seeded = {};
    for (const [key, pos] of Object.entries(existing)) {
      if (pos && Number.isFinite(pos.widthPct) && Number.isFinite(pos.heightPct)) {
        seeded[key] = pos;
      }
    }
    setFields(seeded);
  }, [form]);

  // Load the PDF once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/forms/${form.id}/download`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error('Failed to load form PDF');
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Failed to load form PDF');
      }
    })();
    return () => { cancelled = true; };
  }, [form.id, accessToken]);

  // Render the current page to canvas whenever it changes
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = RENDER_WIDTH / unscaledViewport.width;
      const viewport = page.getViewport({ scale });
      if (cancelled) return;

      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setRenderedSize({ width: viewport.width, height: viewport.height });

      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  const clampPct = (v) => Math.min(100, Math.max(0, v));

  const getOverlayPoint = useCallback((e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  }, []);

  const handleMouseDown = (e) => {
    if (!activeKey) return;
    const p = getOverlayPoint(e);
    dragRef.current = { startX: p.x, startY: p.y };
    setDragRect({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    if (!dragRef.current) return;
    const p = getOverlayPoint(e);
    const { startX, startY } = dragRef.current;
    setDragRect({
      x: Math.min(startX, p.x),
      y: Math.min(startY, p.y),
      width: Math.abs(p.x - startX),
      height: Math.abs(p.y - startY),
    });
  };

  const handleMouseUp = () => {
    if (!dragRef.current || !dragRect) { dragRef.current = null; return; }
    dragRef.current = null;
    if (dragRect.width < 6 || dragRect.height < 6) { setDragRect(null); return; } // ignore accidental clicks

    const { width: cw, height: ch } = renderedSize;
    const box = {
      page: pageNum,
      xPct: clampPct((dragRect.x / cw) * 100),
      yPct: clampPct((dragRect.y / ch) * 100),
      widthPct: clampPct((dragRect.width / cw) * 100),
      heightPct: clampPct((dragRect.height / ch) * 100),
    };
    setFields(prev => ({ ...prev, [activeKey]: box }));
    setDragRect(null);

    // Auto-advance to the next un-placed field so an admin can move through
    // the whole list without re-clicking the sidebar each time.
    const idx = FORM_FIELD_KEYS.indexOf(activeKey);
    const next = FORM_FIELD_KEYS.slice(idx + 1).find(k => !fields[k]) || FORM_FIELD_KEYS.find(k => !fields[k] && k !== activeKey);
    if (next) setActiveKey(next);
  };

  const handleRemoveField = (key) => {
    setFields(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const placedCount = Object.keys(fields).length;

  const handleSave = async () => {
    if (placedCount === 0) {
      setSaveError('Draw at least one field box before saving.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE}/forms/${form.id}/calibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Failed to save field positions');
        return;
      }
      onSaved(data.message || `Saved ${placedCount} field positions`);
      onClose();
    } catch (err) {
      setSaveError('Failed to save field positions');
    } finally {
      setSaving(false);
    }
  };

  const fieldsOnThisPage = Object.entries(fields).filter(([, pos]) => pos.page === pageNum);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">Draw Fields — {form.form_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Select a field on the right, then click-drag a box directly over its real input area on the page.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* PDF canvas + overlay */}
          <div className="flex-1 overflow-auto bg-gray-100 flex flex-col items-center p-4">
            {loadError ? (
              <p className="text-sm text-red-600 mt-10">{loadError}</p>
            ) : !pdfDoc ? (
              <p className="text-sm text-gray-400 mt-10">Loading form…</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setPageNum(p => Math.max(1, p - 1))}
                    disabled={pageNum <= 1}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs font-semibold text-gray-600">Page {pageNum} of {numPages}</span>
                  <button
                    onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
                    disabled={pageNum >= numPages}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>

                <div
                  className="relative shadow-lg select-none"
                  style={{ width: renderedSize.width, height: renderedSize.height, cursor: activeKey ? 'crosshair' : 'default' }}
                >
                  <canvas ref={canvasRef} className="absolute inset-0" />
                  <div
                    ref={overlayRef}
                    className="absolute inset-0"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => { if (dragRef.current) handleMouseUp(); }}
                  >
                    {fieldsOnThisPage.map(([key, pos]) => (
                      <div
                        key={key}
                        className={`absolute border-2 flex items-center justify-between px-1 ${
                          key === activeKey ? 'border-emerald-500 bg-emerald-500/10' : 'border-indigo-400 bg-indigo-400/10'
                        }`}
                        style={{
                          left: (pos.xPct / 100) * renderedSize.width,
                          top: (pos.yPct / 100) * renderedSize.height,
                          width: (pos.widthPct / 100) * renderedSize.width,
                          height: (pos.heightPct / 100) * renderedSize.height,
                        }}
                      >
                        <span className="text-[9px] font-bold text-indigo-700 truncate">{FORM_FIELD_LABELS[key] || key}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveField(key); }}
                          className="text-[10px] font-bold text-red-500 hover:text-red-700 flex-shrink-0"
                          title="Remove this box"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {dragRect && (
                      <div
                        className="absolute border-2 border-emerald-500 bg-emerald-500/20 pointer-events-none"
                        style={{ left: dragRect.x, top: dragRect.y, width: dragRect.width, height: dragRect.height }}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Field list sidebar */}
          <div className="w-64 border-l border-gray-100 overflow-y-auto flex-shrink-0">
            <div className="p-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Fields ({placedCount}/{FORM_FIELD_KEYS.length} placed)
            </div>
            <div className="px-2 pb-3 space-y-1">
              {FORM_FIELD_KEYS.map(key => {
                const placed = fields[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveKey(key)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      key === activeKey
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : placed
                          ? 'bg-indigo-50/50 text-indigo-700 hover:bg-indigo-50'
                          : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="truncate">{FORM_FIELD_LABELS[key] || key}</span>
                    {placed && <span className="text-[9px] text-gray-400 flex-shrink-0 ml-1">p{placed.page}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="text-xs">
            {saveError && <span className="text-red-600 font-semibold">{saveError}</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || placedCount === 0}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : `Save & Bake (${placedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
