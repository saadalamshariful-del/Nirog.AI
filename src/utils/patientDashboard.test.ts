import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAdherenceProjectionSeries,
  buildPatientAdherenceSeries,
  buildPatientVitalsCsv,
  buildVitalProjectionSeries,
  classifyVitalStatus,
  computeRollingSmaSeries,
  computeSimpleMovingAverage,
  computeWeeklyAdherencePct,
  filterPatientAppointments,
  filterPrescriptions,
  sliceVitalReadingsByHorizon,
  validateAndCreateVitalReading,
} from './logic';
import {
  INITIAL_APPOINTMENTS,
  INITIAL_PATIENT_PRESCRIPTIONS,
  INITIAL_PATIENT_VITALS,
} from '../data/seed';

test('computeWeeklyAdherencePct and buildPatientAdherenceSeries respond live to diaryDays toggles', () => {
  const pct3 = computeWeeklyAdherencePct(true, { 0: true, 1: true, 2: true });
  assert.equal(pct3, 43);

  const pct6 = computeWeeklyAdherencePct(true, {
    0: true,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });
  assert.equal(pct6, 86);

  assert.equal(computeWeeklyAdherencePct(false, { 0: true, 1: true }), 0);

  const series7d = buildPatientAdherenceSeries(true, { 0: true, 1: false, 2: true }, '7D');
  assert.equal(series7d.length, 7);
  assert.equal(series7d[0].adherencePct, 100);
  assert.equal(series7d[1].adherencePct, 0);

  const series30d = buildPatientAdherenceSeries(true, { 0: true, 1: true, 2: true }, '30D');
  assert.equal(series30d.length, 4);
  assert.equal(series30d[3].adherencePct, 43);

  const series90d = buildPatientAdherenceSeries(true, { 0: true, 1: true, 2: true }, '90D');
  assert.equal(series90d.length, 7);
});

test('sliceVitalReadingsByHorizon slices 7D, 30D, and 90D consistently', () => {
  assert.equal(sliceVitalReadingsByHorizon(INITIAL_PATIENT_VITALS, '7D').length, 4);
  assert.equal(sliceVitalReadingsByHorizon(INITIAL_PATIENT_VITALS, '30D').length, 7);
  assert.equal(sliceVitalReadingsByHorizon(INITIAL_PATIENT_VITALS, '90D').length, INITIAL_PATIENT_VITALS.length);
});

test('validateAndCreateVitalReading validates clinical bounds and computes BMI', () => {
  const prev = INITIAL_PATIENT_VITALS[INITIAL_PATIENT_VITALS.length - 1];
  const badGlucose = validateAndCreateVitalReading({
    fastingGlucose: 20,
    postMealGlucose: 140,
    systolic: 120,
    diastolic: 80,
    heartRate: 72,
    weightKg: 72,
  });
  assert.equal(badGlucose.ok, false);

  const badBp = validateAndCreateVitalReading({
    fastingGlucose: 110,
    postMealGlucose: 140,
    systolic: 100,
    diastolic: 110,
    heartRate: 72,
    weightKg: 72,
  });
  assert.equal(badBp.ok, false);

  const valid = validateAndCreateVitalReading(
    {
      fastingGlucose: 104,
      postMealGlucose: 138,
      systolic: 118,
      diastolic: 74,
      heartRate: 70,
      weightKg: 72.5,
    },
    prev
  );
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.reading.bmi, 25.1);
    assert.equal(valid.reading.fastingGlucoseMgDl, 104);
    assert.equal(classifyVitalStatus(valid.reading).label, 'On Target');
  }
});

test('classifyVitalStatus and filter helpers handle Watch, Elevated, prescriptions, and appointments', () => {
  const latest = INITIAL_PATIENT_VITALS[INITIAL_PATIENT_VITALS.length - 1];
  assert.equal(classifyVitalStatus(latest).label, 'On Target');
  assert.equal(
    classifyVitalStatus({ ...latest, fastingGlucoseMgDl: 132 }).label,
    'Watch'
  );
  assert.equal(
    classifyVitalStatus({ ...latest, systolicMmHg: 148 }).label,
    'Elevated'
  );

  assert.equal(filterPrescriptions(INITIAL_PATIENT_PRESCRIPTIONS, 'Refill Due').length, 1);
  assert.equal(filterPrescriptions(INITIAL_PATIENT_PRESCRIPTIONS, 'Cold-Chain').length, 1);
  assert.equal(filterPatientAppointments(INITIAL_APPOINTMENTS, 'Waiting').length, 1);

  const csv = buildPatientVitalsCsv(INITIAL_PATIENT_VITALS);
  assert.ok(csv.includes('Date,FastingGlucoseMgDl,PostMealGlucoseMgDl'));
  assert.equal(csv.split('\n').length, INITIAL_PATIENT_VITALS.length + 1);
});

test('computeSimpleMovingAverage and 7-day SMA trend projection populate full trend line and forecasts', () => {
  assert.equal(
    computeSimpleMovingAverage([121, 118, 116, 114, 112, 110, 108], 7),
    (121 + 118 + 116 + 114 + 112 + 110 + 108) / 7
  );

  const rolling = computeRollingSmaSeries([140, 130, 120, 110, 100, 90, 80], 7, 0);
  assert.deepEqual(rolling, [140, 135, 130, 125, 120, 115, 110]);

  const projected = buildVitalProjectionSeries(INITIAL_PATIENT_VITALS, '30D', 7, 3);
  // 7 historical readings for 30D + 3 forward projection intervals
  assert.equal(projected.length, 10);
  // Historical points carry both raw readings AND the 7-day SMA trend value
  assert.equal(projected[0].isProjected, false);
  assert.ok(typeof projected[0].projFastingGlucoseMgDl === 'number');
  assert.ok(projected[6].projFastingGlucoseMgDl! > projected[6].fastingGlucoseMgDl!);
  // Final historical 7D SMA matches the trailing 7 readings average (114)
  assert.equal(projected[6].projFastingGlucoseMgDl, 114);
  // Forward forecast steps extend smoothly downward
  assert.equal(projected[7].isProjected, true);
  assert.equal(projected[7].dateLabel, '+5d Est');
  assert.ok(projected[7].projFastingGlucoseMgDl! <= projected[6].projFastingGlucoseMgDl!);

  const adh = buildPatientAdherenceSeries(true, { 0: true, 1: true, 2: true, 3: true }, '7D');
  const adhProj = buildAdherenceProjectionSeries(adh, 7, 2);
  assert.equal(adhProj.length, adh.length + 2);
  assert.ok(typeof adhProj[0].projAdherencePct === 'number');
  assert.equal(adhProj[adh.length].isProjected, true);
});
