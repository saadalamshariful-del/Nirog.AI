import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeScanImageStats,
  answerScanFollowUpQuestion,
  buildChesterCsvExport,
  buildStructuredRadiologyReport,
  classifyPathology18Risks,
  computeCovidSeverityScores,
  computeOodAutoencoderScore,
  computePfirrmannSummary,
  parseBasicDicomBuffer,
  retrieveSimilarCases,
  SCAN_PRESET_STUDIES,
} from './radiologyEngine';

test('analyzeScanImageStats detects left/right asymmetry, 18 pathologies, OOD, and ROI', () => {
  const width = 64;
  const height = 64;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x / width - 0.3;
      const dy = y / height - 0.35;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const val = dist < 0.14 ? 235 : 40;
      pixels[idx] = val;
      pixels[idx + 1] = val;
      pixels[idx + 2] = val;
      pixels[idx + 3] = 255;
    }
  }

  const res = analyzeScanImageStats(pixels, width, height, 'chest-cxr');
  assert.ok(res.leftRightAsymmetry > 0.1, 'Expected measurable left/right asymmetry');
  assert.ok(res.roiNorm.x < 0.5, `Expected ROI on left half (<0.5), got ${res.roiNorm.x}`);
  assert.ok(res.roiNorm.y < 0.5, `Expected ROI in upper half (<0.5), got ${res.roiNorm.y}`);
  assert.equal(res.pathologies18.length, 18);
  assert.ok(res.covidSeverity.geographicExtent >= 0.5 && res.covidSeverity.geographicExtent <= 8);
  assert.ok(res.covidSeverity.opacityScore >= 0.4 && res.covidSeverity.opacityScore <= 6);
  assert.ok(res.oodError >= 0.08 && res.oodError <= 0.95);
});

test('classifyPathology18Risks marks <45 low, 45-55 uncertain white zone, >55 elevated', () => {
  const list = classifyPathology18Risks({
    'Lung Opacity': 82,
    Effusion: 50,
    Hernia: 12,
  });
  assert.equal(list.length, 18);
  assert.equal(list.find((p) => p.name === 'Lung Opacity')?.band, 'elevated');
  assert.equal(list.find((p) => p.name === 'Effusion')?.band, 'uncertain');
  assert.equal(list.find((p) => p.name === 'Hernia')?.band, 'low');
});

test('computeCovidSeverityScores and computeOodAutoencoderScore stay within clinical bounds', () => {
  const sev = computeCovidSeverityScores(0.6, 0.5, 0.35, 0.65);
  assert.equal(sev.zones.length, 6);
  assert.ok(sev.geographicExtent > 0 && sev.geographicExtent <= 8);
  assert.ok(sev.opacityScore > 0 && sev.opacityScore <= 6);

  const inDist = computeOodAutoencoderScore(0.44, 0.34);
  assert.equal(inDist.oodWarning, false);

  const ood = computeOodAutoencoderScore(0.98, 0.95);
  assert.equal(ood.oodWarning, true);
});

test('parseBasicDicomBuffer recognizes DICM magic header at offset 128', () => {
  const buf = new ArrayBuffer(200);
  const bytes = new Uint8Array(buf);
  bytes[128] = 'D'.charCodeAt(0);
  bytes[129] = 'I'.charCodeAt(0);
  bytes[130] = 'C'.charCodeAt(0);
  bytes[131] = 'M'.charCodeAt(0);

  const parsed = parseBasicDicomBuffer(buf);
  assert.equal(parsed.isDicom, true);

  const nonDicom = parseBasicDicomBuffer(new ArrayBuffer(64));
  assert.equal(nonDicom.isDicom, false);
});

test('buildChesterCsvExport and answerScanFollowUpQuestion return expected structured output', () => {
  const cxr = SCAN_PRESET_STUDIES[0];
  const p18 = classifyPathology18Risks(cxr.pathologies18 || {});
  const csv = buildChesterCsvExport({
    studyId: cxr.patientCode,
    modality: cxr.modality,
    oodError: cxr.oodError || 0.14,
    covidSeverity: cxr.covidSeverity,
    pathologies18: p18,
    scores: cxr.scores,
  });

  assert.match(csv, /Study_ID,"PAT-THOR-408",chest-cxr/);
  assert.match(csv, /COVID_Geographic_Extent_0_to_8,4.5/);
  assert.match(csv, /"XRV18_Lung Opacity",86%,elevated/);

  const ans = answerScanFollowUpQuestion('What does the white uncertain region mean?', {
    modality: 'chest-cxr',
    topFinding: cxr.scores[0].label,
    topPct: cxr.scores[0].probabilityPct,
    xaiHighlightLabel: cxr.xaiHighlightLabel,
    oodError: 0.14,
    covidSeverity: cxr.covidSeverity,
    patientNote: cxr.patientNote,
  });
  assert.match(ans, /45%–55% white center band/);
});

test('retrieveSimilarCases, computePfirrmannSummary, and buildStructuredRadiologyReport remain accurate', () => {
  const spinePreset = SCAN_PRESET_STUDIES.find((s) => s.modality === 'spine-mri')!;
  const matches = retrieveSimilarCases(spinePreset.anatomyVector, 'spine-mri', 3);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].modality, 'spine-mri');
  assert.ok(matches[0].similarityPct >= matches[1].similarityPct);

  const summary = computePfirrmannSummary(spinePreset.spineDiscs!);
  assert.equal(summary.worstGrade, 4);
  assert.deepEqual(summary.worstLevels, ['L4-L5', 'L5-S1']);

  const mammo = SCAN_PRESET_STUDIES.find((s) => s.modality === 'mammogram')!;
  const rep = buildStructuredRadiologyReport({
    patientCode: mammo.patientCode,
    modalityLabel: 'Mammography CAD',
    xaiMode: 'gradcam',
    topClass: mammo.scores[0],
    xaiHighlightLabel: mammo.xaiHighlightLabel,
    technicalNote: mammo.technicalNote,
    patientNote: mammo.patientNote,
    birads: mammo.birads,
  });
  assert.match(rep.impressionLine, /BI-RADS 4B/);
  assert.match(rep.technicalReport, /Local client-side analysis only/);
});
