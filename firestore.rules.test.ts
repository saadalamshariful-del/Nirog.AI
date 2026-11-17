import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(new URL('./firebase-blueprint.json', import.meta.url), 'utf8'));

test('firestore.rules enforces default-deny, email_verified, Master Gate, and blueprint parity', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes('workspaceExists(userId)'));

  const paths = Object.keys(blueprint.firestore);
  assert.ok(paths.includes('/workspaces/{userId}'));
  assert.ok(paths.includes('/workspaces/{userId}/private/profile'));
  assert.ok(paths.includes('/workspaces/{userId}/orders/{orderId}'));
  assert.ok(paths.includes('/workspaces/{userId}/supportCases/{caseId}'));
  assert.ok(paths.includes('/workspaces/{userId}/appointments/{appointmentId}'));
  assert.ok(paths.includes('/workspaces/{userId}/pvReports/{reportId}'));
  assert.ok(paths.includes('/workspaces/{userId}/driveBackups/{backupId}'));
  assert.ok(paths.includes('/workspaces/{userId}/sourcingRequests/{requestId}'));
});

test('Dirty Dozen security assertions block ghost fields, UID spoofing, and terminal updates', () => {
  assert.ok(rulesText.includes('data.keys().hasAll'));
  assert.ok(rulesText.includes('data.keys().hasOnly'));
  assert.ok(rulesText.includes("existing().status != 'delivered'"));
  assert.ok(rulesText.includes("!(existing().status in ['approved', 'withdrawn'])"));
  assert.ok(rulesText.includes("existing().status != 'Completed'"));
  assert.ok(rulesText.includes("existing().status != 'Approved / In Transit'"));
  assert.ok(rulesText.includes('incoming().uid == existing().uid'));
  assert.ok(rulesText.includes('incoming().createdAt == existing().createdAt'));
  assert.ok(rulesText.includes('incoming().updatedAt == request.time'));
});
