import type {
  CartLine,
  GenericReleaseItem,
  HospitalSourcingCatalogItem,
  HospitalSourcingCategory,
  HospitalSourcingRequest,
  InsuranceClaim,
  MoleculeModality,
  PartnerSession,
  PatientPrescription,
  PatientVitalReading,
  PharmaMarketMetric,
  Product,
  ProviderAppointment,
  ProviderPermission,
  ProviderRole,
  RecallNotice,
  RegulatoryAuthority,
  SourcingOriginHub,
  TherapeuticArea,
  TradeOrder,
} from '../types/nirog';

export const DELIVERY_ZONES = [
  { id: 'dhk' as const, name: 'Dhaka Metro', fee: 60, eta: 'Same or next day', coldSupported: true },
  { id: 'city' as const, name: 'Chattogram, Sylhet, Rajshahi, Khulna', fee: 100, eta: '1–2 working days', coldSupported: false },
  { id: 'rest' as const, name: 'Rest of Bangladesh', fee: 130, eta: '2–4 working days', coldSupported: false },
];

export const PROMO_CARE5 = {
  code: 'CARE5',
  pct: 5,
  terms: '5% off OTC items only. Never applies to prescription medicines.',
};

export const SERIAL_REGISTRY: Record<string, { productId: string; batch: string; exp: string }> = {
  'NRG-7K2M-94QX': { productId: 'osi80', batch: 'DEMO-2401', exp: '08/2028' },
  'NRG-3HFA-55TP': { productId: 'gla100', batch: 'DEMO-2417', exp: '02/2027' },
  'NRG-9WQC-18LD': { productId: 'par500', batch: 'DEMO-2392', exp: '11/2028' },
};

const AREA_SYNONYMS: Record<string, string> = {
  cancer: 'Oncology',
  heart: 'Cardiovascular',
  cardiac: 'Cardiovascular',
  cholesterol: 'Cardiovascular',
  sugar: 'Diabetes',
  diabetic: 'Diabetes',
  antibiotic: 'Anti-infective',
  infection: 'Anti-infective',
  gastric: 'Gastrointestinal',
  asthma: 'Respiratory',
  vitamins: 'Consumer health',
};

export function fmtBDT(n: number): string {
  return '৳ ' + Math.round(n).toLocaleString('en-US');
}

