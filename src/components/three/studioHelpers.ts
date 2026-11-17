import * as THREE from 'three';

export function detectSoftwareGl(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createRadialShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(1, 8, 12, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 12, 18, 0.34)');
  grad.addColorStop(1, 'rgba(2, 12, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createClinicalFloorTextures(maxAniso: number): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 256;
  const albCanvas = document.createElement('canvas');
  albCanvas.width = size;
  albCanvas.height = size;
  const actx = albCanvas.getContext('2d')!;

  actx.fillStyle = '#08202a';
  actx.fillRect(0, 0, size, size);

  // Subtle antimicrobial terrazzo speckle & sterile tile joints
  for (let i = 0; i < 420; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    actx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.08)' : 'rgba(148, 163, 184, 0.06)';
    actx.fillRect(x, y, 2, 2);
  }

  actx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
  actx.lineWidth = 2;
  actx.strokeRect(1, 1, size - 2, size - 2);
  actx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
  actx.lineWidth = 1;
  actx.beginPath();
  actx.moveTo(size / 2, 0);
  actx.lineTo(size / 2, size);
  actx.moveTo(0, size / 2);
  actx.lineTo(size, size / 2);
  actx.stroke();

  const albedo = new THREE.CanvasTexture(albCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(8, 8);
  albedo.anisotropy = maxAniso;

  // Data roughness map (linear NoColorSpace)
  const rghCanvas = document.createElement('canvas');
  rghCanvas.width = size;
  rghCanvas.height = size;
  const rctx = rghCanvas.getContext('2d')!;
  rctx.fillStyle = '#5a5a5a';
  rctx.fillRect(0, 0, size, size);
  rctx.strokeStyle = '#b4b4b4';
  rctx.lineWidth = 4;
  rctx.strokeRect(2, 2, size - 4, size - 4);
  const roughness = new THREE.CanvasTexture(rghCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(8, 8);
  roughness.anisotropy = maxAniso;

  return { albedo, roughness };
}

export function createBrushedMetalRoughnessTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#484848';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    const shade = 62 + ((y * 19) % 36);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, 128, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

export function createTelemetryScreenTexture(maxAniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#020b12';
  ctx.fillRect(0, 0, 512, 320);

  // Subtle diagnostic grid
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 320);
    ctx.stroke();
  }
  for (let y = 0; y < 320; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  // Header telemetry bar
  ctx.fillStyle = '#072430';
  ctx.fillRect(0, 0, 512, 42);
  ctx.fillStyle = '#67e8f9';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('NIROG ICU-04 · TELEMETRY SYNC', 16, 27);

  // ECG Lead II trace
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let x = 16; x < 340; x += 2) {
    const phase = (x % 82) / 82;
    let dy = 0;
    if (phase > 0.35 && phase < 0.42) dy = -12;
    else if (phase >= 0.42 && phase < 0.48) dy = 14;
    else if (phase >= 0.48 && phase < 0.56) dy = -56;
    else if (phase >= 0.56 && phase < 0.62) dy = 24;
    else if (phase >= 0.72 && phase < 0.85) dy = -14;
    const y = 128 + dy;
    if (x === 16) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // SpO2 plethysmograph wave
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 16; x < 340; x += 2) {
    const phase = ((x + 20) % 82) / 82;
    const dy = -Math.pow(Math.sin(phase * Math.PI), 2) * 34;
    const y = 248 + dy;
    if (x === 16) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Numeric readouts
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 46px monospace';
  ctx.fillText('72', 376, 128);
  ctx.font = '14px monospace';
  ctx.fillText('HR BPM', 376, 150);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 46px monospace';
  ctx.fillText('98%', 376, 232);
  ctx.font = '14px monospace';
  ctx.fillText('SpO2 · 36.7°C', 376, 254);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}
