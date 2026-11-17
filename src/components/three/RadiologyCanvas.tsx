import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type {
  LumbarDiscGrade,
  RadiologyFindingKey,
  ScanModality,
  XaiMode,
} from '../../utils/radiologyEngine';

export type { RadiologyFindingKey };

interface RadiologyCanvasProps {
  finding: RadiologyFindingKey;
  modality?: ScanModality;
  scanImageSrc?: string;
  xaiMode?: XaiMode;
  slicePos?: number; // 0..1
  isCinePlaying?: boolean;
  roiOffset?: [number, number, number];
  spineDiscs?: LumbarDiscGrade[];
  xaiLabel?: string;
}

const FINDING_CONFIG: Record<
  RadiologyFindingKey,
  { pos: [number, number, number]; color: number; radius: number; label: string }
> = {
  opacity: { pos: [-0.52, -0.34, 0.18], color: 0xf43f5e, radius: 0.36, label: 'Focal Opacity ROI' },
  cardiomegaly: { pos: [0.26, -0.08, 0.22], color: 0xf59e0b, radius: 0.34, label: 'Density / Quadrant ROI' },
  consolidation: { pos: [0.5, 0.44, 0.18], color: 0x818cf8, radius: 0.34, label: 'Apical / Nodule ROI' },
  clear: { pos: [0, 0, 0], color: 0x10b981, radius: 0.16, label: 'Baseline Clear Reference' },
};

const XAI_MODE_COLORS: Record<XaiMode, number> = {
  off: 0x38bdf8,
  gradcam: 0xf43f5e,
  rawgrad: 0x38bdf8,
  saliency: 0xf59e0b,
  lime: 0x10b981,
  ood: 0xa855f7,
};