export function fmtUSD(n: number): string {
  return 'US$ ' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function normText(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshteinBounded(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      cur[j] = cost;
      if (cost < low) low = cost;
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q: string, token: string): number {
  if (token === q) return 1;
  if (token.startsWith(q)) return 0.9;
  if (q.length >= 3 && token.includes(q)) return 0.6;
  const allow = q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0;
  if (allow > 0 && levenshteinBounded(q, token, allow) <= allow) return 0.5;
  return 0;
}

export function searchProducts(
  products: Product[],
  query: string,
  predicate?: (p: Product) => boolean
): Product[] {
  const qs = normText(query)
    .split(' ')
    .filter(Boolean)
    .map((q) => (AREA_SYNONYMS[q] ? normText(AREA_SYNONYMS[q]).split(' ')[0] : q));

  if (qs.length === 0) {
    return predicate ? products.filter(predicate) : [...products];
  }

  const scored: { p: Product; score: number }[] = [];
  for (const p of products) {
    if (predicate && !predicate(p)) continue;
    const tokens = normText(
      [p.generic, p.code, (p.syn || []).join(' '), p.cls, p.area, p.form].join(' ')
    ).split(' ');
    let total = 0;
    let ok = true;
    for (const q of qs) {
      let best = 0;
      for (const t of tokens) {
        const s = tokenScore(q, t);
        if (s > best) best = s;
      }
      if (!best) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) scored.push({ p, score: total });
  }
  scored.sort((a, b) => b.score - a.score || a.p.generic.localeCompare(b.p.generic));
  return scored.map((item) => item.p);
}

export function calculateCartTotals(
  cart: CartLine[],
  products: Product[],
  opts: { promoActive: boolean; deliveryMode: 'delivery' | 'collect'; zoneId: 'dhk' | 'city' | 'rest' }
) {
  let sub = 0;
  let otcSub = 0;
  let hasRx = false;
  let hasCold = false;

  for (const line of cart) {
    const p = products.find((item) => item.id === line.id);
    if (!p) continue;
    const lineTotal = p.price * line.qty;
    sub += lineTotal;
    if (!p.rx) otcSub += lineTotal;
    if (p.rx) hasRx = true;
    if (p.cold) hasCold = true;
  }

  const disc = opts.promoActive ? Math.round((otcSub * PROMO_CARE5.pct) / 100) : 0;
  const zone = DELIVERY_ZONES.find((z) => z.id === opts.zoneId) || DELIVERY_ZONES[0];
  const fee = opts.deliveryMode === 'collect' ? 0 : zone.fee;

  return {
    sub,
    otcSub,
    disc,
    fee,
    total: Math.max(0, sub - disc + fee),
    hasRx,
    hasCold,
    coldBlockedInZone: hasCold && opts.deliveryMode === 'delivery' && !zone.coldSupported,
  };
}

export interface InteractionResult {
  level: 'ok' | 'info' | 'warn';
  title: string;
  message: string;
}

const INTERACTION_MATRIX: Record<string, InteractionResult> = {
  'ato20+azi500': {
    level: 'warn',
    title: 'Moderate Interaction Notice (Assistive Flag)',
    message:
      'Co-administration of macrolide antibiotics (Azithromycin) with statins (Atorvastatin) may increase systemic statin exposure and myopathy risk. Clinician or pharmacist review is advised.',
  },
  'osi80+gla100': {
    level: 'info',
    title: 'Monitoring Advisory',
    message:
      'Monitor blood glucose trends during systemic targeted oncology therapy. No direct pharmacokinetic contraindication flagged in this demo reference.',
  },
  'met500+emp10': {
    level: 'ok',
    title: 'Standard Dual-Therapy Combination',
    message:
      'Biguanide + SGLT2 inhibitor is a widely used combination. Confirm baseline eGFR and hydration status per clinical guidelines.',
  },
  'aml5+ato20': {
    level: 'ok',
    title: 'Compatible Cardiometabolic Regimen',
    message:
      'Amlodipine and Atorvastatin are frequently co-prescribed in cardiovascular care with no significant interaction in this reference set.',
  },
};

export function lookupDrugInteraction(idA: string, idB: string): InteractionResult {
  if (idA === idB) {
    return {
      level: 'info',
      title: 'Duplicate Medicine Selected',
      message: 'Choose two distinct medicines to evaluate potential co-administration considerations.',
    };
  }
  return (
    INTERACTION_MATRIX[`${idA}+${idB}`] ||
    INTERACTION_MATRIX[`${idB}+${idA}`] || {
      level: 'ok',
      title: 'No Major Flag in Demo Table',
      message:
        'No major flag found in this synthetic interaction table. Always verify full approved prescribing information and patient lab values.',
    }
  );
}

export function verifySerialCode(
  codeRaw: string,
  scanCounts: Record<string, number>,
  products: Product[]
): {
  valid: boolean;
  code: string;
  product?: Product;
  batch?: string;
  exp?: string;
  scans: number;
  message: string;
} {
  const code = codeRaw.trim().toUpperCase();
  const entry = SERIAL_REGISTRY[code];
  if (!entry) {
    return {
      valid: false,
      code,
      scans: 0,
      message: 'Serial code not recognized in the synthetic pack registry. Check characters or report suspected counterfeit.',
    };
  }
  const scans = (scanCounts[code] || 0) + 1;
  const product = products.find((p) => p.id === entry.productId);
  return {
    valid: true,
    code,
    product,
    batch: entry.batch,
    exp: entry.exp,
    scans,
    message:
      scans > 1
        ? `Authentic serial matched, but scanned ${scans} times in this session—verify pack seal before dispensing.`
        : 'Authentic pack serial matched against batch release records.',
  };
}

export function validateTradeLineQty(product: Product, qty: number): { ok: boolean; error?: string } {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: 'Quantity must be greater than zero.' };
  }
  if (qty < product.moq) {
    return { ok: false, error: `Minimum order quantity is ${product.moq} packs.` };
  }
  if (qty % product.mult !== 0) {
    return { ok: false, error: `Quantity must be a multiple of ${product.mult} packs.` };
  }
  return { ok: true };
}

export function scoreInsuranceClaim(claim: InsuranceClaim): {
  riskScore: number;
  tier: 'Low' | 'Moderate' | 'High';
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 8;

  const ratio = claim.benchmarkBdt > 0 ? claim.billedBdt / claim.benchmarkBdt : 1;
  if (ratio > 1.35) {
    score += 34;
    reasons.push(`Billed amount is ${Math.round((ratio - 1) * 100)}% above regional procedure benchmark.`);
  } else if (ratio > 1.15) {
    score += 16;
    reasons.push(`Billed amount is ${Math.round((ratio - 1) * 100)}% above regional benchmark.`);
  }

  if (claim.duplicateCodeFlag) {
    score += 28;
    reasons.push('Duplicate CPT/service code detected within same admission window.');
  }
  if (claim.unbundledBillingFlag) {
    score += 24;
    reasons.push('Potential unbundled procedure billing detected across line items.');
  }
  if (!claim.priorAuthMatch) {
    score += 18;
    reasons.push('Pre-authorization record missing or mismatched for inpatient threshold.');
  }

  const clamped = Math.min(99, score);
  const tier = clamped >= 60 ? 'High' : clamped >= 30 ? 'Moderate' : 'Low';
  if (reasons.length === 0) {
    reasons.push('Claim aligns with benchmark tariff and verified prior authorization.');
  }
  return { riskScore: clamped, tier, reasons };
}

export interface RoleProfile {
  role: ProviderRole;
  title: string;
  summary: string;
  dataBoundary: string;
  permissions: Record<ProviderPermission, boolean>;
}

