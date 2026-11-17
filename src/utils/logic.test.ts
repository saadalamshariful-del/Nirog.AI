import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticatePartnerCompany,
  buildMarketTrendCsv,
  buildMarketTrendSeries,
  calculateCartTotals,
  filterGenericLaunches,
  filterHospitalSourcingCatalog,
  filterPortfolioRecalls,
  hasProviderPermission,
  lookupDrugInteraction,
  maskEmrForRole,
  REGULATORY_AUTHORITIES,
  scoreInsuranceClaim,
  searchProducts,
  summarizeHospitalSourcingRequests,
  summarizeLaunchMonitorOpportunities,
  summarizeTradeOrders,
  validateHospitalSourcingInput,
  validateTradeLineQty,
  verifySerialCode,
} from './logic';
import {
  GLOBAL_GENERIC_RELEASES,
  HOSPITAL_SOURCING_CATALOG,
  INITIAL_HOSPITAL_SOURCING_REQUESTS,
  INITIAL_INSURANCE_CLAIMS,
  INITIAL_RECALLS,
  INITIAL_TRADE_ORDERS,
  PHARMA_MARKET_METRICS,
  PRODUCTS,
} from '../data/seed';

test('searchProducts matches typo queries and therapeutic synonyms', () => {
  const typoMatch = searchProducts(PRODUCTS, 'atovastatin');
  assert.equal(typoMatch[0]?.id, 'ato20');

  const synonymMatch = searchProducts(PRODUCTS, 'sugar');
  assert.ok(synonymMatch.some((p) => p.area === 'Diabetes'));
});

test('calculateCartTotals applies CARE5 discount only to OTC items and blocks cold chain outside Dhaka', () => {
  const res = calculateCartTotals(
    [
      { id: 'osi80', qty: 1 }, // Rx 14,500
      { id: 'par500', qty: 2 }, // OTC 2 * 120 = 240
      { id: 'gla100', qty: 1 }, // Rx Cold 3,900
    ],
    PRODUCTS,
    { promoActive: true, deliveryMode: 'delivery', zoneId: 'city' }
  );

  assert.equal(res.sub, 14500 + 240 + 3900);
  assert.equal(res.otcSub, 240);
  assert.equal(res.disc, 12); // 5% of 240 only, never Rx
  assert.equal(res.fee, 100);
  assert.equal(res.total, 14500 + 240 + 3900 - 12 + 100);
  assert.equal(res.hasRx, true);
  assert.equal(res.hasCold, true);
  assert.equal(res.coldBlockedInZone, true);
});

test('lookupDrugInteraction is symmetric and flags statin + macrolide notice', () => {
  const a = lookupDrugInteraction('ato20', 'azi500');
  const b = lookupDrugInteraction('azi500', 'ato20');
  assert.equal(a.level, 'warn');
  assert.equal(a.title, b.title);
});

test('verifySerialCode detects valid serials and flags repeat scans', () => {
  const counts: Record<string, number> = {};
  const first = verifySerialCode('nrg-7k2m-94qx', counts, PRODUCTS);
  assert.equal(first.valid, true);
  assert.equal(first.scans, 1);
  counts[first.code] = first.scans;

  const second = verifySerialCode('NRG-7K2M-94QX', counts, PRODUCTS);
  assert.equal(second.valid, true);
  assert.equal(second.scans, 2);
  assert.match(second.message, /scanned 2 times/);
});

test('validateTradeLineQty enforces MOQ and pack multiples', () => {
  const ato = PRODUCTS.find((p) => p.id === 'ato20')!;
  assert.equal(validateTradeLineQty(ato, 400).ok, false);
  assert.equal(validateTradeLineQty(ato, 550).ok, false);
  assert.equal(validateTradeLineQty(ato, 600).ok, true);
});

