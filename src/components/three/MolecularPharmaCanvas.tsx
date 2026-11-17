import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Layers, Atom } from 'lucide-react';
import {
  createBrushedMetalRoughnessTexture,
  createClinicalFloorTextures,
  createRadialShadowTexture,
  detectSoftwareGl,
} from './studioHelpers';

export type PharmaCameraPreset = 'overview' | 'core' | 'ligand';
export type PharmaCompoundId = 'tagrix' | 'orforglipron' | 'lnp';

interface MolecularPharmaCanvasProps {
  initialCompound?: PharmaCompoundId;
  heightClassName?: string;
}

const CAMERA_PRESETS: Record<
  PharmaCameraPreset,
  { pos: [number, number, number]; target: [number, number, number]; label: string }
> = {
  overview: { pos: [4.0, 2.8, 4.7], target: [0, 1.24, 0], label: 'Overview' },
  core: { pos: [1.55, 1.95, 2.15], target: [0, 1.56, 0], label: 'Core' },
  ligand: { pos: [-2.4, 2.25, 2.3], target: [0.25, 1.62, 0.1], label: 'Dock' },
};

const COMPOUND_META: Record<
  PharmaCompoundId,
  { label: string; badge: string; accent: number; secondary: number }
> = {
  tagrix: {
    label: 'Tagrix',
    badge: 'EGFR T790M Indole-Pyrimidine Inhibitor · First-Mover Global Generic',
    accent: 0x22d3ee,
    secondary: 0x38bdf8,
  },
  orforglipron: {
    label: 'Orforglipron',
    badge: 'Non-Peptide Oral GLP-1 Receptor Agonist · Metabolic Pipeline',
    accent: 0x34d399,
    secondary: 0x10b981,
  },
  lnp: {
    label: 'LNP Cryo',
    badge: 'Ionizable Lipid Nanoparticle · Biopolymer Delivery Matrix',
    accent: 0xa78bfa,
    secondary: 0x38bdf8,
  },
};

// Pre-allocated zero-GC scratch objects outside render loop
const _camGoalPos = new THREE.Vector3();
const _camGoalTgt = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _upVec = new THREE.Vector3(0, 1, 0);
const _dirVec = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();

function createBevelledHexRingGeo(radius: number, thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const hole = new THREE.Path();
  const inner = radius * 0.56;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a) * inner;
    const y = Math.sin(a) * inner;
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