export const PROVIDER_ROLE_PROFILES: Record<ProviderRole, RoleProfile> = {
  Doctor: {
    role: 'Doctor',
    title: 'Attending Physician',
    summary: 'Full clinical EMR access, scheduling oversight, e-prescription sign-off, and assistive CDSS & Radiology AI sign-off.',
    dataBoundary: 'Authorized for full patient clinical PHI and final medical sign-off.',
    permissions: {
      viewDemographics: true,
      viewClinicalEmr: true,
      manageScheduling: true,
      recordVitals: true,
      signConsultAndRx: true,
      accessAiTools: true,
      signRadiologyAi: true,
      manageHospitalErp: false,
      viewComplianceAudit: false,
    },
  },
  Nurse: {
    role: 'Nurse',
    title: 'Triage & Care Nurse',
    summary: 'View clinical EMR, manage patient check-in, record triage vitals, and view assistive CDSS advisories (physician required for final Rx/radiology sign-off).',
    dataBoundary: 'Clinical care team access; cannot finalize physician prescriptions or radiology signatures.',
    permissions: {
      viewDemographics: true,
      viewClinicalEmr: true,
      manageScheduling: true,
      recordVitals: true,
      signConsultAndRx: false,
      accessAiTools: true,
      signRadiologyAi: false,
      manageHospitalErp: false,
      viewComplianceAudit: false,
    },
  },
  Receptionist: {
    role: 'Receptionist',
    title: 'Front-Desk Coordinator',
    summary: 'Schedule appointments and check in patients while clinical EMR notes, diagnoses, and AI clinical tools remain privacy-masked.',
    dataBoundary: 'Minimum-necessary administrative access: clinical PHI and diagnostic records are redacted.',
    permissions: {
      viewDemographics: true,
      viewClinicalEmr: false,
      manageScheduling: true,
      recordVitals: false,
      signConsultAndRx: false,
      accessAiTools: false,
      signRadiologyAi: false,
      manageHospitalErp: false,
      viewComplianceAudit: false,
    },
  },
  Administrator: {
    role: 'Administrator',
    title: 'Hospital ERP & Compliance Admin',
    summary: 'Oversee hospital bed occupancy, revenue ledger, scheduling throughput, and RBAC privacy audit trails without exposing raw clinical charts.',
    dataBoundary: 'Operational governance role: full ERP & RBAC audit visibility; raw clinical EMR notes masked by least-privilege policy.',
    permissions: {
      viewDemographics: true,
      viewClinicalEmr: false,
      manageScheduling: true,
      recordVitals: false,
      signConsultAndRx: false,
      accessAiTools: false,
      signRadiologyAi: false,
      manageHospitalErp: true,
      viewComplianceAudit: true,
    },
  },
};

export function hasProviderPermission(role: ProviderRole, perm: ProviderPermission): boolean {
  return Boolean(PROVIDER_ROLE_PROFILES[role]?.permissions[perm]);
}

export function maskEmrForRole(role: ProviderRole, emrText: string): { visible: boolean; text: string } {
  if (hasProviderPermission(role, 'viewClinicalEmr')) {
    return { visible: true, text: emrText };
  }
  return {
    visible: false,
    text: `PHI Redacted (${role} least-privilege policy)`,
  };
}

export function summarizeTradeOrders(orders: TradeOrder[]): {
  totalOrders: number;
  totalUsd: number;
  inTransitCount: number;
  deliveredCount: number;
} {
  let totalUsd = 0;
  let inTransitCount = 0;
  let deliveredCount = 0;
  for (const o of orders) {
    const linesSum = o.lines.reduce((acc, l) => acc + l.qty * l.unitUsd, 0);
    totalUsd += linesSum + (o.freightUsd || 0);
    if (o.status === 'dispatched' || o.status === 'in_preparation') inTransitCount += 1;
    if (o.status === 'delivered') deliveredCount += 1;
  }
  return {
    totalOrders: orders.length,
    totalUsd: Math.round(totalUsd * 100) / 100,
    inTransitCount,
    deliveredCount,
  };
}

export function filterPortfolioRecalls(
  recalls: RecallNotice[],
  areaFilter: TherapeuticArea | 'All'
): RecallNotice[] {
  if (areaFilter === 'All') return recalls;
  return recalls.filter((r) => !r.area || r.area === 'All' || r.area === areaFilter);
}

export interface MarketTrendPoint {
  month: string;
  marketDemandIndex: number;
  productGrowthPct: number;
  benchmarkGrowthPct: number;
  prescriptionsK: number;
  coldChainSharePct: number;
}

const MONTHS_12 = [
  'Dec 25',
  'Jan 26',
  'Feb 26',
  'Mar 26',
  'Apr 26',
  'May 26',
  'Jun 26',
  'Jul 26',
  'Aug 26',
  'Sep 26',
  'Oct 26',
  'Nov 26',
];

