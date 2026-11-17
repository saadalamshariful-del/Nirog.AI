import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type PharmaAssetKind = 'vial' | 'pen' | 'tablet';

interface PharmaCanvasProps {
  assetKind: PharmaAssetKind;
  title: string;
  batchCode: string;
  coldChain: boolean;
}

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

export const PharmaCanvas: React.FC<PharmaCanvasProps> = ({
  assetKind,
  title,
  batchCode,
  coldChain,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const kindRef = useRef<PharmaAssetKind>(assetKind);
  kindRef.current = assetKind;
  const triggerRef = useRef<(() => void) | null>(null);
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
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0, 0.65, 5.15);

    scene.add(new THREE.HemisphereLight(0xcffafe, 0x06202b, 0.85));
    const key = new THREE.DirectionalLight(0xfff5ea, 1.35);
    key.position.set(4, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x22d3ee, 0.85);
    rim.position.set(-4, 2, -4);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    // Pedestal studio ring
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, 0.02, 10, 64),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.85, roughness: 0.25 })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -0.92;
    root.add(baseRing);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.24, 0.12, 40),
      new THREE.MeshStandardMaterial({ color: 0x082f3c, metalness: 0.6, roughness: 0.35 })
    );
    pedestal.position.y = -0.98;
    root.add(pedestal);

    // 1. Sterile Biologic Vial Group
    const vialGroup = new THREE.Group();
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0f2fe,
      transmission: 0.78,
      opacity: 0.92,
      transparent: true,
      roughness: 0.08,
      metalness: 0.05,
      ior: 1.48,
      thickness: 0.4,
    });
    const vialBody = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.35, 32), glassMat);
    vialGroup.add(vialBody);
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.51, 0.51, 0.76, 28),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.85 })
    );
    liquid.position.y = -0.25;
    vialGroup.add(liquid);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.28, 24), glassMat);
    neck.position.y = 0.78;
    vialGroup.add(neck);
    const crimp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.22, 28),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.92, roughness: 0.22 })
    );
    crimp.position.y = 0.96;
    vialGroup.add(crimp);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.3, roughness: 0.38 })
    );
    cap.position.y = 1.1;
    vialGroup.add(cap);
    const labelBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.575, 0.575, 0.62, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65, metalness: 0.08, side: THREE.DoubleSide })
    );
    labelBand.position.y = 0.04;
    vialGroup.add(labelBand);
    root.add(vialGroup);

    // 2. Pre-filled Insulin Pen Group
    const penGroup = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 1.75, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e7490, metalness: 0.45, roughness: 0.28 })
    );
    penGroup.add(barrel);
    const windowSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.165, 0.52, 24),
      glassMat
    );
    windowSleeve.position.y = 0.42;
    penGroup.add(windowSleeve);
    const dialKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.18, 0.26, 20),
      new THREE.MeshStandardMaterial({ color: 0x34d399, metalness: 0.75, roughness: 0.24 })
    );
    dialKnob.position.y = -0.96;
    penGroup.add(dialKnob);
    const penCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.195, 0.62, 24),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.25, roughness: 0.35 })
    );
    penCap.position.y = 0.96;
    penGroup.add(penCap);
    penGroup.position.y = -0.08;
    penGroup.rotation.z = -0.35;
    root.add(penGroup);

    // 3. Blister Tablet Matrix Group
    const tabletGroup = new THREE.Group();
    const foilBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.08, 1.18),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.88, roughness: 0.26 })
    );
    foilBase.position.y = -0.1;
    tabletGroup.add(foilBase);
    const pillGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 20);
    const pillMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.12, roughness: 0.25 });
    const blisterMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.7,
      transparent: true,
      opacity: 0.48,
      roughness: 0.1,
    });
    for (let r = -1; r <= 1; r += 2) {
      for (let c = -1.5; c <= 1.5; c += 1) {
        const pill = new THREE.Mesh(pillGeo, pillMat);
        pill.position.set(c * 0.44, 0.02, r * 0.28);
        tabletGroup.add(pill);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), blisterMat);
        dome.position.set(c * 0.44, -0.05, r * 0.28);
        tabletGroup.add(dome);
      }
    }
    tabletGroup.rotation.x = 0.38;
    root.add(tabletGroup);

    let rotY = 0.4;
    let targetRotY = 0.4;
    let dragging = false;
    let lastX = 0;
    let disposed = false;
    let frameId = 0;
    let busy = false;
    let dirty = false;

    const syncVisibility = () => {
      const k = kindRef.current;
      vialGroup.visible = k === 'vial';
      penGroup.visible = k === 'pen';
      tabletGroup.visible = k === 'tablet';
    };

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
      if (busy) {
        dirty = true;
        return;
      }
      busy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        dirty = false;
        syncVisibility();
        rotY += (targetRotY - rotY) * 0.22;
        root.rotation.y = rotY;
        camera.lookAt(0, -0.05, 0);
        renderer.render(scene, camera);

        const settled = Math.abs(targetRotY - rotY) < 0.004;
        const done = () => {
          busy = false;
          if (dirty || !settled) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerRef.current = requestRender;
    resize();
    syncVisibility();
    root.rotation.y = rotY;
    camera.lookAt(0, -0.05, 0);
    renderer.render(scene, camera);

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
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
      lastX = e.clientX;
      targetRotY += dx * 0.012;
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
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    triggerRef.current?.();
  }, [assetKind]);

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-b from-[#06222c] to-[#03151c] overflow-hidden flex flex-col">
      <div className="relative w-full aspect-[4/3] min-h-[240px]" data-testid="pharma-3d-stage">
        {failed && (
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 240" aria-hidden="true">
            <rect x="130" y="60" width="60" height="110" rx="10" fill="#0e7490" stroke="#67e8f9" strokeWidth="2" />
            <rect x="142" y="42" width="36" height="18" rx="4" fill="#e2e8f0" />
          </svg>
        )}
        <div ref={mountRef} className="w-full h-full" />
      </div>
      <div className="px-4 py-2.5 bg-[#041b24] border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-200">
        <span className="truncate font-semibold text-cyan-200">{title}</span>
        <span className="text-slate-300 whitespace-nowrap">
          {batchCode} · {coldChain ? '2–8 °C Cold-Chain' : 'Ambient GMP'} · Drag to inspect
        </span>
      </div>
    </div>
  );
};
