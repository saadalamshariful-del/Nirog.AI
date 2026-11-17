import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ECOSYSTEM_NODES } from '../../data/seed';
import type { NodeKey } from '../../types/nirog';

interface EcosystemCanvasProps {
  selectedNode: NodeKey;
  onSelectNode: (key: NodeKey) => void;
  paused: boolean;
  zoomLevel: number; // 0.75 to 1.35
  focusOnly?: NodeKey | null; // compact banner mode when non-null
}

interface HubDef {
  key: NodeKey;
  angle: number;
  radius: number;
  y: number;
}

const HUB_DEFS: HubDef[] = [
  { key: 'patients', angle: 0.0, radius: 4.0, y: 0.55 },
  { key: 'doctors', angle: 0.785, radius: 3.85, y: -0.28 },
  { key: 'hospitals', angle: 1.57, radius: 4.15, y: 0.42 },
  { key: 'diagnostics', angle: 2.356, radius: 3.85, y: -0.34 },
  { key: 'pharma', angle: 3.141, radius: 4.05, y: 0.5 },
  { key: 'pharmacy', angle: 3.927, radius: 3.85, y: -0.3 },
  { key: 'insurance', angle: 4.712, radius: 4.05, y: 0.36 },
  { key: 'research', angle: 5.497, radius: 3.85, y: -0.22 },
];

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

function createGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const EcosystemCanvas: React.FC<EcosystemCanvasProps> = ({
  selectedNode,
  onSelectNode,
  paused,
  zoomLevel,
  focusOnly = null,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const stateRef = useRef({
    selectedNode,
    onSelectNode,
    paused,
    zoomLevel,
    focusOnly,
    hoveredNode: null as NodeKey | null,
  });
  stateRef.current.selectedNode = selectedNode;
  stateRef.current.onSelectNode = onSelectNode;
  stateRef.current.paused = paused;
  stateRef.current.zoomLevel = zoomLevel;
  stateRef.current.focusOnly = focusOnly;

  const [webglReady, setWebglReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hovered, setHovered] = useState<NodeKey | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    const onContextRestored = () => {
      setWebglFailed(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03151c, 0.025);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
    camera.position.set(0, 3.1, 13.5);

    // Warm/Cool 3-point lighting rig
    scene.add(new THREE.HemisphereLight(0xa5f3fc, 0x06242d, 0.95));
    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.15);
    keyLight.position.set(6, 8, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.7);
    rimLight.position.set(-6, 2, -5);
    scene.add(rimLight);
    scene.add(new THREE.PointLight(0x22d3ee, 1.3, 18));

    const glowTex = createGlowTexture();
    const systemGroup = new THREE.Group();
    systemGroup.rotation.x = 0.28;
    scene.add(systemGroup);

    // Composite 7-part NIROG.AI Core Group
    const coreGroup = new THREE.Group();
    systemGroup.add(coreGroup);

    const nucleusGeo = new THREE.SphereGeometry(0.48, 24, 18);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: 0xa5f3fc,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.95,
      roughness: 0.15,
      metalness: 0.1,
    });
    coreGroup.add(new THREE.Mesh(nucleusGeo, nucleusMat));

    const coreShellGeo = new THREE.IcosahedronGeometry(1.02, 1);
    const coreShellMat = new THREE.MeshStandardMaterial({
      color: 0x0891b2,
      emissive: 0x0e7490,
      emissiveIntensity: 0.45,
      roughness: 0.24,
      metalness: 0.65,
      flatShading: true,
      transparent: true,
      opacity: 0.88,
    });
    coreGroup.add(new THREE.Mesh(coreShellGeo, coreShellMat));

    const latticeEdges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.38, 1));
    const latticeMat = new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.42 });
    coreGroup.add(new THREE.LineSegments(latticeEdges, latticeMat));

    const gyroGeo1 = new THREE.TorusGeometry(1.58, 0.032, 10, 64);
    const gyroMat = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.22, metalness: 0.85 });
    const gyro1 = new THREE.Mesh(gyroGeo1, gyroMat);
    gyro1.rotation.x = Math.PI / 2.4;
    coreGroup.add(gyro1);

    const gyro2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.74, 0.022, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x67e8f9, roughness: 0.28, metalness: 0.8 })
    );
    gyro2.rotation.y = Math.PI / 3;
    coreGroup.add(gyro2);

    const collarPinGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.35, 10);
    const collarPinMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.9 });
    coreGroup.add(new THREE.Mesh(collarPinGeo, collarPinMat));

    const coreHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coreHalo.scale.set(6.8, 6.8, 1);
    coreGroup.add(coreHalo);

    // Orbital reference tracks
    const orbitRingGeo1 = new THREE.TorusGeometry(4.0, 0.01, 6, 160);
    const orbitRingMat1 = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.24 });
    const orbitRing1 = new THREE.Mesh(orbitRingGeo1, orbitRingMat1);
    orbitRing1.rotation.x = Math.PI / 2;
    systemGroup.add(orbitRing1);

    const orbitRingGeo2 = new THREE.TorusGeometry(5.35, 0.008, 6, 160);
    const orbitRingMat2 = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.12 });
    const orbitRing2 = new THREE.Mesh(orbitRingGeo2, orbitRingMat2);
    orbitRing2.rotation.x = Math.PI / 2;
    systemGroup.add(orbitRing2);

    // Build 8 composite stakeholder nodes + hit targets + Bezier flow conduits
    const hitTargets: THREE.Mesh[] = [];
    const hitGeo = new THREE.SphereGeometry(0.85, 10, 8);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const coreHit = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 10), hitMat);
    coreHit.userData.key = 'core';
    coreGroup.add(coreHit);
    hitTargets.push(coreHit);

    const hubs: Record<
      string,
      { group: THREE.Group; orb: THREE.Mesh; ring: THREE.Mesh; scale: number; phase: number; angle: number }
    > = {
      core: { group: coreGroup, orb: coreGroup.children[1] as THREE.Mesh, ring: gyro1, scale: 1, phase: 0, angle: 0 },
    };

    const flowMeta: { curve: THREE.QuadraticBezierCurve3; off: number; speed: number; color: THREE.Color }[] = [];
    const sharedNodeBeaconGeo = new THREE.OctahedronGeometry(0.36, 1);
    const sharedNodeRingGeo = new THREE.TorusGeometry(0.56, 0.022, 8, 48);
    const sharedNodeCapGeo = new THREE.CylinderGeometry(0.16, 0.22, 0.14, 12);

    HUB_DEFS.forEach((d, idx) => {
      const meta = ECOSYSTEM_NODES[d.key];
      const g = new THREE.Group();
      g.position.set(Math.cos(d.angle) * d.radius, d.y, Math.sin(d.angle) * d.radius);
      systemGroup.add(g);

      const beaconMat = new THREE.MeshStandardMaterial({
        color: meta.hex,
        emissive: meta.hex,
        emissiveIntensity: 0.35,
        roughness: 0.26,
        metalness: 0.52,
        flatShading: true,
      });
      const orb = new THREE.Mesh(sharedNodeBeaconGeo, beaconMat);
      g.add(orb);

      const ringMat = new THREE.MeshStandardMaterial({
        color: meta.hex,
        roughness: 0.35,
        metalness: 0.85,
      });
      const ring = new THREE.Mesh(sharedNodeRingGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);

      const capMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.65,
        metalness: 0.2,
      });
      const cap = new THREE.Mesh(sharedNodeCapGeo, capMat);
      cap.position.y = -0.34;
      g.add(cap);

      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: meta.hex,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sprite.scale.set(2.2, 2.2, 1);
      g.add(sprite);

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.userData.key = d.key;
      g.add(hit);
      hitTargets.push(hit);

      hubs[d.key] = { group: g, orb, ring, scale: 1, phase: idx * 0.85, angle: d.angle };

      const p = g.position;
      const dir = new THREE.Vector3(p.x, 0, p.z).normalize();
      const a0 = dir.clone().multiplyScalar(1.48);
      const b0 = p.clone().sub(dir.clone().multiplyScalar(0.62));
      const mid = a0.clone().add(b0).multiplyScalar(0.5);
      mid.y += idx % 2 === 0 ? 0.95 : -0.6;
      const curve = new THREE.QuadraticBezierCurve3(a0, mid, b0);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
      const lineMat = new THREE.LineBasicMaterial({ color: meta.hex, transparent: true, opacity: 0.36 });
      systemGroup.add(new THREE.Line(lineGeo, lineMat));

      const col = new THREE.Color(meta.hex);
      for (let i = 0; i < 5; i++) {
        flowMeta.push({ curve, off: i / 5, speed: 0.12 + (i % 3) * 0.02, color: col });
      }
    });

    // Flowing Data Particles along Neural Conduits
    const flowPositions = new Float32Array(flowMeta.length * 3);
    const flowColors = new Float32Array(flowMeta.length * 3);
    flowMeta.forEach((m, i) => {
      flowColors[i * 3] = m.color.r;
      flowColors[i * 3 + 1] = m.color.g;
      flowColors[i * 3 + 2] = m.color.b;
    });
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPositions, 3));
    flowGeo.setAttribute('color', new THREE.BufferAttribute(flowColors, 3));
    const flowPoints = new THREE.Points(
      flowGeo,
      new THREE.PointsMaterial({
        size: 0.28,
        map: glowTex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    flowPoints.frustumCulled = false;
    systemGroup.add(flowPoints);

    // Ambient Space Dust
    const dustCount = 260;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const r = 6.2 + Math.random() * 10;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      dustPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      dustPos[i * 3 + 1] = r * Math.cos(ph) * 0.55;
      dustPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustPoints = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        size: 0.11,
        map: glowTex,
        color: 0x99f6e4,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);

    // Pre-allocated scratch helpers (zero GC inside tick)
    const _ray = new THREE.Raycaster();
    const _ndc = new THREE.Vector2();
    const _vec = new THREE.Vector3();
    const _camPos = new THREE.Vector3(0, 3.1, 13.5);
    const _camTgt = new THREE.Vector3(0, 0, 0);
    const _look = new THREE.Vector3(0, 0, 0);

    let yaw = 0;
    let autoYaw = 0;
    let dragYaw = 0;
    let dragVel = 0;
    let isDragging = false;
    let dragMoved = 0;
    let lastX = 0;
    let parallaxX = 0;
    let parallaxY = 0;
    let targetPX = 0;
    let targetPY = 0;
    let clockTime = 0;
    let lastPerf = performance.now();
    let frameId = 0;
    let disposed = false;
    let width = 1;
    let height = 1;

    let initialized = false;
    const resize = () => {
      if (!container || disposed) return;
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (initialized && width > 1 && height > 1) {
        stepScene(0, true);
        renderer.render(scene, camera);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const performPick = (clientX: number, clientY: number) => {
      if (stateRef.current.focusOnly) return;
      const rect = renderer.domElement.getBoundingClientRect();
      _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
      _ray.setFromCamera(_ndc, camera);
      const hit = _ray.intersectObjects(hitTargets, false)[0];
      const nextHover = hit ? (hit.object.userData.key as NodeKey) : null;
      if (nextHover !== stateRef.current.hoveredNode) {
        stateRef.current.hoveredNode = nextHover;
        setHovered(nextHover);
        renderer.domElement.style.cursor = nextHover ? 'pointer' : isDragging ? 'grabbing' : 'grab';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (stateRef.current.focusOnly) return;
      performPick(e.clientX, e.clientY);
      isDragging = true;
      dragMoved = 0;
      lastX = e.clientX;
      dragVel = 0;
      renderer.domElement.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (stateRef.current.focusOnly) return;
      const rect = renderer.domElement.getBoundingClientRect();
      targetPX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      targetPY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      performPick(e.clientX, e.clientY);
      if (isDragging) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        dragMoved += Math.abs(dx);
        dragYaw += dx * 0.0065;
        dragVel = (dx * 0.0065) / 0.016;
      }
    };

    const onPointerUp = () => {
      if (!isDragging) return;
      isDragging = false;
      renderer.domElement.style.cursor = stateRef.current.hoveredNode ? 'pointer' : 'grab';
      if (dragMoved < 6 && stateRef.current.hoveredNode) {
        stateRef.current.onSelectNode(stateRef.current.hoveredNode);
      }
    };

    const onPointerLeave = () => {
      targetPX = 0;
      targetPY = 0;
      if (!isDragging) {
        stateRef.current.hoveredNode = null;
        setHovered(null);
      }
    };

    if (!focusOnly) {
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    }

    const updateLabels = () => {
      if (stateRef.current.focusOnly) return;
      const camDist = camera.position.length();
      const hot = stateRef.current.hoveredNode || stateRef.current.selectedNode;
      for (const key of Object.keys(hubs)) {
        const el = labelRefs.current[key];
        const hub = hubs[key];
        if (!el || !hub) continue;
        hub.group.getWorldPosition(_vec);
        const depth = (camera.position.distanceTo(_vec) - (camDist - 4.0)) / 8.0;
        _vec.y -= key === 'core' ? 1.5 : 0.62;
        _vec.project(camera);
        const px = (_vec.x * 0.5 + 0.5) * width;
        const py = (-_vec.y * 0.5 + 0.5) * height;
        el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, 0)`;
        el.style.opacity = hot === key ? '1' : Math.max(0.55, Math.min(1, 1.18 - depth * 0.58)).toFixed(2);
        el.style.zIndex = hot === key ? '6' : depth < 0.5 ? '4' : '2';
      }
    };

    const stepScene = (dt: number, instant = false) => {
      const k = instant ? 1 : 1 - Math.exp(-dt * 4.0);
      const { paused: isPaused, zoomLevel: zoom, focusOnly: fOnly, selectedNode: sel, hoveredNode: hov } = stateRef.current;

      if (!instant && !isPaused && !reduceMotion) {
        clockTime += dt;
        const calm = Boolean(hov || isDragging);
        autoYaw += dt * (fOnly ? 0.04 : calm ? 0.01 : 0.075);
        if (!isDragging && Math.abs(dragVel) > 0.0005) {
          dragYaw += dragVel * dt;
          dragVel *= Math.exp(-dt * 2.5);
        }
      }

      const targetYaw = autoYaw + dragYaw;
      yaw += (targetYaw - yaw) * k;
      systemGroup.rotation.y = yaw;

      coreGroup.rotation.y = clockTime * 0.25;
      coreGroup.rotation.x = Math.sin(clockTime * 0.18) * 0.15;
      gyro1.rotation.z = clockTime * 0.45;
      gyro2.rotation.x = clockTime * 0.35;

      const hotKey = hov || sel;
      for (const key of Object.keys(hubs)) {
        const h = hubs[key];
        const targetScale = hotKey === key ? 1.24 : 1.0;
        h.scale += (targetScale - h.scale) * Math.min(1, k * 2.2);
        h.group.scale.setScalar(h.scale);
        if (key !== 'core') {
          h.orb.rotation.y = clockTime * 0.6 + h.phase;
          h.orb.position.y = Math.sin(clockTime * 1.15 + h.phase) * 0.06;
          h.ring.rotation.z = clockTime * 0.5;
        }
      }

      const posArr = flowPoints.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < flowMeta.length; i++) {
        const m = flowMeta[i];
        m.curve.getPoint((m.off + clockTime * m.speed) % 1, _vec);
        posArr[i * 3] = _vec.x;
        posArr[i * 3 + 1] = _vec.y;
        posArr[i * 3 + 2] = _vec.z;
      }
      flowPoints.geometry.attributes.position.needsUpdate = true;
      dustPoints.rotation.y = clockTime * 0.015;

      const aspect = Math.max(0.7, width / height);
      const baseDist = Math.max(10.4 / (2 * Math.tan((38 * Math.PI) / 360) * aspect), 11.4) / zoom;
      if (fOnly) {
        _camTgt.set(-2.2, 2.4, baseDist * 0.88);
        _look.set(-1.5, 0.1, 0);
      } else {
        _camTgt.set(0, baseDist * 0.34, baseDist * 0.92);
        _look.set(0, -0.1, 0);
      }

      if (instant) {
        _camPos.copy(_camTgt);
      } else {
        _camPos.lerp(_camTgt, k);
      }
      parallaxX += (targetPX - parallaxX) * k;
      parallaxY += (targetPY - parallaxY) * k;
      const px = fOnly ? 0 : parallaxX;
      const py = fOnly ? 0 : parallaxY;

      camera.position.set(_camPos.x + px * 0.48, _camPos.y + py * 0.3, _camPos.z);
      camera.lookAt(_look);
      camera.updateMatrixWorld();
      systemGroup.updateMatrixWorld();
      updateLabels();
    };

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

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastPerf) / 1000));
      lastPerf = now;

      if (!document.hidden) {
        stepScene(dt, false);
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    initialized = true;
    resize();
    stepScene(0.016, true);
    renderer.render(scene, camera);
    setWebglReady(true);

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      envTexture.dispose();
      glowTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [focusOnly]);

  const allKeys: NodeKey[] = [
    'core',
    'patients',
    'doctors',
    'hospitals',
    'diagnostics',
    'pharma',
    'pharmacy',
    'insurance',
    'research',
  ];

  return (
    <div className="relative w-full h-full select-none" data-testid="ecosystem-3d-stage">
      {/* Static SVG Fallback for non-WebGL / loading state */}
      {(!webglReady || webglFailed) && (
        <svg
          className="absolute inset-0 w-full h-full opacity-90"
          viewBox="0 0 600 480"
          aria-hidden="true"
        >
          <g fill="none" stroke="#22D3EE" strokeWidth="1.2">
            <ellipse cx="300" cy="240" rx="220" ry="118" strokeOpacity=".26" />
            <ellipse cx="300" cy="240" rx="152" ry="82" strokeOpacity=".15" />
          </g>
          <g fill="none" strokeWidth="1.6" strokeOpacity=".55">
            <line x1="300" y1="240" x2="120" y2="115" stroke="#34D399" />
            <line x1="300" y1="240" x2="300" y2="75" stroke="#818CF8" />
            <line x1="300" y1="240" x2="480" y2="115" stroke="#60A5FA" />
            <line x1="300" y1="240" x2="515" y2="240" stroke="#2DD4BF" />
            <line x1="300" y1="240" x2="480" y2="365" stroke="#38BDF8" />
            <line x1="300" y1="240" x2="300" y2="405" stroke="#34D399" />
            <line x1="300" y1="240" x2="120" y2="365" stroke="#FBBF24" />
            <line x1="300" y1="240" x2="85" y2="240" stroke="#A78BFA" />
          </g>
          <polygon points="300,192 342,216 342,264 300,288 258,264 258,216" fill="#0891B2" stroke="#67E8F9" strokeWidth="2" />
          <circle cx="300" cy="240" r="14" fill="#A5F3FC" />
          <circle cx="120" cy="115" r="15" fill="#34D399" />
          <circle cx="300" cy="75" r="15" fill="#818CF8" />
          <circle cx="480" cy="115" r="15" fill="#60A5FA" />
          <circle cx="515" cy="240" r="15" fill="#2DD4BF" />
          <circle cx="480" cy="365" r="15" fill="#38BDF8" />
          <circle cx="300" cy="405" r="15" fill="#34D399" />
          <circle cx="120" cy="365" r="15" fill="#FBBF24" />
          <circle cx="85" cy="240" r="15" fill="#A78BFA" />
        </svg>
      )}

      {/* Isolated Three.js WebGL mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Accessible Interactive Node Labels (Solid rgba surface, no backdrop-blur over WebGL) */}
      {!focusOnly &&
        allKeys.map((key) => {
          const meta = ECOSYSTEM_NODES[key];
          const isHot = hovered === key || selectedNode === key;
          return (
            <button
              key={key}
              ref={(el) => {
                labelRefs.current[key] = el;
              }}
              type="button"
              onClick={() => onSelectNode(key)}
              onMouseEnter={() => {
                stateRef.current.hoveredNode = key;
                setHovered(key);
              }}
              onMouseLeave={() => {
                stateRef.current.hoveredNode = null;
                setHovered(null);
              }}
              aria-pressed={selectedNode === key}
              className={`absolute left-0 top-0 text-left rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap border ${
                isHot
                  ? 'bg-[#072430] text-white border-cyan-300 shadow-lg'
                  : 'bg-[#03151c]/90 text-slate-100 border-cyan-400/25 hover:border-cyan-300'
              }`}
              style={{
                transform: 'translate(-50%, -50%)',
                left: (!webglReady || webglFailed) && key === 'core' ? '50%' : undefined,
                top: (!webglReady || webglFailed) && key === 'core' ? '50%' : undefined,
              }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <span>{meta.short}</span>
              </span>
              {isHot && (
                <span className="block text-[10px] font-normal text-cyan-200/85 mt-0.5">
                  {meta.subtitle}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );
};
