import React, { useEffect, useRef, useState } from 'react';
import type { ScanModality, XaiMode } from '../utils/radiologyEngine';

interface ScanViewport2DProps {
  modality: ScanModality;
  presetImageSrc?: string;
  xaiMode: XaiMode;
  xaiOpacity: number; // 0..1
  sliceIdx: number; // 1..32
  isCinePlaying?: boolean;
  windowBrightness: number; // 0.6..1.5
  windowContrast: number; // 0.6..1.8
  invert: boolean;
  zoom: number; // 1..2.2
  roiNorm: { x: number; y: number; radius: number };
  uploadedImage: HTMLImageElement | null;
  uploadedFilename: string | null;
}

function drawProceduralFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  modality: ScanModality,
  sliceIdx: number,
  roiNorm: { x: number; y: number; radius: number }
) {
  ctx.fillStyle = '#050b10';
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.5;
  const rg = ctx.createRadialGradient(
    roiNorm.x * w,
    roiNorm.y * h,
    4,
    roiNorm.x * w,
    roiNorm.y * h,
    roiNorm.radius * w
  );
  rg.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
  rg.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#64748b';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Loading ${modality.toUpperCase()} slice #${sliceIdx}...`, cx, cy);
}

function drawXaiOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  xaiMode: XaiMode,
  xaiOpacity: number,
  roiNorm: { x: number; y: number; radius: number }
) {
  if (xaiMode === 'off') return;
  const rx = roiNorm.x * w;
  const ry = roiNorm.y * h;
  const rr = roiNorm.radius * w * 1.15;

  ctx.save();
  ctx.globalAlpha = xaiOpacity;

  if (xaiMode === 'gradcam') {
    const heat = ctx.createRadialGradient(rx, ry, rr * 0.08, rx, ry, rr * 1.35);
    heat.addColorStop(0, 'rgba(244, 63, 94, 0.85)');
    heat.addColorStop(0.35, 'rgba(245, 158, 11, 0.65)');
    heat.addColorStop(0.68, 'rgba(34, 211, 238, 0.34)');
    heat.addColorStop(1, 'rgba(14, 116, 144, 0)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, w, h);
  } else if (xaiMode === 'rawgrad') {
    const glow = ctx.createRadialGradient(rx, ry, 4, rx, ry, rr * 1.25);
    glow.addColorStop(0, 'rgba(56, 189, 248, 0.58)');
    glow.addColorStop(0.6, 'rgba(14, 165, 233, 0.22)');
    glow.addColorStop(1, 'rgba(14, 165, 233, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#e0f2fe';
    for (let k = 0; k < 48; k++) {
      const ang = k * 2.39996;
      const dist = Math.sqrt((k + 1) / 48) * rr * 0.92;
      const px = rx + Math.cos(ang) * dist;
      const py = ry + Math.sin(ang) * dist;
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  } else if (xaiMode === 'ood') {
    const cols = 12;
    const rows = 9;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cw;
        const cy = (r + 0.5) * ch;
        const dist = Math.hypot(cx - rx, cy - ry);
        const edge = c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
        const residual = dist < rr ? 0.58 : edge ? 0.32 : 0.12;
        ctx.fillStyle =
          residual > 0.45
            ? 'rgba(168, 85, 247, 0.48)'
            : residual > 0.25
            ? 'rgba(217, 70, 239, 0.22)'
            : 'rgba(15, 23, 42, 0.08)';
        ctx.fillRect(c * cw + 1, r * ch + 1, cw - 2, ch - 2);
      }
    }
  } else if (xaiMode === 'saliency') {
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.6;
    for (let r = 8; r <= rr * 1.18; r += 10) {
      ctx.beginPath();
      ctx.ellipse(rx, ry, r, r * 0.84, 0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(rx - rr, ry);
    ctx.lineTo(rx + rr, ry);
    ctx.moveTo(rx, ry - rr);
    ctx.lineTo(rx, ry + rr);
    ctx.stroke();
  } else if (xaiMode === 'lime') {
    const cols = 10;
    const rows = 8;
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cw;
        const cy = (r + 0.5) * ch;
        const dist = Math.hypot(cx - rx, cy - ry);
        if (dist < rr * 1.32) {
          const weight = Math.max(0.15, 1 - dist / (rr * 1.45));
          ctx.fillStyle = weight > 0.55 ? 'rgba(16, 185, 129, 0.46)' : 'rgba(56, 189, 248, 0.28)';
          ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
          ctx.strokeStyle = 'rgba(167, 243, 208, 0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
        }
      }
    }
  }

  // Calibration reticle
  ctx.globalAlpha = 0.88;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rx, ry, rr * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export const ScanViewport2D: React.FC<ScanViewport2DProps> = ({
  modality,
  presetImageSrc,
  xaiMode,
  xaiOpacity,
  sliceIdx,
  isCinePlaying = false,
  windowBrightness,
  windowContrast,
  invert,
  zoom,
  roiNorm,
  uploadedImage,
  uploadedFilename,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loadedPresetImg, setLoadedPresetImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!presetImageSrc) {
      setLoadedPresetImg(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoadedPresetImg(img);
    };
    img.src = presetImageSrc;
    return () => {
      cancelled = true;
    };
  }, [presetImageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();

    const activeImg = uploadedImage || loadedPresetImg;
    const slicePhase = (sliceIdx - 16) / 16; // -1..+1
    // Multi-slice cine depth modulation so scrolling or playing slices creates real anatomical tomosynthesis sweep
    const sliceZoomMod = uploadedImage ? 1 : 1 + Math.abs(slicePhase) * 0.032;
    const sliceShiftX = uploadedImage ? 0 : slicePhase * (modality === 'spine-mri' ? 4.5 : 2.5);
    const sliceBrightnessMod = uploadedImage ? 1 : 1 - Math.abs(slicePhase) * 0.06;

    ctx.translate(w / 2 + sliceShiftX, h / 2);
    ctx.scale(zoom * sliceZoomMod, zoom * sliceZoomMod);
    ctx.translate(-w / 2, -h / 2);
    ctx.filter = `brightness(${(windowBrightness * sliceBrightnessMod).toFixed(3)}) contrast(${windowContrast}) invert(${invert ? 1 : 0})`;

    if (activeImg) {
      const scale = Math.max(w / activeImg.width, h / activeImg.height);
      const dw = activeImg.width * scale;
      const dh = activeImg.height * scale;
      ctx.fillStyle = '#03080d';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(activeImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      drawProceduralFallback(ctx, w, h, modality, sliceIdx, roiNorm);
    }

    ctx.filter = 'none';
    drawXaiOverlay(ctx, w, h, xaiMode, xaiOpacity, roiNorm);

    // Subtle cine slice sweep line when sweeping slices
    if (isCinePlaying || sliceIdx !== 16) {
      const sweepY = ((sliceIdx - 1) / 31) * h;
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, sweepY);
      ctx.lineTo(w, sweepY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [
    modality,
    loadedPresetImg,
    xaiMode,
    xaiOpacity,
    sliceIdx,
    isCinePlaying,
    windowBrightness,
    windowContrast,
    invert,
    zoom,
    roiNorm,
    uploadedImage,
  ]);

  return (
    <div
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#03080d]"
      data-testid="scan-viewport-2d"
    >
      <canvas ref={canvasRef} width={640} height={480} className="w-full h-full block" />
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-between gap-2 text-[11px] font-mono">
        <span className="px-2.5 py-1 rounded-md bg-[#03151c]/90 border border-cyan-400/25 text-cyan-200 truncate max-w-[60%]">
          {uploadedFilename
            ? `Uploaded: ${uploadedFilename}`
            : `2D PACS Slice · #${sliceIdx}/32${isCinePlaying ? ' · CINE' : ''}`}
        </span>
        <span className="px-2.5 py-1 rounded-md bg-[#03151c]/90 border border-white/15 text-slate-200">
          {zoom.toFixed(1)}× · W/L {Math.round(windowContrast * 100)}%
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
        <span className="bg-[#03151c]/90 px-2.5 py-1 rounded-md border border-white/10">
          XAI Layer: {xaiMode === 'off' ? 'Hidden' : xaiMode.toUpperCase()} ({Math.round(xaiOpacity * 100)}%)
        </span>
        <span className="bg-[#03151c]/90 px-2.5 py-1 rounded-md border border-cyan-400/20 text-cyan-200">
          {modality === 'spine-mri' ? 'T2 Sagittal MRI' : modality === 'chest-ct' ? 'Lung Window CT' : 'Diagnostic PA/CC'}
        </span>
      </div>
    </div>
  );
};
