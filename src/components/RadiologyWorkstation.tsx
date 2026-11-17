import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  HelpCircle,
  Layers,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { RadiologyCase } from '../types/nirog';
import {
  analyzeScanImageStats,
  answerScanFollowUpQuestion,
  buildChesterCsvExport,
  buildStructuredRadiologyReport,
  classifyPathology18Risks,
  computePfirrmannSummary,
  CXR_DATASET_CATALOG,
  parseBasicDicomBuffer,
  retrieveSimilarCases,
  SCAN_MODALITIES,
  SCAN_PRESET_STUDIES,
  type AnalyzedScanOutput,
  type ScanModality,
  type XaiMode,
} from '../utils/radiologyEngine';
import { PRESET_SCAN_IMAGE_URLS } from '../utils/scanAssets';
import { ScanViewport2D } from './ScanViewport2D';
import { RadiologyCanvas } from './three/RadiologyCanvas';

interface RadiologyWorkstationProps {
  onDispatchRadiologyCase: (item: {
    patient: string;
    modality: string;
    findingKey: RadiologyCase['findingKey'];
    aiHighlight: string;
  }) => string;
}

export const RadiologyWorkstation: React.FC<RadiologyWorkstationProps> = ({
  onDispatchRadiologyCase,
}) => {
  const [modality, setModality] = useState<ScanModality>('chest-cxr');
  const [presetId, setPresetId] = useState<string>(SCAN_PRESET_STUDIES[0].id);
  const [xaiMode, setXaiMode] = useState<XaiMode>('gradcam');
  const [xaiOpacity, setXaiOpacity] = useState(0.72);
  const [sliceIdx, setSliceIdx] = useState(16);
  const [windowBrightness, setWindowBrightness] = useState(1.0);
  const [windowContrast, setWindowContrast] = useState(1.1);
  const [invert, setInvert] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [reportLevel, setReportLevel] = useState<'technical' | 'patient'>('patient');
  const [showAll18, setShowAll18] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dispatchedRef, setDispatchedRef] = useState<string | null>(null);
  const [isCinePlaying, setIsCinePlaying] = useState(false);
  const cineDirRef = useRef<1 | -1>(1);

  const [qaInput, setQaInput] = useState('');
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);

  const [uploadedImg, setUploadedImg] = useState<HTMLImageElement | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [dicomNote, setDicomNote] = useState<string | null>(null);
  const [uploadedAnalysis, setUploadedAnalysis] = useState<AnalyzedScanOutput | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const modalityMeta = useMemo(
    () => SCAN_MODALITIES.find((m) => m.id === modality) || SCAN_MODALITIES[0],
    [modality]
  );

  const modalityPresets = useMemo(
    () => SCAN_PRESET_STUDIES.filter((s) => s.modality === modality),
    [modality]
  );

  const activePreset = useMemo(
    () =>
      modalityPresets.find((s) => s.id === presetId) ||
      modalityPresets[0] ||
      SCAN_PRESET_STUDIES[0],
    [modalityPresets, presetId]
  );

  // Ping-pong volumetric cine slice playback (simulates real MRI/CT PACS cine video loop)
  useEffect(() => {
    if (!isCinePlaying) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setSliceIdx((prev) => {
        if (prev >= 32) cineDirRef.current = -1;
        else if (prev <= 1) cineDirRef.current = 1;
        return Math.max(1, Math.min(32, prev + cineDirRef.current));
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, [isCinePlaying]);

  const handleModalityChange = (nextMod: ScanModality) => {
    setModality(nextMod);
    const first = SCAN_PRESET_STUDIES.find((s) => s.modality === nextMod);
    if (first) {
      setPresetId(first.id);
      setSliceIdx(first.defaultSlice);
    }
    // Auto-start cine sweep on volumetric MRI/CT modalities for realistic video-type inspection
    setIsCinePlaying(nextMod === 'spine-mri' || nextMod === 'chest-ct' || nextMod === 'oncology-xai');
    setUploadedImg(null);
    setUploadedName(null);
    setDicomNote(null);
    setUploadedAnalysis(null);
    setDispatchedRef(null);
    setQaHistory([]);
  };

  const handlePresetChange = (id: string) => {
    setPresetId(id);
    const found = SCAN_PRESET_STUDIES.find((s) => s.id === id);
    if (found) setSliceIdx(found.defaultSlice);
    setUploadedImg(null);
    setUploadedName(null);
    setDicomNote(null);
    setUploadedAnalysis(null);
    setDispatchedRef(null);
    setQaHistory([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDispatchedRef(null);
    setQaHistory([]);

    const lower = file.name.toLowerCase();
    if (lower.endsWith('.dcm') || lower.endsWith('.dicom') || lower.endsWith('.ima')) {
      const bufReader = new FileReader();
      bufReader.onload = () => {
        if (bufReader.result instanceof ArrayBuffer) {
          const dcm = parseBasicDicomBuffer(bufReader.result);
          setDicomNote(dcm.note);
          const bytes = new Uint8Array(bufReader.result);
          const side = 64;
          const pixels = new Uint8ClampedArray(side * side * 4);
          const start = Math.max(0, bytes.length - side * side);
          for (let i = 0; i < side * side; i++) {
            const v = bytes[start + i] ?? 110;
            pixels[i * 4] = v;
            pixels[i * 4 + 1] = v;
            pixels[i * 4 + 2] = v;
            pixels[i * 4 + 3] = 255;
          }
          setUploadedAnalysis(analyzeScanImageStats(pixels, side, side, modality));
          setUploadedImg(null);
          setUploadedName(file.name);
        }
      };
      bufReader.readAsArrayBuffer(file);
      return;
    }

    setDicomNote('Standard radiograph/scan image loaded locally in browser memory.');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        const targetW = 128;
        const targetH = 128;
        off.width = targetW;
        off.height = targetH;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const data = ctx.getImageData(0, 0, targetW, targetH).data;
          const analysis = analyzeScanImageStats(data, targetW, targetH, modality);
          setUploadedAnalysis(analysis);
        }
        setUploadedImg(img);
        setUploadedName(file.name);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const clearUpload = () => {
    setUploadedImg(null);
    setUploadedName(null);
    setDicomNote(null);
    setUploadedAnalysis(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetWindowControls = () => {
    setWindowBrightness(1.0);
    setWindowContrast(1.1);
    setInvert(false);
    setZoom(1.0);
    setXaiMode('gradcam');
    setXaiOpacity(0.72);
    setIsCinePlaying(false);
    setSliceIdx(activePreset.defaultSlice);
  };

  const activeScanImageSrc = uploadedImg ? uploadedImg.src : PRESET_SCAN_IMAGE_URLS[activePreset.id];

  const scores = uploadedAnalysis ? uploadedAnalysis.scores : activePreset.scores;
  const roiNorm = uploadedAnalysis ? uploadedAnalysis.roiNorm : activePreset.roiNorm;
  const roi3D = uploadedAnalysis ? uploadedAnalysis.roi3D : activePreset.roi3D;
  const findingKey = uploadedAnalysis ? uploadedAnalysis.findingKey : activePreset.findingKey;
  const anatomyVector = uploadedAnalysis ? uploadedAnalysis.anatomyVector : activePreset.anatomyVector;
  const xaiHighlightLabel = uploadedAnalysis
    ? uploadedAnalysis.xaiHighlightLabel
    : activePreset.xaiHighlightLabel;
  const technicalNote = uploadedAnalysis ? uploadedAnalysis.technicalSummary : activePreset.technicalNote;
  const patientNote = uploadedAnalysis ? uploadedAnalysis.patientSummary : activePreset.patientNote;
  const oodError = uploadedAnalysis ? uploadedAnalysis.oodError : activePreset.oodError ?? 0.14;
  const oodWarning = uploadedAnalysis ? uploadedAnalysis.oodWarning : oodError >= 0.45;
  const covidSeverity = uploadedAnalysis ? uploadedAnalysis.covidSeverity : activePreset.covidSeverity;

  const pathologies18 = useMemo(() => {
    if (uploadedAnalysis) return uploadedAnalysis.pathologies18;
    if (activePreset.pathologies18) return classifyPathology18Risks(activePreset.pathologies18);
    return [];
  }, [uploadedAnalysis, activePreset.pathologies18]);

  const chexMatches = useMemo(
    () => retrieveSimilarCases(anatomyVector, modality, 3),
    [anatomyVector, modality]
  );

  const spineSummary = useMemo(
    () => (activePreset.spineDiscs ? computePfirrmannSummary(activePreset.spineDiscs) : null),
    [activePreset.spineDiscs]
  );

  const studyCode = uploadedName
    ? `LOCAL-${uploadedName.slice(0, 10).toUpperCase()}`
    : activePreset.patientCode;

  const structuredReport = useMemo(
    () =>
      buildStructuredRadiologyReport({
        patientCode: studyCode,
        modalityLabel: modalityMeta.label,
        xaiMode,
        topClass: scores[0],
        xaiHighlightLabel,
        technicalNote,
        patientNote,
        birads: uploadedAnalysis ? undefined : activePreset.birads,
        spineDiscs: uploadedAnalysis ? undefined : activePreset.spineDiscs,
        covidSeverity,
      }),
    [
      studyCode,
      modalityMeta.label,
      xaiMode,
      scores,
      xaiHighlightLabel,
      technicalNote,
      patientNote,
      uploadedAnalysis,
      activePreset.birads,
      activePreset.spineDiscs,
      covidSeverity,
    ]
  );

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(
        reportLevel === 'technical' ? structuredReport.technicalReport : structuredReport.patientReport
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleDownloadCsv = () => {
    const csv = buildChesterCsvExport({
      studyId: studyCode,
      modality,
      oodError,
      covidSeverity,
      pathologies18,
      scores,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nirog-scan-${studyCode.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAskQuestion = (questionText: string) => {
    const clean = questionText.trim();
    if (!clean) return;
    const answer = answerScanFollowUpQuestion(clean, {
      modality,
      topFinding: scores[0].label,
      topPct: scores[0].probabilityPct,
      xaiHighlightLabel,
      oodError,
      covidSeverity,
      patientNote,
    });
    setQaHistory((prev) => [...prev, { q: clean, a: answer }]);
    setQaInput('');
  };

  const handleDispatchToQueue = () => {
    const refId = onDispatchRadiologyCase({
      patient: uploadedName ? `Uploaded Study (${uploadedName})` : `${activePreset.patientCode} (Demo)`,
      modality: modalityMeta.shortLabel,
      findingKey,
      aiHighlight: `${xaiHighlightLabel} · ${scores[0].label} (${scores[0].probabilityPct}%)`,
    });
    setDispatchedRef(refId);
  };

  const displayed18 = showAll18 ? pathologies18 : pathologies18.slice(0, 9);

  return (
    <div id="radiology-workbench" className="space-y-6" data-testid="radiology-workstation">
      {/* Privacy-First & Modality Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-700 font-semibold">
              <span>Multi-Modality Scanning Engine</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Lock className="w-3 h-3" /> Local On-Device Processing (Zero Upload)
              </span>
            </div>
            <h2 className="text-xl font-bold text-[#071e26]">{modalityMeta.label}</h2>
            <p className="text-xs text-slate-600">{modalityMeta.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.dcm,.dicom,.ima"
              aria-label="Upload medical scan image or DICOM"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430] transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-300" />
              <span>Upload X-Ray / Scan / DICOM</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-[#071e26] hover:border-cyan-600 bg-white"
            >
              <Download className="w-3.5 h-3.5 text-cyan-700" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDatasets((v) => !v)}
              aria-expanded={showDatasets}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:border-cyan-600 bg-white"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-700" />
              <span>{showDatasets ? 'Hide Datasets' : 'Datasets & Models'}</span>
            </button>
            {(uploadedImg || uploadedName) && (
              <button
                type="button"
                onClick={clearUpload}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-300 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {dicomNote && (
          <div className="rounded-lg bg-cyan-50/70 border border-cyan-200 px-3 py-2 text-xs text-cyan-950 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>{dicomNote}</span>
          </div>
        )}

        {/* Collapsible MLMED / TorchXRayVision Open Dataset Catalog */}
        {showDatasets && (
          <div
            className="rounded-xl border border-slate-200 bg-[#f8fafa] p-4 space-y-3"
            data-testid="cxr-dataset-catalog"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <div className="font-bold text-[#071e26]">
                  Harmonized Research Datasets &amp; Model Architecture (MLMED / TorchXRayVision / Chester)
                </div>
                <div className="text-slate-600">
                  Reference catalog covering {CXR_DATASET_CATALOG.length} public imaging cohorts + DenseNet-121 (`xrv-all-45rot15trans15scale`) &amp; Autoencoder (`ae-chest-savedmodel-64-512`) OOD verification.
                </div>
              </div>
              <span className="font-mono text-[11px] text-cyan-800">712,000+ Public Benchmark Radiographs</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {CXR_DATASET_CATALOG.map((ds) => (
                <div key={ds.id} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                  <div className="font-bold text-[#071e26]">{ds.name}</div>
                  <div className="font-mono text-[10px] text-cyan-800">
                    {ds.imagesCount} · {ds.pathologyCount}
                  </div>
                  <div className="text-[11px] text-slate-600 leading-snug">{ds.notes}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5 Modality Tabs */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Select Imaging Modality">
          {SCAN_MODALITIES.map((m) => {
            const active = m.id === modality;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleModalityChange(m.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  active
                    ? 'bg-cyan-700 border-cyan-700 text-white'
                    : 'bg-[#f8fafa] border-slate-300 text-slate-700 hover:border-cyan-600'
                }`}
              >
                {m.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Study Preset & Active Pipelines Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-slate-500 uppercase">Active Study:</span>
            {modalityPresets.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={!uploadedImg && !uploadedName && activePreset.id === p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1 rounded-md border font-semibold transition-colors ${
                  !uploadedImg && !uploadedName && activePreset.id === p.id
                    ? 'bg-[#03151c] border-[#03151c] text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-600'
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
          <div className="font-mono text-[11px] text-cyan-800">
            Models: {modalityMeta.pipelines.join(' · ')}
          </div>
        </div>
      </div>

      {/* Synchronized Dual Viewports: 3D Volumetric Stage + 2D DICOM/XAI Viewport */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 space-y-2">
          <RadiologyCanvas
            finding={findingKey}
            modality={modality}
            scanImageSrc={activeScanImageSrc}
            xaiMode={xaiMode}
            slicePos={(sliceIdx - 1) / 31}
            isCinePlaying={isCinePlaying}
            roiOffset={roi3D}
            spineDiscs={modality === 'spine-mri' && !uploadedImg ? activePreset.spineDiscs : undefined}
            xaiLabel={xaiHighlightLabel}
          />
          <div className="text-[11px] font-mono text-slate-500 flex items-center justify-between px-1">
            <span>Anatomy: {modalityMeta.anatomy}</span>
            <span>OOD Residual: {oodError.toFixed(2)} ({oodWarning ? 'Out-of-Dist Alert' : 'In-Dist'})</span>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-3">
          <ScanViewport2D
            modality={modality}
            presetImageSrc={PRESET_SCAN_IMAGE_URLS[activePreset.id]}
            xaiMode={xaiMode}
            xaiOpacity={xaiOpacity}
            sliceIdx={sliceIdx}
            isCinePlaying={isCinePlaying}
            windowBrightness={windowBrightness}
            windowContrast={windowContrast}
            invert={invert}
            zoom={zoom}
            roiNorm={roiNorm}
            uploadedImage={uploadedImg}
            uploadedFilename={uploadedName}
          />

          {/* Chester-Inspired Toolbar & Windowing Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#071e26]">
                <Eye className="w-4 h-4 text-cyan-700" />
                <span>Interpretability &amp; OOD Layers</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['gradcam', 'Grad-CAM++'],
                    ['rawgrad', 'Raw Gradients'],
                    ['ood', 'OOD Heatmap'],
                    ['saliency', 'Saliency'],
                    ['lime', 'LIME Grid'],
                    ['off', 'Raw Scan'],
                  ] as [XaiMode, string][]
                ).map(([modeKey, label]) => (
                  <button
                    key={modeKey}
                    type="button"
                    aria-pressed={xaiMode === modeKey}
                    onClick={() => setXaiMode(modeKey)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                      xaiMode === modeKey
                        ? 'bg-cyan-700 border-cyan-700 text-white'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-[11px]">
              <label className="space-y-1 block">
                <span className="flex justify-between gap-1 font-mono text-slate-600">
                  <span>Slice Depth</span>
                  <span className="tabular-nums">{sliceIdx}/32</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={32}
                  step={1}
                  value={sliceIdx}
                  onChange={(e) => setSliceIdx(Number(e.target.value))}
                  className="w-full accent-cyan-700"
                />
              </label>

              <label className="space-y-1 block">
                <span className="flex justify-between gap-1 font-mono text-slate-600">
                  <span>Contrast</span>
                  <span className="tabular-nums">{Math.round(windowContrast * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  value={windowContrast}
                  onChange={(e) => setWindowContrast(Number(e.target.value))}
                  className="w-full accent-cyan-700"
                />
              </label>

              <label className="space-y-1 block">
                <span className="flex justify-between gap-1 font-mono text-slate-600">
                  <span>Zoom</span>
                  <span className="tabular-nums">{zoom.toFixed(1)}×</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={2.2}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-cyan-700"
                />
              </label>

              <label className="space-y-1 block">
                <span className="flex justify-between gap-1 font-mono text-slate-600">
                  <span>XAI Blend</span>
                  <span className="tabular-nums">{Math.round(xaiOpacity * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={xaiOpacity}
                  onChange={(e) => setXaiOpacity(Number(e.target.value))}
                  className="w-full accent-cyan-700"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={isCinePlaying}
                  onClick={() => setIsCinePlaying((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold ${
                    isCinePlaying
                      ? 'bg-cyan-700 border-cyan-700 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-600'
                  }`}
                >
                  {isCinePlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isCinePlaying ? 'Pause Cine Video' : 'Play 3D Cine Video'}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={invert}
                  onClick={() => setInvert((v) => !v)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-semibold ${
                    invert
                      ? 'bg-[#03151c] border-[#03151c] text-white'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>Invert Colors</span>
                </button>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-600">
                  <span>Bright</span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.5}
                    step={0.05}
                    value={windowBrightness}
                    onChange={(e) => setWindowBrightness(Number(e.target.value))}
                    className="w-20 accent-cyan-700"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={resetWindowControls}
                className="text-xs font-semibold text-cyan-700 hover:underline"
              >
                Reset Layers
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Chester 18-Pathology Risk & COVID-Severity + ReadYourLab Plain-Language & CheXtriev */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: TorchXRayVision 18-Pathology Spectrum + COVID-Severity + Modality Cards */}
        <div className="lg:col-span-5 space-y-6">
          {/* OOD Gate Banner if Out of Distribution */}
          {oodWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>OOD Autoencoder Alert (Residual {oodError.toFixed(2)}):</strong> Uploaded image deviates from reference radiographic exposure. Verify modality or re-upload clean frontal/axial slices.
              </div>
            </div>
          )}

          {/* TorchXRayVision 18-Pathology Risk Panel (Chester Style) */}
          {pathologies18.length > 0 && (
            <div
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5"
              data-testid="xrv18-risk-panel"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2 text-[#071e26]">
                    <Activity className="w-4 h-4 text-cyan-700" />
                    <span>Pathology Risk (TorchXRayVision 18)</span>
                  </h3>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    The white center region (45%–55%) indicates that the model is unsure.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAll18((v) => !v)}
                  className="text-xs font-semibold text-cyan-700 hover:underline whitespace-nowrap"
                >
                  {showAll18 ? 'Top 9' : 'Show All 18'}
                </button>
              </div>

              <div className="space-y-2">
                {displayed18.map((p) => {
                  const toneText =
                    p.band === 'elevated'
                      ? 'text-rose-700 font-bold'
                      : p.band === 'uncertain'
                      ? 'text-amber-700 font-semibold'
                      : 'text-slate-600';
                  const dotColor =
                    p.band === 'elevated'
                      ? 'bg-rose-600 border-rose-800'
                      : p.band === 'uncertain'
                      ? 'bg-slate-400 border-slate-700'
                      : 'bg-emerald-600 border-emerald-800';
                  return (
                    <div key={p.name} className="grid grid-cols-12 items-center gap-2 text-xs">
                      <span className="col-span-5 truncate font-medium text-[#071e26]" title={p.name}>
                        {p.name}
                      </span>
                      <div className="col-span-5 relative h-3 rounded-full border border-slate-200 overflow-hidden bg-gradient-to-r from-emerald-100 via-white to-rose-100">
                        {/* White uncertainty center marker 45%-55% */}
                        <div className="absolute inset-y-0 left-[45%] w-[10%] bg-white border-x border-slate-300/80" />
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border ${dotColor}`}
                          style={{ left: `${p.riskPct}%` }}
                        />
                      </div>
                      <span className={`col-span-2 text-right font-mono tabular-nums text-[11px] ${toneText}`}>
                        {p.riskPct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MLMED COVID-Severity Panel (Geographic Extent 0-8 + Opacity 0-6) */}
          {covidSeverity && (modality === 'chest-cxr' || modality === 'chest-ct') && (
            <div
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              data-testid="covid-severity-panel"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#071e26]">
                    COVID-Severity Radiographic Scoring (MLMED)
                  </h3>
                  <p className="text-[11px] text-slate-600">
                    Quantitative lung involvement across 6 anatomical zones.
                  </p>
                </div>
                <span className="text-[11px] font-mono font-semibold text-cyan-800">
                  {covidSeverity.tier}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 bg-[#f8fafa] p-3">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Geographic Extent</div>
                  <div className="text-xl font-bold font-mono text-[#071e26] tabular-nums mt-0.5">
                    {covidSeverity.geographicExtent}{' '}
                    <span className="text-xs font-normal text-slate-500">/ 8.0</span>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-[#f8fafa] p-3">
                  <div className="text-[10px] font-mono uppercase text-slate-500">Opacity Score</div>
                  <div className="text-xl font-bold font-mono text-[#071e26] tabular-nums mt-0.5">
                    {covidSeverity.opacityScore}{' '}
                    <span className="text-xs font-normal text-slate-500">/ 6.0</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px]">
                {covidSeverity.zones.map((z) => (
                  <div key={z.zone} className="rounded border border-slate-200 px-2.5 py-1.5 bg-white">
                    <div className="font-semibold text-[#071e26]">{z.zone}</div>
                    <div className="font-mono text-slate-500 tabular-nums">
                      Ext {z.extent} · Op {z.opacity}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-Pipeline Summary Bars (when non-CXR or Spine/Mammo specialty tables) */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold flex items-center gap-2 text-[#071e26]">
                <Layers className="w-4 h-4 text-cyan-700" />
                <span>Multi-Pipeline Inference Signals</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">Assistive Only</span>
            </div>

            <div className="space-y-3">
              {scores.map((sc) => {
                const barColor =
                  sc.severity === 'alert'
                    ? 'bg-rose-600'
                    : sc.severity === 'monitor'
                    ? 'bg-amber-500'
                    : 'bg-emerald-600';
                return (
                  <div key={sc.label} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#071e26]">{sc.label}</span>
                      <span className="font-mono font-bold tabular-nums text-[#071e26]">
                        {sc.probabilityPct}%{' '}
                        <span className="text-[10px] font-normal text-slate-500">({sc.pipeline})</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${sc.probabilityPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {modality === 'spine-mri' && activePreset.spineDiscs && !uploadedImg && spineSummary && (
              <div className="pt-3 border-t border-slate-200 space-y-2.5" data-testid="spinescan-pfirrmann-table">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#071e26]">SpineScan Pfirrmann Grading (I–V)</span>
                  <span className="font-mono text-rose-700 font-semibold">
                    Max Grade {spineSummary.worstGrade} ({spineSummary.worstLevels.join(', ')})
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 font-mono text-[10px] uppercase text-slate-500">
                        <th className="py-1.5 pr-2">Level</th>
                        <th className="py-1.5 pr-2">Grade</th>
                        <th className="py-1.5 pr-2 text-right">Hydration</th>
                        <th className="py-1.5">Morphology</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activePreset.spineDiscs.map((d) => (
                        <tr key={d.level}>
                          <td className="py-1.5 pr-2 font-mono font-bold">{d.level}</td>
                          <td
                            className={`py-1.5 pr-2 font-mono font-bold ${
                              d.pfirrmannGrade >= 4
                                ? 'text-rose-700'
                                : d.pfirrmannGrade === 3
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            Grade {d.pfirrmannGrade}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{d.hydrationPct}%</td>
                          <td className="py-1.5 text-slate-600">{d.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {modality === 'mammogram' && activePreset.birads && !uploadedImg && (
              <div
                className="pt-3 border-t border-slate-200 rounded-lg bg-slate-50 p-3 space-y-1.5 text-xs"
                data-testid="mammogram-birads-panel"
              >
                <div className="font-bold text-[#071e26]">Mammography CAD Assessment</div>
                <div>
                  <strong>Category:</strong> {activePreset.birads.category}
                </div>
                <div>
                  <strong>Breast Density:</strong> {activePreset.birads.density}
                </div>
                <div>
                  <strong>Findings:</strong> {activePreset.birads.margin}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: ReadYourLab Plain-Language Breakdown + CheXtriev + Structured Report */}
        <div className="lg:col-span-7 space-y-6">
          {/* ReadYourLab-Inspired Plain-Language Explainer & Interactive Follow-Up Q&A */}
          <div
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            data-testid="readyourlab-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2 text-[#071e26]">
                  <Sparkles className="w-4 h-4 text-cyan-700" />
                  <span>Plain-Language Radiology Breakdown &amp; Follow-Up Explorer</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Translates technical imaging observations into clear patient language &amp; doctor discussion prompts.
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  aria-pressed={reportLevel === 'patient'}
                  onClick={() => setReportLevel('patient')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    reportLevel === 'patient' ? 'bg-cyan-700 text-white' : 'text-slate-700'
                  }`}
                >
                  Plain Language
                </button>
                <button
                  type="button"
                  aria-pressed={reportLevel === 'technical'}
                  onClick={() => setReportLevel('technical')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    reportLevel === 'technical' ? 'bg-cyan-700 text-white' : 'text-slate-700'
                  }`}
                >
                  Clinician Technical
                </button>
              </div>
            </div>

            {reportLevel === 'patient' ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-cyan-50/70 border border-cyan-200 p-4 text-sm text-[#071e26] leading-relaxed">
                  <div className="text-xs font-mono uppercase text-cyan-800 font-semibold mb-1">
                    What We Observed ({structuredReport.impressionLine})
                  </div>
                  <p>{structuredReport.patientReport}</p>
                </div>

                {!uploadedAnalysis && activePreset.doctorQuestions.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-[#f8fafa] p-3.5 space-y-1.5 text-xs">
                    <div className="font-bold text-[#071e26]">Questions to Bring to Your Doctor:</div>
                    <ul className="list-disc pl-4 space-y-1 text-slate-700">
                      {activePreset.doctorQuestions.map((dq) => (
                        <li key={dq}>{dq}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap rounded-lg bg-[#03151c] text-cyan-100 p-4 text-xs font-mono leading-relaxed border border-cyan-500/20">
                {structuredReport.technicalReport}
              </pre>
            )}

            {/* Quick Follow-Up Clarifier */}
            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-mono text-slate-500 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5 text-cyan-700" /> Clarify:
                </span>
                {[
                  'What does the white uncertain region mean?',
                  'What is my severity extent score?',
                  'Explain terms like consolidation or Pfirrmann',
                  'Is my scan sent to a server?',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleAskQuestion(prompt)}
                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-white text-slate-700 hover:border-cyan-600 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {qaHistory.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                  {qaHistory.map((item, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="font-semibold text-cyan-900">Q: {item.q}</div>
                      <div className="text-slate-700 leading-relaxed">{item.a}</div>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskQuestion(qaInput);
                }}
                className="flex gap-2"
              >
                <label htmlFor="scan-followup-input" className="sr-only">
                  Ask a follow-up question about this scan
                </label>
                <input
                  id="scan-followup-input"
                  type="text"
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  placeholder="Ask about a radiology term, OOD check, severity score, or uncertainty band..."
                  className="flex-1 h-9 px-3 rounded-lg border border-slate-300 text-xs"
                />
                <button
                  type="submit"
                  className="px-3.5 h-9 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430]"
                >
                  Explain
                </button>
              </form>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDispatchToQueue}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-xs font-semibold transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send to Provider Radiology Queue</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Report'}</span>
                </button>
              </div>
              {dispatchedRef && (
                <span className="text-xs font-mono font-semibold text-emerald-700">
                  Queued as {dispatchedRef} for Radiologist Sign-off
                </span>
              )}
            </div>
          </div>

          {/* CheXtriev Anatomy-Centered Similar Cases */}
          <div
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            data-testid="chextriev-retrieval-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2 text-[#071e26]">
                  <Database className="w-4 h-4 text-cyan-700" />
                  <span>CheXtriev Anatomy-Centered Case Retrieval</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Graph-node similarity search across benchmark cohorts (COVIDx, HaMLET, LIDC, SpineScan, CBIS-DDSM).
                </p>
              </div>
              <span className="text-[11px] font-mono text-cyan-800">Top 3 Matches</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {chexMatches.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-slate-200 bg-[#f8fafa] p-3 flex flex-col justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1 font-mono text-[11px]">
                      <span className="font-bold text-[#071e26]">{m.caseCode}</span>
                      <span className="font-bold text-emerald-700 tabular-nums">{m.similarityPct}%</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">{m.cohort}</div>
                    <div className="font-semibold text-[#071e26] leading-snug pt-0.5">
                      {m.confirmedDiagnosis}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 border-t border-slate-200 pt-1.5">
                    {m.outcomeNote}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
