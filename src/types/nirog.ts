export type RouteId =
  | 'home'
  | 'ai-solutions'
  | 'patient-pro'
  | 'providers'
  | 'pharmacy'
  | 'cart'
  | 'orders'
  | 'pharma-tech'
  | 'insurance'
  | 'company'
  | 'support'
  | 'staff';

export type NodeKey =
  | 'core'
  | 'patients'
  | 'doctors'
  | 'hospitals'
  | 'diagnostics'
  | 'pharma'
  | 'pharmacy'
  | 'insurance'
  | 'research';

export type TherapeuticArea =
  | 'Oncology'
  | 'Cardiovascular'
  | 'Diabetes'
  | 'Anti-infective'
  | 'Gastrointestinal'
  | 'Respiratory'
  | 'Consumer health';

export type StockLevel = 'in' | 'low' | 'out';

export interface Product {
  id: string;
  code: string;
  generic: string;
  strength: string;
  form: string;
  glyph: 'tablet' | 'capsule' | 'vial' | 'pen' | 'sachet' | 'chew';
  pack: string;
  area: TherapeuticArea;
  cls: string;
  rx: boolean;
  retail: boolean;
  cold: boolean;
  price: number;
  listUsd: number;
  moq: number;
  mult: number;
  stock: StockLevel;
  syn?: string[];
  noTerritory?: string[];
}

export interface CartLine {
  id: string;
  qty: number;
}

export type OrderStatus =
  | 'received'
  | 'rx_review'
  | 'confirmed'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface Order {
  ref: string;
  sample?: boolean;
  t: number;
  items: { id: string; qty: number; price: number }[];
  rxNeeded: boolean;
  rxFiles: string[];
  rxDeferred: boolean;
  delivery: {
    name: string;
    phone: string;
    mode: 'delivery' | 'collect';
    zone: 'dhk' | 'city' | 'rest';
    address: string;
  };
  payMethod: 'card' | 'mfs' | 'bank' | 'cod';
  payStatus: 'paid' | 'pending';
  totals: {
    sub: number;
    disc: number;
    fee: number;
    total: number;
  };
  status: OrderStatus;
  courier?: string;
  history: { status: OrderStatus; t: number }[];
}

export interface SupportProgramme {
  id: 'npa' | 'oap' | 'ccc';
  name: string;
  scope: 'International' | 'Bangladesh';
  area: string;
  summary: string;
  support: string[];
  eligibility: string[];
  documents: string[];
  products: string[];
}

export type CaseStatus =
  | 'submitted'
  | 'in_review'
  | 'more_info'
  | 'approved'
  | 'not_eligible'
  | 'withdrawn';

export interface SupportCase {
  ref: string;
  sample?: boolean;
  mine: boolean;
  t: number;
  programme: 'npa' | 'oap' | 'ccc';
  who: 'Patient' | 'Caregiver';
  name: string;
  initials: string;
  country: string;
  product: string;
  physician: string;
  hospital: string;
  docs: number;
  channels: string[];
  neutralWording: boolean;
  status: CaseStatus;
  note: string;
  history: { label: string; t: number }[];
}

export type ProviderRole = 'Doctor' | 'Nurse' | 'Receptionist' | 'Administrator';

export type ProviderPermission =
  | 'viewDemographics'
  | 'viewClinicalEmr'
  | 'manageScheduling'
  | 'recordVitals'
  | 'signConsultAndRx'
  | 'accessAiTools'
  | 'signRadiologyAi'
  | 'manageHospitalErp'
  | 'viewComplianceAudit';

export interface ProviderAppointment {
  id: string;
  patient: string;
  time: string;
  reason: string;
  emr: string;
  vitals?: string;
  status: 'Waiting' | 'In Review' | 'Scheduled' | 'Completed';
}

export interface RadiologyCase {
  id: string;
  patient: string;
  modality: string;
  findingKey: 'opacity' | 'cardiomegaly' | 'consolidation' | 'clear';
  aiHighlight: string;
  status: 'Pending Radiologist Sign-off' | 'Clinician Signed';
}

export type TradeRfqStatus = 'submitted' | 'quoted' | 'accepted';
export type TradeOrderStatus =
  | 'awaiting_payment'
  | 'payment_received'
  | 'in_preparation'
  | 'dispatched'
  | 'delivered';

export interface TradeRfq {
  ref: string;
  sample?: boolean;
  t: number;
  lines: { id: string; qty: number }[];
  incoterm: string;
  destination: string;
  notes: string;
  status: TradeRfqStatus;
  quote?: {
    ref: string;
    t: number;
    lines: { id: string; qty: number; unitUsd: number }[];
    freightUsd: number;
    lead: string;
    terms: string;
  };
}

export interface TradeOrder {
  ref: string;
  sample?: boolean;
  quoteRef: string;
  t: number;
  lines: { id: string; qty: number; unitUsd: number }[];
  freightUsd: number;
  incoterm: string;
  destination: string;
  status: TradeOrderStatus;
  awb?: string;
  invoices: { ref: string; kind: string; status: string }[];
  history: { status: TradeOrderStatus; t: number }[];
}

export interface PharmaAuditRecord {
  batch: string;
  product: string;
  status: 'Released · QA Verified' | 'Cold-Chain QA Check' | 'Hold · Investigation';
  date: string;
}

export interface RecallNotice {
  ref: string;
  batch: string;
  product: string;
  area?: TherapeuticArea | 'All';
  severity?: 'Class I' | 'Class II' | 'Class III';
  issuedDate?: string;
  affectedLots?: number;
  acknowledged?: boolean;
  scope: string;
  status: string;
}