test('scoreInsuranceClaim assigns High risk to claims with multiple anomaly flags', () => {
  const highClaim = INITIAL_INSURANCE_CLAIMS.find((c) => c.duplicateCodeFlag)!;
  const scored = scoreInsuranceClaim(highClaim);
  assert.equal(scored.tier, 'High');
  assert.ok(scored.riskScore >= 60);
});

test('Provider RBAC enforces strict clinical, scheduling, AI, and ERP boundaries', () => {
  assert.equal(hasProviderPermission('Doctor', 'signConsultAndRx'), true);
  assert.equal(hasProviderPermission('Doctor', 'signRadiologyAi'), true);
  assert.equal(hasProviderPermission('Doctor', 'manageHospitalErp'), false);

  assert.equal(hasProviderPermission('Nurse', 'recordVitals'), true);
  assert.equal(hasProviderPermission('Nurse', 'accessAiTools'), true);
  assert.equal(hasProviderPermission('Nurse', 'signConsultAndRx'), false);
  assert.equal(hasProviderPermission('Nurse', 'signRadiologyAi'), false);

  assert.equal(hasProviderPermission('Receptionist', 'manageScheduling'), true);
  assert.equal(hasProviderPermission('Receptionist', 'viewClinicalEmr'), false);
  assert.equal(hasProviderPermission('Receptionist', 'accessAiTools'), false);

  assert.equal(hasProviderPermission('Administrator', 'manageHospitalErp'), true);
  assert.equal(hasProviderPermission('Administrator', 'viewComplianceAudit'), true);
  assert.equal(hasProviderPermission('Administrator', 'viewClinicalEmr'), false);

  assert.equal(maskEmrForRole('Doctor', 'HbA1c 7.4%').visible, true);
  assert.equal(maskEmrForRole('Receptionist', 'HbA1c 7.4%').visible, false);
  assert.match(maskEmrForRole('Receptionist', 'HbA1c 7.4%').text, /PHI Redacted/);
});

test('Pharma dashboard summarizes B2B trade orders and filters recalls by portfolio area', () => {
  const summary = summarizeTradeOrders(INITIAL_TRADE_ORDERS);
  assert.equal(summary.totalOrders, INITIAL_TRADE_ORDERS.length);
  assert.ok(summary.totalUsd > 10000);
  assert.equal(summary.inTransitCount, 2);

  const oncRecalls = filterPortfolioRecalls(INITIAL_RECALLS, 'Oncology');
  assert.equal(oncRecalls.length, 1);
  assert.equal(oncRecalls[0].ref, 'RCL-SAMPLE2');
});

test('buildMarketTrendSeries returns deterministic Recharts trend points per horizon and filter', () => {
  const full12 = buildMarketTrendSeries(PHARMA_MARKET_METRICS, 'All', 'All', '12M');
  assert.equal(full12.length, 12);
  assert.ok(full12[11].marketDemandIndex > full12[0].marketDemandIndex);

  const onc6 = buildMarketTrendSeries(PHARMA_MARKET_METRICS, 'Oncology', 'All', '6M');
  assert.equal(onc6.length, 6);
  assert.ok(onc6[5].productGrowthPct > 15);

  const dia3 = buildMarketTrendSeries(PHARMA_MARKET_METRICS, 'Diabetes', 'Bangladesh', '3M');
  assert.equal(dia3.length, 3);
  const csv = buildMarketTrendCsv(dia3, 'Diabetes', 'Bangladesh');
  assert.ok(csv.includes('Portfolio,Region,Month,MarketDemandIndex'));
  assert.equal(csv.split('\n').length, 4);

  const empty = buildMarketTrendSeries(PHARMA_MARKET_METRICS, 'Oncology', 'Bangladesh', '12M');
  assert.equal(empty.length, 0);
});

