import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Layers, Sun, Moon } from 'lucide-react';
import {
  createBrushedMetalRoughnessTexture,
  createClinicalFloorTextures,
  createRadialShadowTexture,
  createTelemetryScreenTexture,
  detectSoftwareGl,
} from './studioHelpers';

export type WardCameraPreset = 'overview' | 'telemetry' | 'medbot';

interface HospitalWardTwinCanvasProps {
  initialPreset?: WardCameraPreset;
  heightClassName?: string;
}

const CAMERA_PRESETS: Record<
  WardCameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  overview: { pos: [4.6, 3.2, 5.4], target: [0.1, 0.75, 0], label: 'Overview' },
  telemetry: { pos: [2.2, 2.0, 2.3], target: [1.55, 1.35, -0.55], label: 'ICU Telemetry' },
  medbot: { pos: [-2.6, 1.55, 2.85], target: [-1.75, 0.65, 0.85], label: 'Med-Bot Bay' },
};

// Zero-GC scratch vectors outside render loop
const _camGoalPos = new THREE.Vector3();
const _camGoalTgt = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();

export const HospitalWardTwinCanvas: React.FC<HospitalWardTwinCanvasProps> = ({
  initialPreset = 'overview',
  heightClassName = 'h-[460px] sm:h-[540px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<WardCameraPreset>(initialPreset);
  const [explodePct, setExplodePct] = useState(0);
  const [lightingMode, setLightingMode] = useState<'day' | 'night'>('day');
  const [dockOpen, setDockOpen] = useState(true);
  const [failed, setFailed] = useState(false);

  const stateRef = useRef({
    preset,
    explodePct,
    lightingMode,
    cameraTransitionActive: false,
  });
  stateRef.current.explodePct = explodePct;
  stateRef.current.lightingMode = lightingMode;

  const triggerRenderRef = useRef<(() => void) | null>(null);

  const selectPreset = (next: WardCameraPreset) => {
    setPreset(next);
    stateRef.current.preset = next;
    stateRef.current.cameraTransitionActive = true;
    triggerRenderRef.current?.();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
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
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04161e);
    scene.fog = new THREE.FogExp2(0x04161e, 0.042);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, 16 / 10, 0.1, 60);
    const pInit = CAMERA_PRESETS[stateRef.current.preset];
    camera.position.set(...pInit.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...pInit.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 11.5;
    controls.maxPolarAngle = Math.PI * 0.47;

    // 3-Point Warm Key / Cool Hemisphere / Rim Studio Lighting
    const hemi = new THREE.HemisphereLight(0xa5f3fc, 0x06202a, 0.88);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff3e0, 1.45);
    keyLight.position.set(4.5, 6.8, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.left = -5.5;
    keyLight.shadow.camera.right = 5.5;
    keyLight.shadow.camera.top = 5.5;
    keyLight.shadow.camera.bottom = -5.5;
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.72);
    rimLight.position.set(-4.5, 3.2, -4.0);
    scene.add(rimLight);

    // Procedural PBR Textures
    const floorTex = createClinicalFloorTextures(maxAniso);
    const metalRoughTex = createBrushedMetalRoughnessTexture(maxAniso);
    const shadowTex = createRadialShadowTexture();
    const screenTex = createTelemetryScreenTexture(maxAniso);

    // Grounded Clinical Bay Floor (y = 0)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshStandardMaterial({
        map: floorTex.albedo,
        roughnessMap: floorTex.roughness,
        roughness: 0.75,
        metalness: 0.12,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    // Instanced Floor Guidance Beacons (>20 repeated instances)
    const beaconGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.014, 12);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0e7490,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.6,
    });
    const instCount = 24;
    const beaconInst = new THREE.InstancedMesh(beaconGeo, beaconMat, instCount);
    for (let i = 0; i < instCount; i++) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      _pos.set(-3.2 + col * 1.28, 0.015, -2.4 + row * 1.6);
      _mat4.compose(_pos, _quat, _scale);
      beaconInst.setMatrixAt(i, _mat4);
    }
    beaconInst.instanceMatrix.needsUpdate = true;
    beaconInst.computeBoundingSphere();
    scene.add(beaconInst);

    // Contact shadow helper
    const addContactShadow = (parent: THREE.Group, x: number, z: number, sx: number, sz: number) => {
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(sx, sz),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      );
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(x, 0.012, z);
      parent.add(sh);
    };

    // Shared PBR Material Library (varied roughness & metalness >= 0.25 difference)
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughnessMap: metalRoughTex,
      roughness: 0.26,
      metalness: 0.88,
    });
    const darkChassisMat = new THREE.MeshStandardMaterial({
      color: 0x0f2936,
      roughness: 0.55,
      metalness: 0.35,
    });
    const cushionMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.82,
      metalness: 0.04,
    });
    const cyanAccentMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.4,
      roughness: 0.28,
      metalness: 0.45,
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.08,
    });

    // =========================================================================
    // ASSEMBLY 1: SMART ARTICULATED ICU BED (10-part composite Group, pivot y=0)
    // =========================================================================
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-0.25, 0, -0.15);
    scene.add(bedGroup);
    addContactShadow(bedGroup, 0, 0, 3.0, 1.8);

    // 4 Medical Caster Wheels sitting flush at y=0
    const wheelGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const casterOffsets: [number, number][] = [
      [-1.02, -0.52],
      [1.02, -0.52],
      [-1.02, 0.52],
      [1.02, 0.52],
    ];
    for (const [wx, wz] of casterOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, rubberMat);
      wheel.position.set(wx, 0.08, wz);
      wheel.castShadow = !isSoftwareGl;
      bedGroup.add(wheel);

      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 12), titaniumMat);
      fork.position.set(wx, 0.18, wz);
      bedGroup.add(fork);
    }

    // Bevelled Chassis Base Frame (ExtrudeGeometry)
    const chassisShape = new THREE.Shape();
    chassisShape.moveTo(-1.12, -0.56);
    chassisShape.lineTo(1.12, -0.56);
    chassisShape.lineTo(1.12, 0.56);
    chassisShape.lineTo(-1.12, 0.56);
    chassisShape.closePath();
    const chassisGeo = new THREE.ExtrudeGeometry(chassisShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    chassisGeo.rotateX(Math.PI / 2);
    const chassisMesh = new THREE.Mesh(chassisGeo, darkChassisMat);
    chassisMesh.position.y = 0.36;
    chassisMesh.castShadow = !isSoftwareGl;
    bedGroup.add(chassisMesh);

    // Hydraulic Lift Pedestal Columns
    const liftGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.34, 18);
    const liftA = new THREE.Mesh(liftGeo, titaniumMat);
    liftA.position.set(-0.55, 0.5, 0);
    bedGroup.add(liftA);
    const liftB = new THREE.Mesh(liftGeo, titaniumMat);
    liftB.position.set(0.55, 0.5, 0);
    bedGroup.add(liftB);

    // Upper Mattress & Safety Rails sub-group (explodable upward)
    const bedDeckGroup = new THREE.Group();
    bedGroup.add(bedDeckGroup);

    const mattressShape = new THREE.Shape();
    mattressShape.moveTo(-1.05, -0.5);
    mattressShape.lineTo(1.05, -0.5);
    mattressShape.lineTo(1.05, 0.5);
    mattressShape.lineTo(-1.05, 0.5);
    mattressShape.closePath();
    const mattressGeo = new THREE.ExtrudeGeometry(mattressShape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 3,
    });
    mattressGeo.rotateX(Math.PI / 2);
    const mattress = new THREE.Mesh(mattressGeo, cushionMat);
    mattress.position.y = 0.84;
    mattress.castShadow = !isSoftwareGl;
    bedDeckGroup.add(mattress);

    // Tilted Backrest Cushion
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.14, 0.96), cushionMat);
    backrest.position.set(-0.62, 0.96, 0);
    backrest.rotation.z = -0.34;
    bedDeckGroup.add(backrest);

    // Curved Tubular Stainless Side Rails (TubeGeometry)
    const railCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.78, 0.8, 0.58),
      new THREE.Vector3(-0.68, 1.12, 0.58),
      new THREE.Vector3(0.45, 1.12, 0.58),
      new THREE.Vector3(0.58, 0.8, 0.58),
    ]);
    const railGeo = new THREE.TubeGeometry(railCurve, 28, 0.025, 8, false);
    const railFront = new THREE.Mesh(railGeo, titaniumMat);
    bedDeckGroup.add(railFront);
    const railBack = new THREE.Mesh(railGeo, titaniumMat);
    railBack.position.z = -1.16;
    bedDeckGroup.add(railBack);

    // Headboard + Footboard + Cyan Biometric Strip
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.56, 1.12), darkChassisMat);
    headboard.position.set(-1.14, 0.98, 0);
    bedDeckGroup.add(headboard);
    const footboard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, 1.12), darkChassisMat);
    footboard.position.set(1.14, 0.92, 0);
    bedDeckGroup.add(footboard);
    const footTrim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.9), cyanAccentMat);
    footTrim.position.set(1.15, 1.04, 0);
    bedDeckGroup.add(footTrim);

    // Lathe-turned IV Pole + Saline Bag mounted on headboard corner
    const ivPoints = [
      new THREE.Vector2(0.035, 0),
      new THREE.Vector2(0.028, 0.65),
      new THREE.Vector2(0.018, 1.25),
      new THREE.Vector2(0.018, 1.48),
      new THREE.Vector2(0.14, 1.5),
    ];
    const ivPole = new THREE.Mesh(new THREE.LatheGeometry(ivPoints, 16), titaniumMat);
    ivPole.position.set(-1.08, 0.72, -0.52);
    bedGroup.add(ivPole);

    const salineMat = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      roughness: 0.14,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.75,
      transparent: true,
      opacity: isSoftwareGl ? 0.55 : 0.92,
      ior: 1.4,
    });
    const salineBag = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 6, 12), salineMat);
    salineBag.position.set(-0.96, 1.98, -0.52);
    bedGroup.add(salineBag);

    // =========================================================================
    // ASSEMBLY 2: TELEMETRY MONITOR TOWER (6-part composite Group, pivot y=0)
    // =========================================================================
    const towerGroup = new THREE.Group();
    towerGroup.position.set(1.55, 0, -0.65);
    towerGroup.rotation.y = -0.48;
    scene.add(towerGroup);
    addContactShadow(towerGroup, 0, 0, 1.15, 1.15);

    const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.08, 24), darkChassisMat);
    towerBase.position.y = 0.04;
    towerGroup.add(towerBase);

    const towerMast = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 1.48, 18), titaniumMat);
    towerMast.position.y = 0.78;
    towerMast.castShadow = !isSoftwareGl;
    towerGroup.add(towerMast);

    const monitorHeadGroup = new THREE.Group();
    monitorHeadGroup.position.set(0, 1.48, 0.08);
    towerGroup.add(monitorHeadGroup);

    const monitorCasing = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.56, 0.1), darkChassisMat);
    monitorCasing.castShadow = !isSoftwareGl;
    monitorHeadGroup.add(monitorCasing);

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, 0.46),
      new THREE.MeshBasicMaterial({
        map: screenTex,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    screenMesh.position.z = 0.052;
    monitorHeadGroup.add(screenMesh);

    const beaconCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.045, 0.07, 14),
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x10b981,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      })
    );
    beaconCap.position.set(0, 0.32, 0);
    monitorHeadGroup.add(beaconCap);

    // =========================================================================
    // ASSEMBLY 3: AUTONOMOUS COLD-CHAIN MED-BOT (8-part composite Group, y=0)
    // =========================================================================
    const botGroup = new THREE.Group();
    botGroup.position.set(-1.75, 0, 0.85);
    botGroup.rotation.y = 0.52;
    scene.add(botGroup);
    addContactShadow(botGroup, 0, 0, 1.35, 1.35);

    const botSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.49, 0.14, 24), rubberMat);
    botSkirt.position.y = 0.07;
    botGroup.add(botSkirt);

    const botHull = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.46, 0.48, 24), titaniumMat);
    botHull.position.y = 0.38;
    botHull.castShadow = !isSoftwareGl;
    botGroup.add(botHull);

    const botVisor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.08, 24, 1, false, -0.7, 1.4),
      cyanAccentMat
    );
    botVisor.position.y = 0.44;
    botGroup.add(botVisor);

    // Internal glowing cold-chain medicine tray
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 20), darkChassisMat);
    tray.position.y = 0.64;
    botGroup.add(tray);

    const coldVialMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.2,
      metalness: 0.3,
    });
    for (let v = -1; v <= 1; v++) {
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 12), coldVialMat);
      vial.position.set(v * 0.13, 0.75, 0);
      botGroup.add(vial);
    }

    // Explodable Frosted Polycarbonate Lid + LiDAR Turret
    const botLidGroup = new THREE.Group();
    botGroup.add(botLidGroup);

    const domeLid = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        roughness: 0.12,
        metalness: 0.08,
        transmission: isSoftwareGl ? 0 : 0.72,
        transparent: true,
        opacity: isSoftwareGl ? 0.38 : 0.94,
        depthWrite: false,
      })
    );
    domeLid.position.y = 0.62;
    botLidGroup.add(domeLid);

    const lidarPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.09, 0),
      new THREE.Vector2(0.09, 0.08),
      new THREE.Vector2(0.065, 0.12),
      new THREE.Vector2(0, 0.12),
    ];
    const lidarTurret = new THREE.Mesh(new THREE.LatheGeometry(lidarPts, 18), darkChassisMat);
    lidarTurret.position.set(0, 0.94, 0);
    botLidGroup.add(lidarTurret);

    // Render loop + Exponential Damping + afterDraw software-GL pacing
    let lastPerf = performance.now();
    let frameId = 0;
    let disposed = false;
    let busy = false;
    let dirty = false;
    let currentExplode = 0;

    const onControlStart = () => {
      stateRef.current.cameraTransitionActive = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

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

        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastPerf) / 1000));
        lastPerf = now;

        const s = stateRef.current;

        // Lighting mode updates (warm clinical day vs calm night telemetry shift)
        const isNight = s.lightingMode === 'night';
        const targetBg = isNight ? 0x020911 : 0x04161e;
        if ((scene.background as THREE.Color).getHex() !== targetBg) {
          (scene.background as THREE.Color).setHex(targetBg);
          (scene.fog as THREE.FogExp2).color.setHex(targetBg);
        }
        keyLight.intensity = isNight ? 0.65 : 1.45;
        hemi.intensity = isNight ? 0.55 : 0.88;
        rimLight.intensity = isNight ? 1.1 : 0.72;

        // Smooth exponential damping for exploded assembly layers
        const targetExplode = s.explodePct / 100;
        currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 6.5, dt);
        bedDeckGroup.position.y = currentExplode * 0.55;
        monitorHeadGroup.position.y = 1.48 + currentExplode * 0.42;
        botLidGroup.position.y = currentExplode * 0.48;

        // Smooth damped camera preset glide
        let camMoving = false;
        if (s.cameraTransitionActive) {
          const cfg = CAMERA_PRESETS[s.preset];
          _camGoalPos.set(...cfg.pos);
          _camGoalTgt.set(...cfg.target);
          const alpha = 1 - Math.exp(-7.5 * dt);
          camera.position.lerp(_camGoalPos, alpha);
          controls.target.lerp(_camGoalTgt, alpha);
          if (camera.position.distanceTo(_camGoalPos) < 0.02 && controls.target.distanceTo(_camGoalTgt) < 0.02) {
            camera.position.copy(_camGoalPos);
            controls.target.copy(_camGoalTgt);
            s.cameraTransitionActive = false;
          } else {
            camMoving = true;
          }
        }

        const controlsMoving = controls.update();
        renderer.render(scene, camera);

        const explodeSettled = Math.abs(currentExplode - targetExplode) < 0.005;
        const done = () => {
          busy = false;
          if (dirty || camMoving || controlsMoving || !explodeSettled) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerRenderRef.current = requestRender;
    resize();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();

      floorTex.albedo.dispose();
      floorTex.roughness.dispose();
      metalRoughTex.dispose();
      shadowTex.dispose();
      screenTex.dispose();
      envTex.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
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

  useEffect(() => {
    triggerRenderRef.current?.();
  }, [explodePct, lightingMode]);

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-2xl overflow-hidden border border-cyan-500/25 bg-[#04161e]`}
      data-testid="hospital-ward-3d-stage"
    >
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-cyan-200">
          3D Hospital Ward Twin requires WebGL graphics support.
        </div>
      )}

      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top Spec Badge */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <span className="px-3 py-1 rounded-md bg-[rgba(3,21,28,0.9)] border border-cyan-400/25 text-[11px] font-mono text-cyan-200">
          NIROG ICU Bay-04 · 3D Composite Digital Twin
        </span>
      </div>

      {/* Collapsible Unified Bottom Control Dock (<=15% height, solid rgba, no backdrop-filter) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(780px,94%)] flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1 px-3 py-1 rounded-t-lg bg-[rgba(3,21,28,0.94)] border border-b-0 border-cyan-400/30 text-[10px] font-mono text-cyan-200 hover:text-white"
        >
          {dockOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          <span>{dockOpen ? 'Hide Controls' : 'Show Controls'}</span>
        </button>

        {dockOpen && (
          <div className="pointer-events-auto w-full rounded-xl bg-[rgba(3,21,28,0.94)] border border-cyan-400/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-100">
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="3D Camera View">
              {(Object.keys(CAMERA_PRESETS) as WardCameraPreset[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={preset === k}
                  onClick={() => selectPreset(k)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    preset === k
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#072430] text-slate-200 hover:bg-[#0b3545]'
                  }`}
                >
                  {CAMERA_PRESETS[k].label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-[11px] font-mono text-cyan-100">
              <Layers className="w-3.5 h-3.5 text-cyan-300" />
              <span>Explode</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={explodePct}
                onChange={(e) => setExplodePct(Number(e.target.value))}
                className="w-24 accent-cyan-400"
                aria-label="Explode ICU assemblies"
              />
              <span className="w-8 text-right tabular-nums">{explodePct}%</span>
            </label>

            <button
              type="button"
              onClick={() => setLightingMode((m) => (m === 'day' ? 'night' : 'day'))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#072430] border border-cyan-400/25 text-[11px] font-mono text-cyan-200 hover:border-cyan-300"
            >
              {lightingMode === 'day' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              <span>{lightingMode === 'day' ? 'Clinical Day' : 'Night Shift'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