function detectSoftwareGl(): boolean {
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

export const RadiologyCanvas: React.FC<RadiologyCanvasProps> = ({
  finding,
  modality = 'chest-cxr',
  scanImageSrc,
  xaiMode = 'gradcam',
  slicePos = 0.5,
  isCinePlaying = false,
  roiOffset,
  spineDiscs,
  xaiLabel,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    finding,
    modality,
    xaiMode,
    slicePos,
    isCinePlaying,
    roiOffset,
    spineDiscs,
  });
  stateRef.current = {
    finding,
    modality,
    xaiMode,
    slicePos,
    isCinePlaying,
    roiOffset,
    spineDiscs,
  };

  const triggerRenderRef = useRef<(() => void) | null>(null);
  const textureLoaderRef = useRef<THREE.TextureLoader | null>(null);
  const activeTexRef = useRef<THREE.Texture | null>(null);
  const sliceMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const activeSliceMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x030911, 1);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.1, 40);
    camera.position.set(0, 0.16, 4.75);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // ---------------------------------------------------------
    // 1. REAL VOLUMETRIC MULTI-SLICE TEXTURE STACK (14 DEPTH PLANES)
    // ---------------------------------------------------------
    const planeW = 2.86;
    const planeH = 2.14;
    const stackDepth = 1.15;
    const layerCount = 14;
    const sliceMaterials: THREE.MeshBasicMaterial[] = [];

    const texLoader = new THREE.TextureLoader();
    textureLoaderRef.current = texLoader;

    const stackGroup = new THREE.Group();
    rootGroup.add(stackGroup);

    const baseGeo = new THREE.PlaneGeometry(planeW, planeH);
    for (let i = 0; i < layerCount; i++) {
      const t = i / (layerCount - 1); // 0..1 back -> front
      const z = (t - 0.5) * stackDepth;
      const distCenter = Math.abs(t - 0.5) * 2;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: i === 0 ? 0.5 : 0.14 + (1 - distCenter) * 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const sliceMesh = new THREE.Mesh(baseGeo, mat);
      sliceMesh.position.z = z;
      // Subtle anatomical perspective progression along Z stack
      const depthScale = 0.96 + (1 - distCenter) * 0.045;
      sliceMesh.scale.set(depthScale, depthScale, 1);
      stackGroup.add(sliceMesh);
      sliceMaterials.push(mat);
    }
    sliceMaterialsRef.current = sliceMaterials;

    // Active illuminated Cine MRI / CT / CXR Slice Frame
    const activeSliceMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    activeSliceMatRef.current = activeSliceMat;
    const activeSliceMesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), activeSliceMat);
    rootGroup.add(activeSliceMesh);

    const activeFrameEdges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeW + 0.03, planeH + 0.03));
    const activeFrameLines = new THREE.LineSegments(
      activeFrameEdges,
      new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.88 })
    );
    activeSliceMesh.add(activeFrameLines);

    // Volumetric 3D Bounding Box Wireframe (PACS Coordinate Space)
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(planeW + 0.14, planeH + 0.14, stackDepth + 0.14));
    const boxWire = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.24 })
    );
    rootGroup.add(boxWire);

    // ---------------------------------------------------------
    // 2. SPINE PFIRRMANN L1-S1 LATERAL CALLOUT MARKERS (SPINE-MRI ONLY)
    // ---------------------------------------------------------
    const discMarkersGroup = new THREE.Group();
    rootGroup.add(discMarkersGroup);
    const discMarkerMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 5; i++) {
      const dMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), dMat);
      marker.position.set(1.25, 0.56 - i * 0.29, 0.25);
      discMarkersGroup.add(marker);
      discMarkerMats.push(dMat);
    }

    // ---------------------------------------------------------
    // 3. 3D VOLUMETRIC XAI ROI SPOTLIGHT (TRACKS EXACT PATHOLOGY POSITION)
    // ---------------------------------------------------------
    const roiGroup = new THREE.Group();
    rootGroup.add(roiGroup);

    const roiMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    const roiSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), roiMat);
    roiSphere.scale.set(1, 1, 0.65);
    roiGroup.add(roiSphere);

    const roiWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.16, 1),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.55 })
    );
    roiGroup.add(roiWire);

    const limeCluster = new THREE.Group();
    const limeMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.68,
    });
    const limeOffsets: [number, number, number][] = [
      [-0.45, 0.35, 0.12],
      [0.45, 0.3, -0.12],
      [-0.25, -0.45, 0.14],
      [0.38, -0.35, 0.14],
      [0, 0.55, -0.1],
    ];
    for (const off of limeOffsets) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), limeMat);
      cube.position.set(...off);
      limeCluster.add(cube);
    }
    roiGroup.add(limeCluster);

    const roiRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.032, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 })
    );
    roiGroup.add(roiRing);

    let rotY = 0.32;
    let targetRotY = 0.32;
    let rotX = -0.05;
    let targetRotX = -0.05;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    const _targetPos = new THREE.Vector3();

    const syncTransform = () => {
      const s = stateRef.current;
      const cfg = FINDING_CONFIG[s.finding];
      const basePos = s.roiOffset || cfg.pos;
      const activeZ = (s.slicePos - 0.5) * stackDepth;
      activeSliceMesh.position.z = activeZ;
      roiGroup.position.set(basePos[0] * 1.35, basePos[1] * 1.0, activeZ + 0.08);
      roiGroup.scale.setScalar(cfg.radius);
      discMarkersGroup.visible = s.modality === 'spine-mri';
    };
    syncTransform();

    const resize = () => {
      if (disposed || !container) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const s = stateRef.current;
        const cfg = FINDING_CONFIG[s.finding];

        discMarkersGroup.visible = s.modality === 'spine-mri';
        if (s.spineDiscs && s.spineDiscs.length > 0) {
          for (let i = 0; i < discMarkerMats.length; i++) {
            const g = s.spineDiscs[i]?.pfirrmannGrade ?? 2;
            const hex = g >= 4 ? 0xf43f5e : g === 3 ? 0xf59e0b : 0x10b981;
            discMarkerMats[i].color.setHex(hex);
          }
        }

        // Sweep active volumetric slice across Z-depth
        const targetZ = (s.slicePos - 0.5) * stackDepth;
        activeSliceMesh.position.z += (targetZ - activeSliceMesh.position.z) * 0.35;

        // Position 3D ROI over the active slice and mapped anatomical coordinates
        const basePos = s.roiOffset || cfg.pos;
        _targetPos.set(basePos[0] * 1.35, basePos[1] * 1.0, activeSliceMesh.position.z + 0.08);
        roiGroup.position.lerp(_targetPos, 0.35);

        const targetScale = s.xaiMode === 'off' ? 0.14 : cfg.radius;
        const sc = roiGroup.scale.x + (targetScale - roiGroup.scale.x) * 0.3;
        roiGroup.scale.setScalar(sc);

        const modeColor = s.xaiMode === 'off' ? cfg.color : XAI_MODE_COLORS[s.xaiMode];
        roiMat.color.setHex(modeColor);
        roiSphere.visible = s.xaiMode !== 'off';
        roiWire.visible = s.xaiMode === 'saliency' || s.xaiMode === 'rawgrad' || s.xaiMode === 'ood';
        limeCluster.visible = s.xaiMode === 'lime';

        rotY += (targetRotY - rotY) * 0.24;
        rotX += (targetRotX - rotX) * 0.24;
        rootGroup.rotation.y = rotY;
        rootGroup.rotation.x = rotX;

        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);

        const settled =
          Math.abs(targetRotY - rotY) < 0.004 &&
          Math.abs(targetRotX - rotX) < 0.004 &&
          Math.abs(targetZ - activeSliceMesh.position.z) < 0.01 &&
          roiGroup.position.distanceTo(_targetPos) < 0.01 &&
          Math.abs(targetScale - roiGroup.scale.x) < 0.01;

        const done = () => {
          renderBusy = false;
          if (renderDirty || !settled) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerRenderRef.current = requestRender;
    resize();
    rootGroup.rotation.y = rotY;
    rootGroup.rotation.x = rotX;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      targetRotY = Math.max(-0.95, Math.min(0.95, targetRotY + dx * 0.008));
      targetRotX = Math.max(-0.45, Math.min(0.45, targetRotX + dy * 0.006));
      requestRender();
    };
    const onUp = () => {
      dragging = false;
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (activeTexRef.current) {
        activeTexRef.current.dispose();
        activeTexRef.current = null;
      }
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load real scan texture into all 14 volumetric slice layers + active slice plane
  useEffect(() => {
    const loader = textureLoaderRef.current;
    if (!loader || !scanImageSrc) return;
    let cancelled = false;
    loader.load(scanImageSrc, (tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;

      if (activeTexRef.current && activeTexRef.current !== tex) {
        activeTexRef.current.dispose();
      }
      activeTexRef.current = tex;

      for (const m of sliceMaterialsRef.current) {
        m.map = tex;
        m.needsUpdate = true;
      }
      if (activeSliceMatRef.current) {
        activeSliceMatRef.current.map = tex;
        activeSliceMatRef.current.needsUpdate = true;
      }
      triggerRenderRef.current?.();
    });
    return () => {
      cancelled = true;
    };
  }, [scanImageSrc]);

  useEffect(() => {
    triggerRenderRef.current?.();
  }, [finding, modality, xaiMode, slicePos, isCinePlaying, roiOffset, spineDiscs]);

  const activeLabel = xaiLabel || FINDING_CONFIG[finding].label;

  return (
    <div
      className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#030911]"
      data-testid="radiology-3d-stage"
    >
      {failed && (
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300" aria-hidden="true">
          <circle cx="200" cy="150" r="95" fill="none" stroke="#38BDF8" strokeWidth="2" strokeDasharray="6 4" />
          <circle cx="165" cy="170" r="26" fill="#F43F5E" fillOpacity=".45" />
        </svg>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-between gap-2 text-[11px] font-mono">
        <span className="px-2.5 py-1 rounded-md bg-[#03151c]/90 border border-cyan-400/25 text-cyan-200">
          3D Cine Stack · {modality.toUpperCase()}
        </span>
        <span className="px-2.5 py-1 rounded-md bg-[#03151c]/90 border border-white/15 text-slate-200 truncate max-w-[58%]">
          {activeLabel}
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-300">
        <span className="bg-[#03151c]/90 px-2.5 py-1 rounded-md border border-white/10">
          Drag to orbit 14-slice 3D stack
        </span>
        <span className="bg-[#03151c]/90 px-2.5 py-1 rounded-md border border-cyan-400/20 text-cyan-200">
          Slice {Math.round(slicePos * 31) + 1}/32 · {isCinePlaying ? 'CINE LOOP' : `XAI: ${xaiMode.toUpperCase()}`}
        </span>
      </div>
    </div>
  );
};