export function buildMarketTrendSeries(
  metrics: PharmaMarketMetric[],
  areaFilter: TherapeuticArea | 'All',
  regionFilter: 'All' | 'Bangladesh' | 'Southeast Asia' | 'East Africa',
  horizon: '3M' | '6M' | '12M' = '12M'
): MarketTrendPoint[] {
  const matched = metrics.filter(
    (m) =>
      (areaFilter === 'All' || m.area === areaFilter) &&
      (regionFilter === 'All' || m.region === regionFilter)
  );
  if (matched.length === 0) return [];

  const avgDemand = matched.reduce((acc, m) => acc + m.demandIndex, 0) / matched.length;
  const avgGrowth = matched.reduce((acc, m) => acc + m.yoyGrowthPct, 0) / matched.length;
  const totalScripts = matched.reduce((acc, m) => acc + m.monthlyScriptsK, 0);
  const avgCold = matched.reduce((acc, m) => acc + m.coldChainSharePct, 0) / matched.length;

  const count = horizon === '3M' ? 3 : horizon === '6M' ? 6 : 12;
  const startIdx = MONTHS_12.length - count;

  return MONTHS_12.slice(startIdx).map((month, idx) => {
    const progress = count > 1 ? idx / (count - 1) : 1;
    const seasonal = Math.sin((idx + 1) * 0.9) * 2.1;
    const demand = Math.min(99, Math.max(20, +(avgDemand * (0.86 + 0.14 * progress) + seasonal).toFixed(1)));
    const growth = Math.max(1.5, +(avgGrowth * (0.74 + 0.26 * progress) + seasonal * 0.35).toFixed(1));
    const benchmark = Math.max(1.0, +(growth * 0.72 + 1.1).toFixed(1));
    const scripts = Math.round(totalScripts * (0.83 + 0.17 * progress + seasonal * 0.008));
    const cold = Math.min(95, Math.max(0, +(avgCold * (0.9 + 0.1 * progress)).toFixed(1)));

    return {
      month,
      marketDemandIndex: demand,
      productGrowthPct: growth,
      benchmarkGrowthPct: benchmark,
      prescriptionsK: scripts,
      coldChainSharePct: cold,
    };
  });
}