export interface PharmaMarketMetric {
  id: string;
  area: TherapeuticArea;
  region: 'Bangladesh' | 'Southeast Asia' | 'East Africa';
  demandIndex: number;
  yoyGrowthPct: number;
  monthlyScriptsK: number;
  coldChainSharePct: number;
  marketSharePct: number;
  topMolecule: string;
}

export interface PharmacovigilanceReport {
  ref: string;
  sample?: boolean;
  t: number;
  reporter: string;
  product: string;
  severity: 'Mild' | 'Moderate' | 'Serious';
  description: string;
  status: 'Received' | 'Under Safety Review';
}

export interface InsuranceClaim {
  id: string;
  patient: string;
  hospital: string;
  procedure: string;
  billedBdt: number;
  benchmarkBdt: number;
  duplicateCodeFlag: boolean;
  unbundledBillingFlag: boolean;
  priorAuthMatch: boolean;
  status: 'Pending Triage' | 'Approved for Settlement' | 'Flagged for Audit';
}

export interface EnquiryRecord {
  ref: string;
  sample?: boolean;
  t: number;
  kind: string;
  org: string;
  contact: string;
  email: string;
  country: string;
  notes: string;
}

export interface AuditEntry {
  t: number;
  role: string;
  action: string;
  ref: string;
}

export type RegulatoryAuthority =
  | 'DGDA'
  | 'EMA'
  | 'PMDA'
  | 'TGA'
  | 'Swissmedic'
  | 'Health Canada'
  | 'UK MHRA'
  | 'NMPA (China)';

export type MoleculeModality =
  | 'mAb (Biologic)'
  | 'NIB (Kinase / Targeted)'
  | 'Peptide / GLP-1'
  | 'Small Molecule';

export type LauncherCategory =
  | 'First Generic Launcher'
  | 'Global Generic Launcher'
  | 'Originator Innovator';

export interface GenericReleaseItem {
  id: string;
  molecule: string;
  genericBrand: string;
  originator: string;
  firstMoverCompany: string;
  originCountry: string;
  therapeuticArea: TherapeuticArea;
  therapeuticClass: string;
  modality: MoleculeModality;
  launcherCategory: LauncherCategory;
  releaseStage: 'Released Globally' | 'Early Access / NPA' | 'Upcoming Radar';
  regulators: RegulatoryAuthority[];
  latestRegulatoryTrend: string;
  indications: string[];
  affectedPatientGroup: string;
  estimatedPatientPoolM: number;
  marketDemandUsdM: number;
  launchFocusScore: number;
  recommendedNextFocus: boolean;
  patentContext: string;
  accessPathway: 'Named Patient Access' | 'Compassionate Use' | 'NPA & Compassionate Use';
  year: string;
  summary: string;
  partnerRadarNote: string;
  estimatedNpaDemandScore: number;
  aiSummaryUsage: string;
  sideEffectsSummary: string;
  researchUpdate: string;
}

export interface PartnerSession {
  company: string;
  email: string;
  tier: string;
  signedInAt: number;
}

export interface PatientVitalReading {
  id: string;
  dateLabel: string;
  isoDate: string;
  fastingGlucoseMgDl: number;
  postMealGlucoseMgDl: number;
  hba1cPct: number;
  systolicMmHg: number;
  diastolicMmHg: number;
  heartRateBpm: number;
  ldlMgDl: number;
  hdlMgDl: number;
  weightKg: number;
  bmi: number;
  source: string;
}

export interface PatientPrescription {
  id: string;
  productId: string;
  medicationName: string;
  strength: string;
  dosageSchedule: string;
  prescriber: string;
  clinic: string;
  therapeuticArea: TherapeuticArea;
  refillsRemaining: number;
  nextRefillDate: string;
  status: 'Active' | 'Refill Due' | 'Cold-Chain';
}

export type HospitalSourcingCategory =
  | 'Unapproved / Unavailable Medicine'
  | 'Hospital Beds'
  | 'Clinical Equipment & Devices'
  | 'Robotic Surgery Systems';

export type SourcingOriginHub =
  | 'China NMPA Originator Hub'
  | 'China MedTech Partner'
  | 'Turkey MedTech Partner';

export type HospitalSourcingRequestStatus =
  | 'Submitted'
  | 'DGDA Filing / Partner Quote'
  | 'Approved / In Transit';

export interface HospitalSourcingCatalogItem {
  id: string;
  name: string;
  category: HospitalSourcingCategory;
  originHub: SourcingOriginHub;
  partnerRegion: 'China' | 'Turkey';
  partnerName: string;
  referenceBenchmarkPriceUsd: number;
  directSourcingPriceUsd: number;
  priceAdvantageNote: string;
  dgdaNpaEligible: boolean;
  dgdaPathwayNote: string;
  regulatoryCertifications: string[];
  leadTimeWeeks: string;
  clinicalSpec: string;
  sampleDataDisclaimer: string;
}

export interface HospitalSourcingRequest {
  ref: string;
  sample?: boolean;
  t: number;
  hospitalName: string;
  requestedByRole: ProviderRole;
  category: HospitalSourcingCategory;
  originHub: SourcingOriginHub;
  itemName: string;
  quantity: number;
  dgdaAssistance: boolean;
  patientOrDeptContext: string;
  status: HospitalSourcingRequestStatus;
}

