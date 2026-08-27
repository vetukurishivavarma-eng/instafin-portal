import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import API_BASE from '../config/api';
import { FORM_FIELD_KEYS, FORM_FIELD_LABELS } from '../data/formFieldKeys';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Render pages at this pixel width so drawn boxes are captured with plenty
// of precision regardless of the underlying PDF's native page size.
const RENDER_WIDTH = 900;

const FIELD_TYPES = [
  { id: 'text', label: 'Text', hint: 'A box the applicant types into' },
  { id: 'photo', label: 'Photo', hint: 'A frame the applicant uploads a photograph into' },
  { id: 'signature', label: 'Signature', hint: 'A strip the applicant signs on' },
];

function humanize(key) {
  return key
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayLabel(key, pos) {
  return pos?.label || FORM_FIELD_LABELS[key] || humanize(key);
}

// What kind of control a stored box represents, from the box itself.
function typeOf(pos) {
  if (pos?.fieldType === 'image') return pos.imageKind === 'signature' ? 'signature' : 'photo';
  if (pos?.fieldType === 'checkbox') return 'checkbox';
  return 'text';
}

const TYPE_STYLES = {
  text: 'border-indigo-400 bg-indigo-400/10 text-indigo-700',
  checkbox: 'border-purple-400 bg-purple-400/10 text-purple-700',
  photo: 'border-sky-500 bg-sky-500/10 text-sky-700',
  signature: 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-700',
};

function uniqueKey(existing, base) {
  const clean = base.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';
  if (!existing[clean]) return clean;
  let n = 2;
  while (existing[`${clean}_${n}`]) n++;
  return `${clean}_${n}`;
}

/**
 * Full-screen editor: renders the actual PDF page and lets an admin
 * click-drag a box directly over each field's real input area. Produces
 * pixel-accurate {page, xPct, yPct, widthPct, heightPct} boxes — the only
 * approach that works reliably on dense, multi-column bank forms where a
 * single AI-estimated point can't be trusted to land in the right cell.
 *
 * It edits the WHOLE field map, not just the canonical keys. Automatic
 * calibration now produces a field per writable area on the form (see the
 * backend's services/formFieldPlan.js), so an editor that could only show and
 * save 28 named keys would silently throw the rest of the form away the first
 * time an admin opened it to nudge one box.
 */
export default function FormFieldEditor({ form, accessToken, onClose, onSaved }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [renderedSize, setRenderedSize] = useState({ width: RENDER_WIDTH, height: RENDER_WIDTH * 1.4 });
  const [fields, setFields] = useState({}); // key -> { page, xPct, yPct, widthPct, heightPct, fieldType?, label?, ... }
  const [activeKey, setActiveKey] = useState(null);
  const [drawType, setDrawType] = useState('text'); // type given to a box drawn with nothing selected
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [suggestions, setSuggestions] = useState({}); // slug -> box, from the generic text-layer anchor
  const [showSuggestions, setShowSuggestions] = useState(true);

  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY }
  const [dragRect, setDragRect] = useState(null); // live rubber-band box in canvas px

  // Seed from the existing calibration. Only boxes with a real size can be
  // drawn accurately; an older single-point calibration has no box to show.
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

  // Best-effort: ask the whitelist-free generic anchor what it can find on
  // this form's text layer so the admin has click-to-add suggestions instead
  // of freehand-drawing every box. A scanned form with no usable text layer
  // just yields no suggestions — manual drawing still works exactly as before.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/forms/${form.id}/discover`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setSuggestions(data.suggestions || {});
      } catch {
        // Suggestions are a convenience, not a requirement — ignore failures.
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

  // Turn the drawn rectangle into a box, and either re-place the selected
  // field or create a new one of the currently chosen type.
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
    setDragRect(null);

    // Re-placing the selected field keeps its identity (type, label, option
    // value) and just moves it; drawing with nothing selected creates a field
    // of the currently chosen type.
    if (activeKey && fields[activeKey]) {
      setFields((prev) => ({ ...prev, [activeKey]: { ...prev[activeKey], ...box } }));
      return;
    }
    const key = activeKey || uniqueKey(fields, drawType === 'text' ? 'field' : drawType);
    const meta = drawType === 'text'
      ? {}
      : { fieldType: 'image', imageKind: drawType === 'signature' ? 'signature' : 'photo' };
    setFields((prev) => ({
      ...prev,
      [key]: { ...box, ...meta, label: FORM_FIELD_LABELS[key] || humanize(key) },
    }));
    setActiveKey(key);
  };

  const handleRemoveField = (key) => {
    setFields((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setActiveKey((k) => (k === key ? null : k));
  };

  const handleRelabel = (key, label) => {
    setFields((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], label } } : prev));
  };

  // Take a discovered box as a field. With a field selected, the suggestion
  // re-places that field; with nothing selected it becomes a new field under
  // its own slug, which is how a whole form gets wired up in a few clicks.
  const acceptSuggestion = (slug, box) => {
    if (activeKey) {
      const existing = fields[activeKey];
      setFields((prev) => ({
        ...prev,
        [activeKey]: {
          ...box,
          // The suggestion contributes geometry; a field that already exists
          // keeps what it IS (canonical key, type, label).
          fieldType: existing?.fieldType,
          imageKind: existing?.imageKind,
          optionValue: existing?.optionValue,
          label: existing?.label || FORM_FIELD_LABELS[activeKey] || box.label || humanize(slug),
        },
      }));
      return;
    }
    const key = uniqueKey(fields, slug);
    setFields((prev) => ({ ...prev, [key]: { ...box, label: box.label || humanize(slug) } }));
    setActiveKey(key);
  };

  const acceptAllSuggestions = () => {
    setFields((prev) => {
      const next = { ...prev };
      for (const [slug, box] of Object.entries(suggestions)) {
        // Skip anything already covering that spot, so this is safe to press
        // twice and safe to press on a form that is already half wired up.
        const already = Object.values(next).some(
          (pos) =>
            pos.page === box.page &&
            Math.abs(pos.xPct - box.xPct) < 1 &&
            Math.abs(pos.yPct - box.yPct) < 1
        );
        if (already) continue;
        next[uniqueKey(next, slug)] = { ...box, label: box.label || humanize(slug) };
      }
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
  const suggestionsOnThisPage = showSuggestions
    ? Object.entries(suggestions).filter(([, pos]) => pos.page === pageNum)
    : [];

  // Sidebar list: everything on the form, in reading order, page by page.
  const sortedFields = useMemo(
    () =>
      Object.entries(fields).sort(
        (a, b) => (a[1].page || 1) - (b[1].page || 1) || (a[1].yPct || 0) - (b[1].yPct || 0) || (a[1].xPct || 0) - (b[1].xPct || 0)
      ),
    [fields]
  );

  const unplacedCanonical = FORM_FIELD_KEYS.filter((k) => !fields[k]);
  const activePos = activeKey ? fields[activeKey] : null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">Draw Fields — {form.form_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeKey
                ? `Drag a box on the page to move "${displayLabel(activeKey, activePos)}"`
                : `Drag a box on the page to add a new ${drawType} field`}
              {Object.keys(suggestions).length > 0 && ' — or click an amber suggestion to take it.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {Object.keys(suggestions).length > 0 && (
              <>
                <button
                  onClick={acceptAllSuggestions}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold hover:bg-amber-100"
                >
                  Add all {Object.keys(suggestions).length} suggestions
                </button>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 select-none cursor-pointer">
                  <input type="checkbox" checked={showSuggestions} onChange={(e) => setShowSuggestions(e.target.checked)} />
                  Show
                </label>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
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
                    onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                    disabled={pageNum <= 1}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs font-semibold text-gray-600">Page {pageNum} of {numPages}</span>
                  <button
                    onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                    disabled={pageNum >= numPages}
                    className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>

                <div
                  className="relative shadow-lg select-none"
                  style={{ width: renderedSize.width, height: renderedSize.height, cursor: 'crosshair' }}
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
                    {suggestionsOnThisPage.map(([slug, pos]) => (
                      <div
                        key={`sugg-${slug}`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); acceptSuggestion(slug, pos); }}
                        title={pos.label || slug}
                        className="absolute border border-dashed border-amber-400 bg-amber-300/10 hover:bg-amber-400/25 hover:border-amber-600 cursor-pointer"
                        style={{
                          left: (pos.xPct / 100) * renderedSize.width,
                          top: (pos.yPct / 100) * renderedSize.height,
                          width: (pos.widthPct / 100) * renderedSize.width,
                          height: (pos.heightPct / 100) * renderedSize.height,
                        }}
                      />
                    ))}
                    {fieldsOnThisPage.map(([key, pos]) => (
                      <div
                        key={key}
                        onMouseDown={(e) => { e.stopPropagation(); setActiveKey(key); }}
                        className={`absolute border-2 flex items-center justify-between px-1 cursor-pointer ${
                          key === activeKey ? 'border-emerald-500 bg-emerald-500/20 text-emerald-800' : TYPE_STYLES[typeOf(pos)]
                        }`}
                        style={{
                          left: (pos.xPct / 100) * renderedSize.width,
                          top: (pos.yPct / 100) * renderedSize.height,
                          width: (pos.widthPct / 100) * renderedSize.width,
                          height: (pos.heightPct / 100) * renderedSize.height,
                        }}
                      >
                        <span className="text-[9px] font-bold truncate">{displayLabel(key, pos)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveField(key); }}
                          onMouseDown={(e) => e.stopPropagation()}
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
          <div className="w-72 border-l border-gray-100 overflow-y-auto flex-shrink-0">
            {/* What a freshly drawn box becomes */}
            <div className="p-3 border-b border-gray-100">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">New box is a</div>
              <div className="flex gap-1">
                {FIELD_TYPES.map((t) => (
                  <button
                    key={t.id}
                    title={t.hint}
                    onClick={() => { setDrawType(t.id); setActiveKey(null); }}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                      drawType === t.id && !activeKey
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {activeKey && (
                <div className="mt-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Selected field</div>
                  <input
                    type="text"
                    value={activePos?.label ?? ''}
                    placeholder={humanize(activeKey)}
                    onChange={(e) => handleRelabel(activeKey, e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400 truncate">{activeKey}</span>
                    <button
                      onClick={() => setActiveKey(null)}
                      className="text-[10px] font-bold text-gray-500 hover:text-gray-700 flex-shrink-0"
                    >
                      Deselect
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Everything on the form */}
            <div className="p-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              On this form ({placedCount})
            </div>
            <div className="px-2 pb-3 space-y-1">
              {sortedFields.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Nothing placed yet.</p>
              )}
              {sortedFields.map(([key, pos]) => (
                <button
                  key={key}
                  onClick={() => { setActiveKey(key); setPageNum(pos.page || 1); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                    key === activeKey
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{displayLabel(key, pos)}</span>
                  <span className="text-[9px] text-gray-400 flex-shrink-0 ml-1">
                    {typeOf(pos) !== 'text' ? `${typeOf(pos)} · ` : ''}p{pos.page}
                  </span>
                </button>
              ))}
            </div>

            {/* Canonical keys still missing — these are the ones the portal can
                auto-fill from the lead record, so they are worth placing. */}
            {unplacedCanonical.length > 0 && (
              <>
                <div className="p-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100">
                  Auto-fillable, not placed ({unplacedCanonical.length})
                </div>
                <div className="px-2 pb-3 space-y-1">
                  {unplacedCanonical.map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveKey(key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        key === activeKey
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {FORM_FIELD_LABELS[key] || key}
                    </button>
                  ))}
                </div>
              </>
            )}
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