export function buildMarketTrendCsv(
  points: MarketTrendPoint[],
  areaFilter: TherapeuticArea | 'All',
  regionFilter: 'All' | 'Bangladesh' | 'Southeast Asia' | 'East Africa'
): string {
  const header = 'Portfolio,Region,Month,MarketDemandIndex,YoYProductGrowthPct,CategoryBenchmarkYoYPct,MonthlyRxK,ColdChainSharePct';
  const rows = points.map((p) =>
    [
      areaFilter,
      regionFilter,
      p.month,
      p.marketDemandIndex,
      p.productGrowthPct,
      p.benchmarkGrowthPct,
      p.prescriptionsK,
      p.coldChainSharePct,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export const REGULATORY_AUTHORITIES: RegulatoryAuthority[] = [
  'DGDA',
  'EMA',
  'PMDA',
  'TGA',
  'Swissmedic',
  'Health Canada',
  'UK MHRA',
  'NMPA (China)',
];

export function filterGenericLaunches(
  items: GenericReleaseItem[],
  query: string,
  areaFilter: TherapeuticArea | 'All',
  stageFilter: 'All' | GenericReleaseItem['releaseStage'],
  modalityFilter: MoleculeModality | 'All' = 'All',
  regulatorFilter: RegulatoryAuthority | 'All' = 'All'
): GenericReleaseItem[] {
  const q = normText(query);
  return items.filter((item) => {
    if (areaFilter !== 'All' && item.therapeuticArea !== areaFilter) return false;
    if (stageFilter !== 'All' && item.releaseStage !== stageFilter) return false;
    if (modalityFilter !== 'All' && item.modality !== modalityFilter) return false;
    if (regulatorFilter !== 'All' && !item.regulators.includes(regulatorFilter)) return false;
    if (!q) return true;
    const haystack = normText(
      [
        item.molecule,
        item.genericBrand,
        item.originator,
        item.firstMoverCompany,
        item.originCountry,
        item.therapeuticClass,
        item.modality,
        item.launcherCategory,
        item.accessPathway,
        item.affectedPatientGroup,
        item.indications.join(' '),
        item.regulators.join(' '),
      ].join(' ')
    );
    return haystack.includes(q);
  });
}

export interface LaunchMonitorChartPoint {
  id: string;
  shortName: string;
  molecule: string;
  modality: MoleculeModality;
  launchFocusScore: number;
  marketDemandUsdM: number;
  estimatedPatientPoolM: number;
  regulatorCount: number;
  recommendedNextFocus: boolean;
}

export function summarizeLaunchMonitorOpportunities(items: GenericReleaseItem[]): {
  chartPoints: LaunchMonitorChartPoint[];
  agencyCounts: { authority: RegulatoryAuthority; count: number }[];
  totalDemandUsdM: number;
  totalPatientPoolM: number;
  recommendedCount: number;
} {
  const sorted = [...items].sort(
    (a, b) => b.launchFocusScore - a.launchFocusScore || b.marketDemandUsdM - a.marketDemandUsdM
  );
  const chartPoints: LaunchMonitorChartPoint[] = sorted.slice(0, 7).map((item) => ({
    id: item.id,
    shortName: item.molecule.split(' (')[0].split(' 80')[0].split(' 100')[0].split(' 120')[0].split(' 4 ')[0],
    molecule: item.molecule,
    modality: item.modality,
    launchFocusScore: item.launchFocusScore,
    marketDemandUsdM: item.marketDemandUsdM,
    estimatedPatientPoolM: item.estimatedPatientPoolM,
    regulatorCount: item.regulators.length,
    recommendedNextFocus: item.recommendedNextFocus,
  }));

  const agencyCounts = REGULATORY_AUTHORITIES.map((authority) => ({
    authority,
    count: items.filter((item) => item.regulators.includes(authority)).length,
  }));

  return {
    chartPoints,
    agencyCounts,
    totalDemandUsdM: items.reduce((acc, item) => acc + item.marketDemandUsdM, 0),
    totalPatientPoolM: +items.reduce((acc, item) => acc + item.estimatedPatientPoolM, 0).toFixed(1),
    recommendedCount: items.filter((item) => item.recommendedNextFocus).length,
  };
}

export function authenticatePartnerCompany(
  emailRaw: string,
  passkeyRaw: string,
  companyRaw?: string
): { ok: true; session: PartnerSession } | { ok: false; error: string } {
  const email = emailRaw.trim().toLowerCase();
  const passkey = passkeyRaw.trim();
  if (!email || !email.includes('@')) {
    return { ok: false, error: 'Enter a valid partner company email address.' };
  }
  if (passkey.length < 6) {
    return { ok: false, error: 'Partner access passkey must be at least 6 characters.' };
  }
  const derivedOrg =
    companyRaw?.trim() ||
    (email.includes('beacon')
      ? 'Beacon Pharmaceuticals Ltd. (Partner)'
      : 'Verified Pharma Partner Organization');
  return {
    ok: true,
    session: {
      company: derivedOrg,
      email,
      tier: 'Partner Intelligence · Tier A',
      signedInAt: Date.now(),
    },
  };
}

export interface PatientAdherencePoint {
  label: string;
  adherencePct: number;
  targetPct: number;
  dosesLogged: number;
}

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function computeWeeklyAdherencePct(diaryOn: boolean, diaryDays: Record<number, boolean>): number {
  if (!diaryOn) return 0;
  let checked = 0;
  for (let i = 0; i < 7; i++) {
    if (diaryDays[i]) checked += 1;
  }
  return Math.round((checked / 7) * 100);
}

export function buildPatientAdherenceSeries(
  diaryOn: boolean,
  diaryDays: Record<number, boolean>,
  horizon: '7D' | '30D' | '90D'
): PatientAdherencePoint[] {
  const currentWeekPct = computeWeeklyAdherencePct(diaryOn, diaryDays);

  if (horizon === '7D') {
    return WEEK_DAY_LABELS.map((day, idx) => {
      const taken = diaryOn && Boolean(diaryDays[idx]);
      return {
        label: day,
        adherencePct: taken ? 100 : 0,
        targetPct: 85,
        dosesLogged: taken ? 2 : 0,
      };
    });
  }

  if (horizon === '30D') {
    return [
      { label: 'Wk 1', adherencePct: 71, targetPct: 85, dosesLogged: 10 },
      { label: 'Wk 2', adherencePct: 79, targetPct: 85, dosesLogged: 11 },
      { label: 'Wk 3', adherencePct: 86, targetPct: 85, dosesLogged: 12 },
      {
        label: 'This Wk',
        adherencePct: currentWeekPct,
        targetPct: 85,
        dosesLogged: Math.round((currentWeekPct / 100) * 14),
      },
    ];
  }

  return [
    { label: 'Aug W4', adherencePct: 64, targetPct: 85, dosesLogged: 9 },
    { label: 'Sep W2', adherencePct: 71, targetPct: 85, dosesLogged: 10 },
    { label: 'Sep W4', adherencePct: 78, targetPct: 85, dosesLogged: 11 },
    { label: 'Oct W2', adherencePct: 82, targetPct: 85, dosesLogged: 11 },
    { label: 'Oct W4', adherencePct: 86, targetPct: 85, dosesLogged: 12 },
    { label: 'Nov W1', adherencePct: 88, targetPct: 85, dosesLogged: 12 },
    {
      label: 'Current',
      adherencePct: currentWeekPct,
      targetPct: 85,
      dosesLogged: Math.round((currentWeekPct / 100) * 14),
    },
  ];
}

export function sliceVitalReadingsByHorizon(
  readings: PatientVitalReading[],
  horizon: '7D' | '30D' | '90D'
): PatientVitalReading[] {
  if (readings.length === 0) return [];
  const count = horizon === '7D' ? 4 : horizon === '30D' ? 7 : readings.length;
  return readings.slice(-count);
}

export function classifyVitalStatus(reading?: PatientVitalReading): {
  label: 'On Target' | 'Watch' | 'Elevated';
  detail: string;
} {
  if (!reading) {
    return { label: 'Watch', detail: 'No vital readings recorded yet.' };
  }
  if (reading.fastingGlucoseMgDl >= 140 || reading.systolicMmHg >= 140 || reading.diastolicMmHg >= 90) {
    return {
      label: 'Elevated',
      detail: 'Fasting glucose or blood pressure exceeds target band; share with clinician.',
    };
  }
  if (reading.fastingGlucoseMgDl > 125 || reading.systolicMmHg >= 130 || reading.diastolicMmHg >= 85) {
    return {
      label: 'Watch',
      detail: 'Mild elevation above strict glycemic/BP goal; continue daily monitoring.',
    };
  }
  return {
    label: 'On Target',
    detail: 'Fasting glucose and resting blood pressure remain within target range.',
  };
}

export function validateAndCreateVitalReading(
  input: {
    fastingGlucose: number;
    postMealGlucose: number;
    systolic: number;
    diastolic: number;
    heartRate: number;
    weightKg: number;
  },
  previous?: PatientVitalReading
): { ok: true; reading: PatientVitalReading } | { ok: false; error: string } {
  const { fastingGlucose, postMealGlucose, systolic, diastolic, heartRate, weightKg } = input;
  if (!Number.isFinite(fastingGlucose) || fastingGlucose < 40 || fastingGlucose > 500) {
    return { ok: false, error: 'Fasting glucose must be between 40 and 500 mg/dL.' };
  }
  if (!Number.isFinite(postMealGlucose) || postMealGlucose < 50 || postMealGlucose > 600) {
    return { ok: false, error: 'Post-meal glucose must be between 50 and 600 mg/dL.' };
  }
  if (!Number.isFinite(systolic) || systolic < 70 || systolic > 240) {
    return { ok: false, error: 'Systolic blood pressure must be between 70 and 240 mmHg.' };
  }
  if (!Number.isFinite(diastolic) || diastolic < 40 || diastolic > 150 || diastolic >= systolic) {
    return { ok: false, error: 'Diastolic BP must be between 40 and 150 mmHg and below systolic.' };
  }
  if (!Number.isFinite(heartRate) || heartRate < 35 || heartRate > 200) {
    return { ok: false, error: 'Heart rate must be between 35 and 200 bpm.' };
  }
  if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 250) {
    return { ok: false, error: 'Weight must be between 25 and 250 kg.' };
  }

  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLabel = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]}`;
  const heightMeters = 1.7;
  const bmi = +(weightKg / (heightMeters * heightMeters)).toFixed(1);
  const estimatedA1c = +Math.max(5.2, Math.min(11.5, ((fastingGlucose + 46.7) / 28.7) * 0.92)).toFixed(1);

  return {
    ok: true,
    reading: {
      id: `vit-${Date.now()}`,
      dateLabel,
      isoDate: now.toISOString().slice(0, 10),
      fastingGlucoseMgDl: Math.round(fastingGlucose),
      postMealGlucoseMgDl: Math.round(postMealGlucose),
      hba1cPct: previous ? +((previous.hba1cPct * 0.7 + estimatedA1c * 0.3)).toFixed(1) : estimatedA1c,
      systolicMmHg: Math.round(systolic),
      diastolicMmHg: Math.round(diastolic),
      heartRateBpm: Math.round(heartRate),
      ldlMgDl: previous?.ldlMgDl ?? 112,
      hdlMgDl: previous?.hdlMgDl ?? 49,
      weightKg: +weightKg.toFixed(1),
      bmi,
      source: 'Manual Patient Log',
    },
  };
}

export function filterPrescriptions(
  items: PatientPrescription[],
  statusFilter: 'All' | PatientPrescription['status']
): PatientPrescription[] {
  if (statusFilter === 'All') return items;
  return items.filter((p) => p.status === statusFilter);
}

export function filterPatientAppointments(
  items: ProviderAppointment[],
  statusFilter: 'All' | ProviderAppointment['status']
): ProviderAppointment[] {
  if (statusFilter === 'All') return items;
  return items.filter((a) => a.status === statusFilter);
}

export function buildPatientVitalsCsv(readings: PatientVitalReading[]): string {
  const header = 'Date,FastingGlucoseMgDl,PostMealGlucoseMgDl,HbA1cPct,SystolicMmHg,DiastolicMmHg,HeartRateBpm,LdlMgDl,HdlMgDl,WeightKg,BMI,Source';
  const rows = readings.map((r) =>
    [
      r.isoDate,
      r.fastingGlucoseMgDl,
      r.postMealGlucoseMgDl,
      r.hba1cPct,
      r.systolicMmHg,
      r.diastolicMmHg,
      r.heartRateBpm,
      r.ldlMgDl,
      r.hdlMgDl,
      r.weightKg,
      r.bmi,
      `"${r.source.replace(/"/g, '""')}"`,
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