test('filterGenericLaunches finds Tagrix/Beacon and Orforglipron and supports 8 regulatory agencies and mAbs/NIBs/Peptides', () => {
  const tagrix = filterGenericLaunches(GLOBAL_GENERIC_RELEASES, 'tagrix', 'All', 'All');
  assert.equal(tagrix.length, 1);
  assert.match(tagrix[0].firstMoverCompany, /Beacon/);

  const orfor = filterGenericLaunches(GLOBAL_GENERIC_RELEASES, 'orforglipron', 'Diabetes', 'All');
  assert.equal(orfor.length, 1);
  assert.equal(orfor[0].originCountry, 'Bangladesh');

  const mabs = filterGenericLaunches(GLOBAL_GENERIC_RELEASES, '', 'All', 'All', 'mAb (Biologic)');
  assert.ok(mabs.length >= 3);

  const nmpa = filterGenericLaunches(GLOBAL_GENERIC_RELEASES, '', 'All', 'All', 'All', 'NMPA (China)');
  assert.ok(nmpa.length >= 6);

  const swiss = filterGenericLaunches(GLOBAL_GENERIC_RELEASES, '', 'All', 'All', 'All', 'Swissmedic');
  assert.ok(swiss.length >= 5);

  const summary = summarizeLaunchMonitorOpportunities(GLOBAL_GENERIC_RELEASES);
  assert.equal(summary.agencyCounts.length, REGULATORY_AUTHORITIES.length);
  assert.ok(summary.agencyCounts.every((a) => a.count > 0));
  assert.ok(summary.totalDemandUsdM > 5000);
  assert.ok(summary.recommendedCount >= 5);

  assert.equal(authenticatePartnerCompany('bad-email', '123456').ok, false);
  assert.equal(authenticatePartnerCompany('partner@beacon.example', '123').ok, false);
  const auth = authenticatePartnerCompany('partner@beacon.example', 'NRG-PARTNER-2026');
  assert.equal(auth.ok, true);
});

test('filterHospitalSourcingCatalog filters China originator medicines, Turkish beds, and robotic surgery partners', () => {
  const chinaOriginators = filterHospitalSourcingCatalog(
    HOSPITAL_SOURCING_CATALOG,
    '',
    'Unapproved / Unavailable Medicine',
    'China NMPA Originator Hub'
  );
  assert.ok(chinaOriginators.length >= 4);
  assert.ok(chinaOriginators.every((i) => i.dgdaNpaEligible && i.directSourcingPriceUsd < i.referenceBenchmarkPriceUsd));

  const turkeyAssets = filterHospitalSourcingCatalog(
    HOSPITAL_SOURCING_CATALOG,
    '',
    'All',
    'Turkey MedTech Partner'
  );
  assert.ok(turkeyAssets.some((i) => i.category === 'Hospital Beds'));
  assert.ok(turkeyAssets.some((i) => i.category === 'Robotic Surgery Systems'));
  assert.ok(turkeyAssets.some((i) => i.category === 'Clinical Equipment & Devices'));

  const robotSearch = filterHospitalSourcingCatalog(HOSPITAL_SOURCING_CATALOG, 'robotic');
  assert.ok(robotSearch.length >= 2);
  assert.ok(robotSearch.some((r) => r.partnerRegion === 'China'));
  assert.ok(robotSearch.some((r) => r.partnerRegion === 'Turkey'));

  const summary = summarizeHospitalSourcingRequests(INITIAL_HOSPITAL_SOURCING_REQUESTS);
  assert.equal(summary.total, 2);
  assert.equal(summary.dgdaAssistedCount, 1);
  assert.equal(summary.medicineCount, 1);
  assert.equal(summary.medTechCount, 1);

  assert.equal(
    validateHospitalSourcingInput({
      hospitalName: 'AB',
      itemName: 'Item',
      quantity: 1,
      patientOrDeptContext: 'Context ok',
    }).ok,
    false
  );
  assert.equal(
    validateHospitalSourcingInput({
      hospitalName: 'Dhaka Medical Hospital',
      itemName: 'Osimertinib 80 mg Originator',
      quantity: 4,
      patientOrDeptContext: 'DGDA NPA Patient Ref #881',
    }).ok,
    true
  );
});