export const MolecularPharmaCanvas: React.FC<MolecularPharmaCanvasProps> = ({
  initialCompound = 'tagrix',
  heightClassName = 'h-[450px] sm:h-[520px]',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<PharmaCameraPreset>('overview');
  const [compound, setCompound] = useState<PharmaCompoundId>(initialCompound);
  const [explodePct, setExplodePct] = useState(25);
  const [dockOpen, setDockOpen] = useState(true);
  const [failed, setFailed] = useState(false);

  const stateRef = useRef({
    preset,
    compound,
    explodePct,
    cameraTransitionActive: false,
  });
  stateRef.current.compound = compound;
  stateRef.current.explodePct = explodePct;

  const triggerRenderRef = useRef<(() => void) | null>(null);

  const selectPreset = (next: PharmaCameraPreset) => {
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
    scene.background = new THREE.Color(0x04151d);
    scene.fog = new THREE.FogExp2(0x04151d, 0.048);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.0;
    controls.maxDistance = 9.5;
    controls.maxPolarAngle = Math.PI * 0.47;

    // Procedural Textures
    const floorTex = createClinicalFloorTextures(maxAniso);
    const metalRoughTex = createBrushedMetalRoughnessTexture(maxAniso);
    const shadowTex = createRadialShadowTexture();

    // Studio Lighting (Warm key + Cool Hemisphere + Cyan Rim)
    const hemiLight = new THREE.HemisphereLight(0xdaf4ff, 0x091b24, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e2, 2.25);
    keyLight.position.set(4.5, 6.8, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 18;
      keyLight.shadow.camera.left = -4;
      keyLight.shadow.camera.right = 4;
      keyLight.shadow.camera.top = 4;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.bias = -0.0006;
    }
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x22d3ee, 3.8, 9, 1.5);
    rimLight.position.set(-2.5, 2.8, -2.0);
    scene.add(rimLight);

    // Materials (varied PBR roughness & metalness)
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex.albedo,
      roughnessMap: floorTex.roughness,
      roughness: 0.72,
      metalness: 0.08,
    });
    const ceramicPlinthMat = new THREE.MeshStandardMaterial({
      color: 0xe6f0f4,
      roughness: 0.34,
      metalness: 0.08,
    });
    const brushedTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x647d8c,
      roughnessMap: metalRoughTex,
      roughness: 0.36,
      metalness: 0.84,
    });
    const darkChassisMat = new THREE.MeshStandardMaterial({
      color: 0x0e2430,
      roughness: 0.44,
      metalness: 0.56,
    });
    const shellLipidMat = new THREE.MeshPhysicalMaterial({
      color: 0x164e63,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.75,
      clearcoatRoughness: 0.14,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
    });
    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.2,
    });
    const secondaryGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      roughness: 0.22,
      metalness: 0.28,
    });
    const carbonRingMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.28,
      metalness: 0.62,
    });
    const heteroNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.26,
      metalness: 0.22,
    });
    const fluorNodeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.24,
      metalness: 0.32,
    });

    // 1. Grounded Lab Floor at y = 0
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // 2. Stepped Magnetic Levitation Diagnostic Plinth (Composite Group resting flush at y = 0)
    const plinthGroup = new THREE.Group();
    plinthGroup.position.set(0, 0, 0);

    const plinthProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.55, 0.0),
      new THREE.Vector2(1.48, 0.11),
      new THREE.Vector2(1.22, 0.16),
      new THREE.Vector2(1.15, 0.26),
      new THREE.Vector2(0.75, 0.28),
      new THREE.Vector2(0.68, 0.22),
      new THREE.Vector2(0.0, 0.22),
    ];
    const plinthBase = new THREE.Mesh(new THREE.LatheGeometry(plinthProfile, 48), darkChassisMat);
    plinthBase.castShadow = true;
    plinthBase.receiveShadow = true;
    plinthGroup.add(plinthBase);

    const plinthTopRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 16, 48), ceramicPlinthMat);
    plinthTopRing.rotation.x = Math.PI / 2;
    plinthTopRing.position.y = 0.27;
    plinthGroup.add(plinthTopRing);

    const emitterRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.024, 12, 48), accentGlowMat);
    emitterRing.rotation.x = Math.PI / 2;
    emitterRing.position.y = 0.24;
    plinthGroup.add(emitterRing);

    // Soft radial contact shadow directly under plinth
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.88,
    });
    const plinthShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), shadowMat);
    plinthShadow.rotation.x = -Math.PI / 2;
    plinthShadow.position.y = 0.004;
    plinthGroup.add(plinthShadow);

    // 2 Articulated Assay Probe Arms grounded on the plinth rim
    [-1, 1].forEach((side) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 1.28, 0.16, 0);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 16), brushedTitaniumMat);
      collar.position.y = 0.06;
      armGroup.add(collar);

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.12, 0),
        new THREE.Vector3(side * 0.14, 0.85, 0),
        new THREE.Vector3(-side * 0.22, 1.38, 0),
      ]);
      const armTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.038, 12, false), brushedTitaniumMat);
      armTube.castShadow = true;
      armGroup.add(armTube);

      const sensorHead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.14, 16), ceramicPlinthMat);
      sensorHead.position.set(-side * 0.24, 1.39, 0);
      sensorHead.rotation.z = side * 1.05;
      armGroup.add(sensorHead);

      const sensorLens = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), accentGlowMat);
      sensorLens.position.set(-side * 0.30, 1.42, 0);
      armGroup.add(sensorLens);

      plinthGroup.add(armGroup);
    });

    // InstancedMesh Perimeter Calibration Beacons (24 instances on floor ring)
    const beaconCount = 24;
    const beaconGeo = new THREE.BoxGeometry(0.11, 0.025, 0.055);
    const beaconMesh = new THREE.InstancedMesh(beaconGeo, accentGlowMat, beaconCount);
    for (let i = 0; i < beaconCount; i++) {
      const a = (i / beaconCount) * Math.PI * 2;
      _dummy.position.set(Math.cos(a) * 1.82, 0.013, Math.sin(a) * 1.82);
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      beaconMesh.setMatrixAt(i, _dummy.matrix);
    }
    beaconMesh.instanceMatrix.needsUpdate = true;
    beaconMesh.computeBoundingSphere();
    plinthGroup.add(beaconMesh);
    scene.add(plinthGroup);

    // 3. Lipid-Polymer Nanoparticle (LNP) Cutaway Carrier + Instanced Ligand Spikes (Floating at y = 1.58)
    const lnpRoot = new THREE.Group();
    lnpRoot.position.set(0, 1.58, 0);
    scene.add(lnpRoot);

    // Upper Hemisphere Shell (Lathe profile with finite wall thickness for realistic cross-section)
    const upperShellPts: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = (i / 14) * (Math.PI * 0.42);
      upperShellPts.push(new THREE.Vector2(Math.sin(t) * 0.98, Math.cos(t) * 0.98));
    }
    for (let i = 14; i >= 0; i--) {
      const t = (i / 14) * (Math.PI * 0.42);
      upperShellPts.push(new THREE.Vector2(Math.sin(t) * 0.87, Math.cos(t) * 0.87));
    }
    const upperShell = new THREE.Mesh(new THREE.LatheGeometry(upperShellPts, 40), shellLipidMat);
    lnpRoot.add(upperShell);

    // Lower Hemisphere Shell (mirrors cleanly downward)
    const lowerShell = upperShell.clone();
    lowerShell.rotation.x = Math.PI;
    lnpRoot.add(lowerShell);

    // Equator Biopolymer Helical Ribbons (2 TubeGeometry loops)
    const helixGroup = new THREE.Group();
    [0, Math.PI].forEach((offsetAngle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        const r = 0.72 + Math.sin(t * 3) * 0.05;
        pts.push(new THREE.Vector3(Math.cos(t + offsetAngle) * r, Math.sin(t * 2) * 0.18, Math.sin(t + offsetAngle) * r));
      }
      const ribbon = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.022, 10, true),
        secondaryGlowMat
      );
      helixGroup.add(ribbon);
    });
    lnpRoot.add(helixGroup);

    // InstancedMesh PEGylated Surface Receptor Ligands (36 stalks on Fibonacci sphere)
    const spikeCount = 36;
    const spikePoints: THREE.Vector3[] = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < spikeCount; i++) {
      const y = 1 - (i / (spikeCount - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      spikePoints.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize());
    }
    const spikeGeo = new THREE.CylinderGeometry(0.036, 0.014, 0.22, 10);
    const spikeInstanced = new THREE.InstancedMesh(spikeGeo, accentGlowMat, spikeCount);
    spikeInstanced.computeBoundingSphere();
    lnpRoot.add(spikeInstanced);

    // 4. Inner Active Pharmaceutical Ingredient (API) Molecular Core Assembly
    const coreGroup = new THREE.Group();
    lnpRoot.add(coreGroup);

    const hexGeo = createBevelledHexRingGeo(0.24, 0.06);
    const smallHexGeo = createBevelledHexRingGeo(0.18, 0.055);
    const bondGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.34, 12);
    const atomGeo = new THREE.SphereGeometry(0.075, 16, 16);

    // Sub-group 1: Tagrix (Indole-Pyrimidine EGFR Inhibitor)
    const tagrixGroup = new THREE.Group();
    const tRingA = new THREE.Mesh(hexGeo, carbonRingMat);
    tRingA.position.set(-0.28, 0.04, 0);
    tRingA.rotation.set(0.3, 0.4, 0.15);
    tagrixGroup.add(tRingA);

    const tRingB = new THREE.Mesh(smallHexGeo, secondaryGlowMat);
    tRingB.position.set(0.12, -0.02, 0.08);
    tRingB.rotation.set(-0.2, 0.25, 0.4);
    tagrixGroup.add(tRingB);

    const tRingC = new THREE.Mesh(hexGeo, carbonRingMat);
    tRingC.position.set(0.45, 0.12, -0.06);
    tRingC.rotation.set(0.45, -0.35, 0.2);
    tagrixGroup.add(tRingC);

    const tBond1 = new THREE.Mesh(bondGeo, brushedTitaniumMat);
    tBond1.position.set(-0.08, 0.01, 0.04);
    tBond1.rotation.z = Math.PI / 2;
    tagrixGroup.add(tBond1);

    const tBond2 = new THREE.Mesh(bondGeo, brushedTitaniumMat);
    tBond2.position.set(0.29, 0.05, 0.01);
    tBond2.rotation.z = Math.PI / 2 - 0.35;
    tagrixGroup.add(tBond2);

    const tAtomN = new THREE.Mesh(atomGeo, heteroNodeMat);
    tAtomN.position.set(0.12, 0.22, 0.12);
    tagrixGroup.add(tAtomN);

    const tAtomO = new THREE.Mesh(atomGeo, accentGlowMat);
    tAtomO.position.set(-0.48, -0.14, 0.14);
    tagrixGroup.add(tAtomO);
    coreGroup.add(tagrixGroup);

    // Sub-group 2: Orforglipron (Non-Peptide Tetra-Substituted GLP-1 Agonist)
    const orfoGroup = new THREE.Group();
    [
      [-0.36, -0.12, 0.12, 0.4, 0.2],
      [-0.08, 0.14, -0.06, -0.25, 0.5],
      [0.24, -0.06, 0.1, 0.3, -0.4],
      [0.44, 0.18, -0.12, -0.4, 0.2],
    ].forEach(([px, py, pz, rx, ry], idx) => {
      const r = new THREE.Mesh(idx % 2 === 0 ? hexGeo : smallHexGeo, idx === 1 ? secondaryGlowMat : carbonRingMat);
      r.position.set(px, py, pz);
      r.rotation.set(rx, ry, 0.15);
      orfoGroup.add(r);
    });
    const oSpinePts = [
      new THREE.Vector3(-0.4, -0.14, 0.12),
      new THREE.Vector3(-0.08, 0.14, -0.06),
      new THREE.Vector3(0.24, -0.06, 0.1),
      new THREE.Vector3(0.46, 0.2, -0.12),
    ];
    orfoGroup.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(oSpinePts), 24, 0.026, 10, false), brushedTitaniumMat)
    );
    const oFluor = new THREE.Mesh(atomGeo, fluorNodeMat);
    oFluor.position.set(0.46, 0.32, -0.18);
    orfoGroup.add(oFluor);
    const oOxo = new THREE.Mesh(atomGeo, heteroNodeMat);
    oOxo.position.set(-0.44, -0.28, 0.16);
    orfoGroup.add(oOxo);
    coreGroup.add(orfoGroup);

    // Sub-group 3: LNP Cryo-Protected mRNA Biopolymer Payload
    const lnpCoreGroup = new THREE.Group();
    const mRnaPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * Math.PI * 4;
      const rad = 0.34;
      mRnaPts.push(new THREE.Vector3(Math.cos(t) * rad, (i / 60 - 0.5) * 0.65, Math.sin(t) * rad));
    }
    lnpCoreGroup.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mRnaPts), 64, 0.042, 12, false), accentGlowMat)
    );
    const cryoCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.19, 1), ceramicPlinthMat);
    lnpCoreGroup.add(cryoCore);
    coreGroup.add(lnpCoreGroup);

    // ResizeObserver & Camera framing
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      requestRender();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Damped / On-Demand + Continuous Micro-Rotation Loop with SwiftShader FenceSync
    let disposed = false;
    let frameId = 0;
    let busy = false;
    let dirty = true;
    let currentExplode = stateRef.current.explodePct / 100;
    let prevTs = performance.now();

    const onControlStart = () => {
      stateRef.current.cameraTransitionActive = false;
      requestRender();
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext();
      if (typeof (gl as WebGL2RenderingContext).fenceSync === 'function') {
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.flush();
          const poll = () => {
            if (disposed) return;
            const res = gl2.clientWaitSync(sync, 0, 0);
            if (res === gl2.TIMEOUT_EXPIRED) {
              setTimeout(poll, 16);
            } else {
              gl2.deleteSync(sync);
              cb();
            }
          };
          poll();
          return;
        }
      }
      setTimeout(cb, 32);
    }

    function updateSceneForState(dt: number) {
      const s = stateRef.current;
      const meta = COMPOUND_META[s.compound];
      accentGlowMat.color.setHex(meta.accent);
      accentGlowMat.emissive.setHex(meta.accent);
      secondaryGlowMat.color.setHex(meta.secondary);
      secondaryGlowMat.emissive.setHex(meta.secondary);
      rimLight.color.setHex(meta.accent);

      tagrixGroup.visible = s.compound === 'tagrix';
      orfoGroup.visible = s.compound === 'orforglipron';
      lnpCoreGroup.visible = s.compound === 'lnp';

      const targetExplode = s.explodePct / 100;
      currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 7, dt);

      upperShell.position.y = currentExplode * 0.62;
      lowerShell.position.y = -currentExplode * 0.62;
      helixGroup.scale.setScalar(1 + currentExplode * 0.22);

      // Update instanced PEGylated ligands locked cleanly to their upper/lower hemisphere dome
      const spikeDist = 1.05;
      for (let i = 0; i < spikeCount; i++) {
        _dirVec.copy(spikePoints[i]);
        _tmpQuat.setFromUnitVectors(_upVec, _dirVec);
        _dummy.position.copy(_dirVec).multiplyScalar(spikeDist);
        _dummy.position.y += (_dirVec.y >= 0 ? 1 : -1) * currentExplode * 0.62;
        _dummy.quaternion.copy(_tmpQuat);
        _dummy.scale.setScalar(1);
        _dummy.updateMatrix();
        spikeInstanced.setMatrixAt(i, _dummy.matrix);
      }
      spikeInstanced.instanceMatrix.needsUpdate = true;

      // Gentle diagnostic turntable rotation on inner API core
      coreGroup.rotation.y += dt * 0.28;
      lnpRoot.rotation.y -= dt * 0.08;

      return Math.abs(currentExplode - targetExplode) < 0.005;
    }

    function requestRender() {
      if (disposed) return;
      dirty = true;
      if (busy) return;
      busy = true;

      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        const dt = Math.min((now - prevTs) / 1000, 0.05);
        prevTs = now;
        dirty = false;

        const explodeSettled = updateSceneForState(dt);

        const s = stateRef.current;
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

        const done = () => {
          busy = false;
          // Continuous slow core rotation when not on software GL, or settle smoothly on software GL
          if (!isSoftwareGl || dirty || camMoving || controlsMoving || !explodeSettled) {
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
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();

      floorTex.albedo.dispose();
      floorTex.roughness.dispose();
      metalRoughTex.dispose();
      shadowTex.dispose();
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
  }, [compound, explodePct]);

  const activeMeta = COMPOUND_META[compound];

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-2xl overflow-hidden border border-cyan-500/25 bg-[#04151d]`}
      data-testid="molecular-pharma-3d-stage"
    >
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-cyan-200">
          3D Molecular Pharmacology Studio requires WebGL graphics support.
        </div>
      )}

      {/* Isolated WebGL mount container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top Compound Spec Badge */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
        <span className="px-3 py-1 rounded-md bg-[rgba(3,21,28,0.92)] border border-cyan-400/25 text-[11px] font-mono text-cyan-200">
          {activeMeta.badge}
        </span>
      </div>

      {/* Collapsible Bottom Control Dock (<=15% height, solid rgba, no backdrop-filter) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(860px,95%)] flex flex-col items-center pointer-events-none">
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
            {/* Compound Selector */}
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Select 3D Molecule">
              <Atom className="w-3.5 h-3.5 text-cyan-300 mr-1" />
              {(Object.keys(COMPOUND_META) as PharmaCompoundId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={compound === id}
                  onClick={() => setCompound(id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    compound === id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#072430] text-slate-200 hover:bg-[#0b3545]'
                  }`}
                >
                  {COMPOUND_META[id].label}
                </button>
              ))}
            </div>

            {/* Camera Presets */}
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="3D Camera View">
              {(Object.keys(CAMERA_PRESETS) as PharmaCameraPreset[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={preset === k}
                  onClick={() => selectPreset(k)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    preset === k
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#072430] text-slate-200 hover:bg-[#0b3545]'
                  }`}
                >
                  {CAMERA_PRESETS[k].label}
                </button>
              ))}
            </div>

            {/* Explode Shell Slider */}
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
                className="w-20 accent-cyan-400"
                aria-label="Explode nanoparticle shell"
              />
              <span className="w-8 text-right tabular-nums">{explodePct}%</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