export interface VitalProjectionPoint {
  dateLabel: string;
  isProjected: boolean;
  fastingGlucoseMgDl?: number;
  postMealGlucoseMgDl?: number;
  hba1cPct?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  heartRateBpm?: number;
  ldlMgDl?: number;
  hdlMgDl?: number;
  bmi?: number;
  projFastingGlucoseMgDl?: number;
  projPostMealGlucoseMgDl?: number;
  projHba1cPct?: number;
  projSystolicMmHg?: number;
  projDiastolicMmHg?: number;
  projHeartRateBpm?: number;
  projLdlMgDl?: number;
  projHdlMgDl?: number;
  projBmi?: number;
}

export interface AdherenceProjectionPoint {
  label: string;
  adherencePct?: number;
  targetPct: number;
  dosesLogged?: number;
  projAdherencePct?: number;
  isProjected: boolean;
}

export function computeSimpleMovingAverage(values: number[], windowSize = 7): number {
  if (values.length === 0) return 0;
  const k = Math.max(1, Math.min(windowSize, values.length));
  const slice = values.slice(-k);
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

/**
 * Computes a rolling Simple Moving Average (default 7-day / 7-reading window)
 * across a series, returning one smoothed trend value per historical point.
 * When timestamps (`isoDates`) contain dense logs (>= windowSize readings inside
 * 7 calendar days), all readings within that 7-day window are averaged.
 */
export function computeRollingSmaSeries(
  values: number[],
  windowSize = 7,
  decimals = 0,
  isoDates?: string[]
): number[] {
  if (values.length === 0) return [];
  const k = Math.max(1, windowSize);
  return values.map((_, idx) => {
    let slice: number[];
    if (isoDates && isoDates[idx]) {
      const currMs = Date.parse(isoDates[idx]);
      if (!Number.isNaN(currMs)) {
        const calSlice: number[] = [];
        for (let j = 0; j <= idx; j++) {
          const jMs = Date.parse(isoDates[j]);
          const diffDays = (currMs - jMs) / (1000 * 60 * 60 * 24);
          if (!Number.isNaN(jMs) && diffDays >= 0 && diffDays <= 6) {
            calSlice.push(values[j]);
          }
        }
        slice =
          calSlice.length >= k
            ? calSlice
            : values.slice(Math.max(0, idx - k + 1), idx + 1);
      } else {
        slice = values.slice(Math.max(0, idx - k + 1), idx + 1);
      }
    } else {
      slice = values.slice(Math.max(0, idx - k + 1), idx + 1);
    }
    const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    return Number(mean.toFixed(decimals));
  });
}

function projectSmaStep(
  smaSeries: number[],
  stepIdx: number,
  decimals: number,
  minVal: number,
  maxVal: number
): number {
  if (smaSeries.length === 0) return minVal;
  const lastSma = smaSeries[smaSeries.length - 1];
  const prevSma = smaSeries.length > 1 ? smaSeries[smaSeries.length - 2] : lastSma;
  const slope = lastSma - prevSma;
  const projected = lastSma + slope * stepIdx;
  const clamped = Math.min(maxVal, Math.max(minVal, projected));
  return Number(clamped.toFixed(decimals));
}

export function buildVitalProjectionSeries(
  readings: PatientVitalReading[],
  horizon: '7D' | '30D' | '90D',
  windowSize = 7,
  forwardSteps = 3
): VitalProjectionPoint[] {
  if (readings.length === 0) return [];
  const isoDates = readings.map((r) => r.isoDate);

  const fgHist = readings.map((r) => r.fastingGlucoseMgDl);
  const pmHist = readings.map((r) => r.postMealGlucoseMgDl);
  const a1cHist = readings.map((r) => r.hba1cPct);
  const sysHist = readings.map((r) => r.systolicMmHg);
  const diaHist = readings.map((r) => r.diastolicMmHg);
  const hrHist = readings.map((r) => r.heartRateBpm);
  const ldlHist = readings.map((r) => r.ldlMgDl);
  const hdlHist = readings.map((r) => r.hdlMgDl);
  const bmiHist = readings.map((r) => r.bmi);

  const fgSma = computeRollingSmaSeries(fgHist, windowSize, 0, isoDates);
  const pmSma = computeRollingSmaSeries(pmHist, windowSize, 0, isoDates);
  const a1cSma = computeRollingSmaSeries(a1cHist, windowSize, 1, isoDates);
  const sysSma = computeRollingSmaSeries(sysHist, windowSize, 0, isoDates);
  const diaSma = computeRollingSmaSeries(diaHist, windowSize, 0, isoDates);
  const hrSma = computeRollingSmaSeries(hrHist, windowSize, 0, isoDates);
  const ldlSma = computeRollingSmaSeries(ldlHist, windowSize, 0, isoDates);
  const hdlSma = computeRollingSmaSeries(hdlHist, windowSize, 0, isoDates);
  const bmiSma = computeRollingSmaSeries(bmiHist, windowSize, 1, isoDates);

  const allHistorical: VitalProjectionPoint[] = readings.map((r, idx) => ({
    dateLabel: r.dateLabel,
    isProjected: false,
    fastingGlucoseMgDl: r.fastingGlucoseMgDl,
    postMealGlucoseMgDl: r.postMealGlucoseMgDl,
    hba1cPct: r.hba1cPct,
    systolicMmHg: r.systolicMmHg,
    diastolicMmHg: r.diastolicMmHg,
    heartRateBpm: r.heartRateBpm,
    ldlMgDl: r.ldlMgDl,
    hdlMgDl: r.hdlMgDl,
    bmi: r.bmi,
    projFastingGlucoseMgDl: fgSma[idx],
    projPostMealGlucoseMgDl: pmSma[idx],
    projHba1cPct: a1cSma[idx],
    projSystolicMmHg: sysSma[idx],
    projDiastolicMmHg: diaSma[idx],
    projHeartRateBpm: hrSma[idx],
    projLdlMgDl: ldlSma[idx],
    projHdlMgDl: hdlSma[idx],
    projBmi: bmiSma[idx],
  }));

  const sliceCount = horizon === '7D' ? 4 : horizon === '30D' ? 7 : allHistorical.length;
  const base = allHistorical.slice(-sliceCount);

  const stepDays = horizon === '7D' ? 2 : horizon === '30D' ? 5 : 9;

  for (let s = 1; s <= forwardSteps; s++) {
    base.push({
      dateLabel: `+${s * stepDays}d Est`,
      isProjected: true,
      projFastingGlucoseMgDl: projectSmaStep(fgSma, s, 0, 55, 420),
      projPostMealGlucoseMgDl: projectSmaStep(pmSma, s, 0, 75, 500),
      projHba1cPct: projectSmaStep(a1cSma, s, 1, 4.8, 12.0),
      projSystolicMmHg: projectSmaStep(sysSma, s, 0, 80, 220),
      projDiastolicMmHg: projectSmaStep(diaSma, s, 0, 45, 130),
      projHeartRateBpm: projectSmaStep(hrSma, s, 0, 42, 160),
      projLdlMgDl: projectSmaStep(ldlSma, s, 0, 40, 240),
      projHdlMgDl: projectSmaStep(hdlSma, s, 0, 25, 110),
      projBmi: projectSmaStep(bmiSma, s, 1, 16, 48),
    });
  }

  return base;
}

export function buildAdherenceProjectionSeries(
  points: PatientAdherencePoint[],
  windowSize = 7,
  forwardSteps = 2
): AdherenceProjectionPoint[] {
  if (points.length === 0) return [];
  const hist = points.map((p) => p.adherencePct);
  const smaSeries = computeRollingSmaSeries(hist, windowSize, 0);

  const result: AdherenceProjectionPoint[] = points.map((p, idx) => ({
    label: p.label,
    adherencePct: p.adherencePct,
    targetPct: p.targetPct,
    dosesLogged: p.dosesLogged,
    projAdherencePct: smaSeries[idx],
    isProjected: false,
  }));

  for (let s = 1; s <= forwardSteps; s++) {
    result.push({
      label: `+${s} Int Est`,
      targetPct: 85,
      projAdherencePct: projectSmaStep(smaSeries, s, 0, 0, 100),
      isProjected: true,
    });
  }
  return result;
}

export function filterHospitalSourcingCatalog(
  items: HospitalSourcingCatalogItem[],
  query: string,
  categoryFilter: 'All' | HospitalSourcingCategory = 'All',
  hubFilter: 'All' | SourcingOriginHub = 'All'
): HospitalSourcingCatalogItem[] {
  const q = normText(query);
  return items.filter((item) => {
    if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
    if (hubFilter !== 'All' && item.originHub !== hubFilter) return false;
    if (!q) return true;
    const haystack = normText(
      [
        item.name,
        item.category,
        item.originHub,
        item.partnerRegion,
        item.partnerName,
        item.clinicalSpec,
        item.dgdaPathwayNote,
        item.regulatoryCertifications.join(' '),
      ].join(' ')
    );
    return haystack.includes(q);
  });
}

export function summarizeHospitalSourcingRequests(requests: HospitalSourcingRequest[]): {
  total: number;
  dgdaAssistedCount: number;
  activeOrInTransitCount: number;
  medicineCount: number;
  medTechCount: number;
} {
  let dgdaAssistedCount = 0;
  let activeOrInTransitCount = 0;
  let medicineCount = 0;
  let medTechCount = 0;

  for (const r of requests) {
    if (r.dgdaAssistance) dgdaAssistedCount += 1;
    if (r.status === 'DGDA Filing / Partner Quote' || r.status === 'Approved / In Transit') {
      activeOrInTransitCount += 1;
    }
    if (r.category === 'Unapproved / Unavailable Medicine') {
      medicineCount += 1;
    } else {
      medTechCount += 1;
    }
  }

  return {
    total: requests.length,
    dgdaAssistedCount,
    activeOrInTransitCount,
    medicineCount,
    medTechCount,
  };
}

export function validateHospitalSourcingInput(input: {
  hospitalName: string;
  itemName: string;
  quantity: number;
  patientOrDeptContext: string;
}): { ok: true } | { ok: false; error: string } {
  if (!input.hospitalName.trim() || input.hospitalName.trim().length < 3) {
    return { ok: false, error: 'Enter the requesting hospital or clinic name (at least 3 characters).' };
  }
  if (!input.itemName.trim() || input.itemName.trim().length < 3) {
    return { ok: false, error: 'Specify the unapproved medicine or clinical equipment/robotic item.' };
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 1 || input.quantity > 10000) {
    return { ok: false, error: 'Quantity must be between 1 and 10,000 units.' };
  }
  if (!input.patientOrDeptContext.trim() || input.patientOrDeptContext.trim().length < 5) {
    return {
      ok: false,
      error: 'Provide Named Patient case reference or hospital department context (at least 5 characters).',
    };
  }
  return { ok: true };
}

