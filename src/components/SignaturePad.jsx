import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Scratch pad for signing a form field by hand.
 *
 * Bank forms print a strip for the applicant's signature. There is nothing to
 * type there, so the fill UI gives the customer a pad to draw on with a mouse,
 * a stylus or a finger, and hands back a transparent PNG that formFiller.js
 * stamps into the printed strip.
 *
 * The exported image is CROPPED TO THE INK, not to the pad: a small scrawl in
 * the middle of a wide pad would otherwise be shrunk again to fit the form's
 * strip and come out unreadably tiny. Cropping first means the signature fills
 * the strip the way a pen would.
 */
const PAD_HEIGHT = 132;
const LINE_WIDTH = 2.4;
const INK = '#111827';
const CROP_PADDING = 6; // px of clear space kept around the ink

export default function SignaturePad({ value, onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]); // [[{x,y}, ...], ...] in CSS pixels
  const drawingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Size the backing store to the device pixel ratio so strokes aren't blurry,
  // and re-draw whatever has been signed so far after any resize.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (width === 0) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(PAD_HEIGHT * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(PAD_HEIGHT * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, PAD_HEIGHT);
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
      // A single tap is a dot, which lineTo alone would not paint.
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [redraw]);

  // Crop to the ink and export. Reading pixels back is cheap at this size and
  // is the only way to know where the signature actually sits on the pad.
  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      onChange(null);
      return;
    }
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] === 0) continue; // fully transparent
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      onChange(null);
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    const pad = Math.round(CROP_PADDING * ratio);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    onChange(out.toDataURL('image/png'));
  }, [onChange]);

  const pointAt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([pointAt(e)]);
    setIsEmpty(false);
    redraw();
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    strokesRef.current[strokesRef.current.length - 1].push(pointAt(e));
    redraw();
  };

  const handlePointerUp = (e) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    canvasRef.current.releasePointerCapture?.(e.pointerId);
    emit();
  };

  const undo = () => {
    strokesRef.current.pop();
    setIsEmpty(strokesRef.current.length === 0);
    redraw();
    emit();
  };

  const clear = () => {
    strokesRef.current = [];
    setIsEmpty(true);
    redraw();
    onChange(null);
  };

  // A signature restored from a previous session (or from the lead's saved
  // values) can be shown, but its individual strokes are gone — offer to
  // replace it rather than pretend it can be undone stroke by stroke.
  const hasSavedImage = !!value && isEmpty;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {hasSavedImage ? (
        <div className="relative bg-gray-50" style={{ height: PAD_HEIGHT }}>
          <img src={value} alt="Signature" className="absolute inset-0 w-full h-full object-contain p-2" />
        </div>
      ) : (
        <div className="relative" style={{ height: PAD_HEIGHT }}>
          <div className="absolute inset-x-6 bottom-7 border-b border-dashed border-gray-300 pointer-events-none" />
          {isEmpty && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 pointer-events-none">
              Sign here
            </span>
          )}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            style={{ height: PAD_HEIGHT }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-t border-gray-100">
        <span className="text-[10px] text-gray-400">
          {hasSavedImage ? 'Signed' : 'Draw with a mouse, stylus or finger'}
        </span>
        <div className="flex gap-2">
          {!hasSavedImage && (
            <button
              type="button"
              onClick={undo}
              disabled={disabled || isEmpty}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-40"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={clear}
            disabled={disabled || (isEmpty && !value)}
            className="text-[11px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            {hasSavedImage ? 'Replace' : 'Clear'}
          </button>
        </div>
      </div>
    </div>
  );
}
