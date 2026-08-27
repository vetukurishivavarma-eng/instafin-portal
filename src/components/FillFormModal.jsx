import React, { useMemo, useState } from 'react';
import SignaturePad from './SignaturePad';
import { FORM_FIELD_LABELS } from '../data/formFieldKeys';

/**
 * Type into every box a calibrated bank form actually has.
 *
 * Calibration now finds all of a form's writable areas rather than only the
 * ~28 keys the portal can auto-fill (see backend services/formFieldPlan.js),
 * so this modal is driven entirely by the stored field map: one control per
 * discovered field, of the kind that field needs —
 *
 *   text      -> a text input
 *   checkbox  -> the row's options as a single-choice control
 *   photo     -> an image upload (downscaled in the browser before sending)
 *   signature -> a scratch pad the customer signs on
 *
 * Fields are listed in the form's own reading order, page by page, so filling
 * the screen top-to-bottom fills the paper top-to-bottom.
 */

const MAX_PHOTO_DIMENSION = 1400; // px on the long edge before upload

// Read a chosen image file, downscale it, and return a data URL. A phone photo
// straight off the camera is several megabytes; embedded at full size it would
// bloat both the request and the generated PDF for no visible gain, since it
// ends up printed inside a box an inch or two wide.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 900 * 1024) {
          resolve(reader.result);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        // JPEG has no alpha, so give transparent source images a white ground
        // rather than letting them come out black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function humanize(key) {
  return key
    .replace(/__.*$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelFor(key, pos) {
  return pos?.label || FORM_FIELD_LABELS[key] || humanize(key);
}

/**
 * Turn the stored field map into the controls to render, in reading order.
 * Checkbox options ("residence_status__owned", "..._rented") collapse into one
 * choice control keyed by their shared base, which is also the key the filler
 * resolves a plain value like "Owned" against.
 */
function buildControls(fieldMap) {
  const choices = new Map(); // baseKey -> control
  const controls = [];

  for (const [key, pos] of Object.entries(fieldMap || {})) {
    if (!pos || typeof pos !== 'object') continue;
    const page = pos.page || 1;
    const row = { page, y: pos.yPct || 0, x: pos.xPct || 0 };

    if (pos.fieldType === 'checkbox') {
      const baseKey = key.includes('__') ? key.slice(0, key.lastIndexOf('__')) : key;
      const optionValue = pos.optionValue || pos.optionLabel || key.slice(key.lastIndexOf('__') + 2);
      let control = choices.get(baseKey);
      if (!control) {
        control = { kind: 'choice', key: baseKey, label: labelFor(baseKey, pos), options: [], ...row };
        choices.set(baseKey, control);
        controls.push(control);
      }
      // Keep the earliest position on the row, so the group sorts where its
      // first option is printed.
      if (row.page < control.page || (row.page === control.page && row.y < control.y)) {
        control.page = row.page;
        control.y = row.y;
        control.x = row.x;
      }
      if (!control.options.some((o) => o.value === optionValue)) {
        control.options.push({ value: optionValue, label: optionValue });
      }
      continue;
    }

    if (pos.fieldType === 'image') {
      controls.push({
        kind: pos.imageKind === 'signature' ? 'signature' : 'photo',
        key,
        label: labelFor(key, pos),
        ...row,
      });
      continue;
    }

    controls.push({ kind: 'text', key, label: labelFor(key, pos), ...row });
  }

  // Reading order: page, then row, then left-to-right within the row. Rows are
  // bucketed to half a percent of page height so two fields printed side by
  // side don't sort by a fraction of a point of baseline drift.
  const rowBucket = (c) => Math.round(c.y * 2);
  controls.sort((a, b) => a.page - b.page || rowBucket(a) - rowBucket(b) || a.x - b.x);
  return controls;
}

export default function FillFormModal({
  form,
  bankLabel,
  initialValues = {},
  submitting = false,
  error = '',
  onSubmit,
  onClose,
}) {
  const [values, setValues] = useState(initialValues);
  const [query, setQuery] = useState('');
  const [pageFilter, setPageFilter] = useState('all');
  const [uploadError, setUploadError] = useState('');

  const controls = useMemo(() => buildControls(form.field_map?.fields), [form]);
  const pages = useMemo(() => [...new Set(controls.map((c) => c.page))].sort((a, b) => a - b), [controls]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return controls.filter((c) => {
      if (pageFilter !== 'all' && c.page !== pageFilter) return false;
      if (!q) return true;
      return c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q);
    });
  }, [controls, query, pageFilter]);

  const filledCount = controls.filter((c) => {
    const v = values[c.key];
    return v !== undefined && v !== null && String(v).length > 0;
  }).length;

  const setValue = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const handlePhoto = async (key, file) => {
    if (!file) return;
    setUploadError('');
    try {
      setValue(key, await fileToDataUrl(file));
    } catch (err) {
      setUploadError(err.message || 'Could not read that image');
    }
  };

  const renderControl = (control) => {
    const value = values[control.key] ?? '';

    if (control.kind === 'signature') {
      return (
        <SignaturePad
          value={value || null}
          disabled={submitting}
          onChange={(dataUrl) => setValue(control.key, dataUrl || '')}
        />
      );
    }

    if (control.kind === 'photo') {
      return (
        <div className="flex items-center gap-3">
          <div className="w-20 h-24 rounded-lg border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {value ? (
              <img src={value} alt={control.label} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] text-gray-400 text-center px-1">No photo</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex">
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={submitting}
                onChange={(e) => handlePhoto(control.key, e.target.files?.[0])}
              />
              <span className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold cursor-pointer hover:bg-indigo-100">
                {value ? 'Change photo' : 'Upload photo'}
              </span>
            </label>
            {value && (
              <button
                type="button"
                onClick={() => setValue(control.key, '')}
                className="text-[11px] font-semibold text-red-500 hover:text-red-700 text-left"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      );
    }

    if (control.kind === 'choice') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {control.options.map((option) => {
            const selected = String(value).toLowerCase() === String(option.value).toLowerCase();
            return (
              <button
                key={option.value}
                type="button"
                disabled={submitting}
                onClick={() => setValue(control.key, selected ? '' : option.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  selected
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <input
        type="text"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
        value={value}
        disabled={submitting}
        onChange={(e) => setValue(control.key, e.target.value)}
      />
    );
  };

  let lastPage = null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">Fill {form.form_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {bankLabel} — {filledCount} of {controls.length} fields filled
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 flex-shrink-0">
          <input
            type="search"
            placeholder="Search fields..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-100"
          />
          {pages.length > 1 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPageFilter('all')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                  pageFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {pages.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPageFilter(p)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold ${
                    pageFilter === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  p{p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {controls.length === 0 && (
            <p className="text-sm text-gray-500">
              This form has no calibrated fields yet. Ask an admin to run Calibrate on it in the Download Forms page.
            </p>
          )}
          {visible.length === 0 && controls.length > 0 && (
            <p className="text-sm text-gray-500">No fields match that search.</p>
          )}
          {visible.map((control) => {
            const showPageHeader = pageFilter === 'all' && pages.length > 1 && control.page !== lastPage;
            lastPage = control.page;
            return (
              <React.Fragment key={control.key}>
                {showPageHeader && (
                  <div className="pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Page {control.page}
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                    {control.label}
                  </label>
                  {renderControl(control)}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2 flex-shrink-0">
          {(error || uploadError) && (
            <p className="text-xs font-semibold text-red-600">{error || uploadError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => onSubmit(values)}
              disabled={submitting || controls.length === 0}
              className="flex-1 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50"
            >
              {submitting ? 'Filling...' : 'Fill & Save'}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
