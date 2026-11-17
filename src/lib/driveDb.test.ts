import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDatabaseSnapshot,
  DEFAULT_DB_FILENAME,
  DEFAULT_DRIVE_FOLDER_NAME,
  parseDatabaseFileJson,
} from './driveDb';
import {
  INITIAL_APPOINTMENTS,
  INITIAL_CASES,
  INITIAL_ENQUIRIES,
  INITIAL_INSURANCE_CLAIMS,
  INITIAL_ORDERS,
  INITIAL_PHARMA_AUDITS,
  INITIAL_PV_REPORTS,
  INITIAL_RAD_CASES,
  INITIAL_RECALLS,
  INITIAL_RFQS,
  INITIAL_TRADE_ORDERS,
} from '../data/seed';

test('buildDatabaseSnapshot packages collections and computes accurate recordCount', () => {
  const snapshot = buildDatabaseSnapshot(
    {
      orders: INITIAL_ORDERS,
      cases: INITIAL_CASES,
      appointments: INITIAL_APPOINTMENTS,
      radQueue: INITIAL_RAD_CASES,
      audits: INITIAL_PHARMA_AUDITS,
      recalls: INITIAL_RECALLS,
      pvReports: INITIAL_PV_REPORTS,
      rfqs: INITIAL_RFQS,
      tradeOrders: INITIAL_TRADE_ORDERS,
      claims: INITIAL_INSURANCE_CLAIMS,
      enquiries: INITIAL_ENQUIRIES,
      auditLog: [{ t: 1700000000000, role: 'System', action: 'Test', ref: 'TST' }],
      diaryOn: true,
      diaryDays: { 0: true, 1: false, 2: true },
    },
    'researcher@nirog.example'
  );

  assert.equal(snapshot.appName, 'NIROG.AI');
  assert.equal(snapshot.schemaVersion, '1.0');
  assert.equal(snapshot.ownerEmail, 'researcher@nirog.example');
  assert.equal(DEFAULT_DRIVE_FOLDER_NAME, 'NIROG.AI Database');
  assert.equal(DEFAULT_DB_FILENAME, 'nirog-ai-database.json');

  const expectedCount =
    INITIAL_ORDERS.length +
    INITIAL_CASES.length +
    INITIAL_APPOINTMENTS.length +
    INITIAL_RAD_CASES.length +
    INITIAL_PHARMA_AUDITS.length +
    INITIAL_RECALLS.length +
    INITIAL_PV_REPORTS.length +
    INITIAL_RFQS.length +
    INITIAL_TRADE_ORDERS.length +
    INITIAL_INSURANCE_CLAIMS.length +
    INITIAL_ENQUIRIES.length;
  assert.equal(snapshot.recordCount, expectedCount);

  const roundTripped = parseDatabaseFileJson(JSON.stringify(snapshot));
  assert.equal(roundTripped.recordCount, expectedCount);
  assert.equal(roundTripped.collections.orders.length, INITIAL_ORDERS.length);
  assert.equal(roundTripped.collections.diaryDays[0], true);
});

test('parseDatabaseFileJson rejects malformed or non-NIROG payloads cleanly', () => {
  assert.throws(() => parseDatabaseFileJson('not-json'), /SyntaxError|JSON/);
  assert.throws(
    () => parseDatabaseFileJson(JSON.stringify({ appName: 'OTHER', collections: {} })),
    /Invalid NIROG\.AI database JSON structure/
  );
  assert.throws(
    () => parseDatabaseFileJson(JSON.stringify({ appName: 'NIROG.AI', collections: { orders: [] } })),
    /missing core collections/
  );
});
