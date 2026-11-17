import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  Globe,
  Lock,
  LogOut,
  PackageCheck,
  Radar,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GLOBAL_GENERIC_RELEASES, PHARMA_MARKET_METRICS, PRODUCTS } from '../data/seed';
import type {
  GenericReleaseItem,
  MoleculeModality,
  PartnerSession,
  PharmaAuditRecord,
  PharmacovigilanceReport,
  RecallNotice,
  RegulatoryAuthority,
  TherapeuticArea,
  TradeOrder,
  TradeOrderStatus,
  TradeRfq,
} from '../types/nirog';
import {
  authenticatePartnerCompany,
  filterGenericLaunches,
  filterPortfolioRecalls,
  fmtUSD,
  REGULATORY_AUTHORITIES,
  summarizeLaunchMonitorOpportunities,
  summarizeTradeOrders,
  validateTradeLineQty,
} from '../utils/logic';
import { MarketInsights } from './MarketInsights';
import { SubBanner } from './SubBanner';
import { PharmaCanvas, type PharmaAssetKind } from './three/PharmaCanvas';

interface PharmaTradeViewProps {
  audits: PharmaAuditRecord[];
  recalls: RecallNotice[];
  pvReports: PharmacovigilanceReport[];
  rfqs: TradeRfq[];
  tradeOrders: TradeOrder[];
  partnerSession: PartnerSession | null;
  sharedBriefIds?: string[];
  initialTab?: 'intel' | 'radar' | 'qa' | 'trade';
  onPartnerSignIn: (session: PartnerSession) => void;
  onPartnerSignOut: () => void;
  onPublishClinicianBrief?: (item: GenericReleaseItem) => void;
  onVerifyAudit: (batch: string) => void;
  onTriggerRecall: (
    batch: string,
    product: string,
    scope: string,
    area?: TherapeuticArea,
    severity?: 'Class I' | 'Class II' | 'Class III'
  ) => void;
  onAcknowledgeRecall: (refNo: string) => void;
  onSubmitRfq: (lines: { id: string; qty: number }[], incoterm: string, destination: string, notes: string) => string;
  onAcceptQuote: (rfqRef: string) => string;
}

type PharmaTab = 'intel' | 'radar' | 'qa' | 'trade';

const ORDER_STEPS: { key: TradeOrderStatus; label: string }[] = [
  { key: 'awaiting_payment', label: 'Payment Pending' },
  { key: 'payment_received', label: 'Paid' },
  { key: 'in_preparation', label: 'Prep & QA' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
];

const SKU_3D_PRESETS: { id: string; kind: PharmaAssetKind; title: string; batch: string; cold: boolean }[] = [
  { id: 'tra440', kind: 'vial', title: 'Trastuzumab 440 mg Sterile Vial', batch: 'EBR-2026-052', cold: true },
  { id: 'gla100', kind: 'pen', title: 'Insulin Glargine 100 U/mL Pen', batch: 'EBR-2026-049', cold: true },
  { id: 'ato20', kind: 'tablet', title: 'Atorvastatin 20 mg GMP Blister', batch: 'EBR-2026-041', cold: false },
];

export const PharmaTradeView: React.FC<PharmaTradeViewProps> = ({
  audits,
  recalls,
  pvReports,
  rfqs,
  tradeOrders,
  partnerSession,
  sharedBriefIds = [],
  initialTab = 'intel',
  onPartnerSignIn,
  onPartnerSignOut,
  onPublishClinicianBrief,
  onVerifyAudit,
  onTriggerRecall,
  onAcknowledgeRecall,
  onSubmitRfq,
  onAcceptQuote,
}) => {
  const [tab, setTab] = useState<PharmaTab>(initialTab);
  const [areaFilter, setAreaFilter] = useState<TherapeuticArea | 'All'>('All');
  const [regionFilter, setRegionFilter] = useState<'All' | 'Bangladesh' | 'Southeast Asia' | 'East Africa'>('All');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | TradeOrderStatus>('all');
  const [selected3dIdx, setSelected3dIdx] = useState(0);

  // Partner Sign-in & Generic Launch Monitor state
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPasskey, setPartnerPasskey] = useState('');
  const [partnerOrgInput, setPartnerOrgInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [radarQuery, setRadarQuery] = useState('');
  const [radarStage, setRadarStage] = useState<'All' | GenericReleaseItem['releaseStage']>('All');
  const [radarModality, setRadarModality] = useState<MoleculeModality | 'All'>('All');
  const [radarRegulator, setRadarRegulator] = useState<RegulatoryAuthority | 'All'>('All');
  const [watchedIds, setWatchedIds] = useState<Record<string, boolean>>({
    'rel-pembro-mab': true,
    'rel-semaglutide-pep': true,
    'rel-orforglipron': true,
  });

  // Recall form state
  const [recallBatch, setRecallBatch] = useState('');
  const [recallProd, setRecallProd] = useState('');
  const [recallArea, setRecallArea] = useState<TherapeuticArea>('Cardiovascular');
  const [recallSeverity, setRecallSeverity] = useState<'Class I' | 'Class II' | 'Class III'>('Class II');
  const [recallScope, setRecallScope] = useState('Distributors & Retail Pharmacies');

  // B2B Trade RFQ state
  const [draftLines, setDraftLines] = useState<Record<string, number>>({ ato20: 500, met500: 1000 });
  const [incoterm, setIncoterm] = useState('CIP');
  const [destination, setDestination] = useState('Phnom Penh');
  const [notes, setNotes] = useState('');
  const [tradeMsg, setTradeMsg] = useState('');
  const [tradeErr, setTradeErr] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const filteredMetrics = useMemo(
    () =>
      PHARMA_MARKET_METRICS.filter(
        (m) => (areaFilter === 'All' || m.area === areaFilter) && (regionFilter === 'All' || m.region === regionFilter)
      ),
    [areaFilter, regionFilter]
  );

  const filteredRecalls = useMemo(
    () => filterPortfolioRecalls(recalls, areaFilter),
    [recalls, areaFilter]
  );

  const filteredOrders = useMemo(
    () =>
      tradeOrders.filter((o) => {
        if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
        if (areaFilter === 'All') return true;
        return o.lines.some((l) => PRODUCTS.find((p) => p.id === l.id)?.area === areaFilter);
      }),
    [tradeOrders, orderStatusFilter, areaFilter]
  );

  const radarItems = useMemo(
    () =>
      filterGenericLaunches(
        GLOBAL_GENERIC_RELEASES,
        radarQuery,
        areaFilter,
        radarStage,
        radarModality,
        radarRegulator
      ),
    [radarQuery, areaFilter, radarStage, radarModality, radarRegulator]
  );

  const launchSummary = useMemo(
    () => summarizeLaunchMonitorOpportunities(radarItems),
    [radarItems]
  );

  const tradeSummary = useMemo(() => summarizeTradeOrders(tradeOrders), [tradeOrders]);

  const totalScriptsK = filteredMetrics.reduce((acc, m) => acc + m.monthlyScriptsK, 0);
  const avgGrowth =
    filteredMetrics.length > 0
      ? (filteredMetrics.reduce((acc, m) => acc + m.yoyGrowthPct, 0) / filteredMetrics.length).toFixed(1)
      : '0.0';
  const unackRecallCount = filteredRecalls.filter((r) => !r.acknowledged).length;

  const handlePartnerLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = authenticatePartnerCompany(partnerEmail, partnerPasskey, partnerOrgInput);
    if (!res.ok) {
      setLoginError(res.error);
      return;
    }
    onPartnerSignIn(res.session);
    setPartnerEmail('');
    setPartnerPasskey('');
    setPartnerOrgInput('');
  };

  const handleDemoPartnerLogin = () => {
    setLoginError('');
    const res = authenticatePartnerCompany(
      'bd@beaconpharma.example',
      'NRG-PARTNER-2026',
      'Beacon Pharmaceuticals Ltd. (Partner)'
    );
    if (res.ok) onPartnerSignIn(res.session);
  };

  const handleRecall = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recallBatch.trim() || !recallProd.trim()) return;
    onTriggerRecall(recallBatch.trim(), recallProd.trim(), recallScope, recallArea, recallSeverity);
    setRecallBatch('');
    setRecallProd('');
  };

  const handleRfqSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTradeErr('');
    setTradeMsg('');
    const lines = Object.entries(draftLines)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({ id, qty }));

    if (lines.length === 0) {
      setTradeErr('Enter quantity for at least one trade product.');
      return;
    }
    for (const l of lines) {
      const prod = PRODUCTS.find((p) => p.id === l.id)!;
      const check = validateTradeLineQty(prod, l.qty);
      if (!check.ok) {
        setTradeErr(`${prod.generic} ${prod.strength}: ${check.error}`);
        return;
      }
    }
    if (!destination.trim()) {
      setTradeErr('Destination port or city is required.');
      return;
    }
    const refNo = onSubmitRfq(lines, incoterm, destination.trim(), notes.trim());
    setTradeMsg(`RFQ ${refNo} submitted. Issue a formal quotation from the Staff Console.`);
    setNotes('');
  };

  const activePreset = SKU_3D_PRESETS[selected3dIdx];

  return (
    <div>
      <SubBanner
        focusNode="pharma"
        eyebrow="Pharmaceutical Company Dashboard"
        title="Market insights, B2B trade tracking, recalls, and Generic Launch Radar."
        lede="Enterprise intelligence for pharmaceutical manufacturers: Recharts demand & YoY growth lines, B2B purchase order milestones, portfolio recall alerts, and partner-only generic launch tracking."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-1">
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Pharmaceutical Dashboard Views">
            {[
              ['intel', 'Executive Pharma Dashboard'],
              ['radar', 'Generic Launch Monitor'],
              ['qa', 'QA/QC e-Batch & Recall Console'],
              ['trade', 'B2B Trade RFQ & Orders'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id as PharmaTab)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-[5px] inline-flex items-center gap-1.5 ${
                  tab === id
                    ? 'border-cyan-700 text-cyan-800 bg-cyan-50/70'
                    : 'border-transparent text-slate-600 hover:text-[#071e26]'
                }`}
              >
                {id === 'radar' && !partnerSession && <Lock className="w-3.5 h-3.5 text-slate-500" />}
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Portfolio & Region Context Filters */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <label htmlFor="pharma-area-filter" className="text-xs font-mono uppercase text-slate-500">
              Portfolio:
            </label>
            <select
              id="pharma-area-filter"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value as TherapeuticArea | 'All')}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#071e26]"
            >
              <option value="All">All Therapeutic Areas</option>
              <option value="Oncology">Oncology</option>
              <option value="Cardiovascular">Cardiovascular</option>
              <option value="Diabetes">Diabetes</option>
              <option value="Anti-infective">Anti-infective</option>
              <option value="Respiratory">Respiratory</option>
              <option value="Gastrointestinal">Gastrointestinal</option>
            </select>

            <label htmlFor="pharma-region-filter" className="text-xs font-mono uppercase text-slate-500 ml-1">
              Market:
            </label>
            <select
              id="pharma-region-filter"
              value={regionFilter}
              onChange={(e) =>
                setRegionFilter(e.target.value as 'All' | 'Bangladesh' | 'Southeast Asia' | 'East Africa')
              }
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-[#071e26]"
            >
              <option value="All">All Regions</option>
              <option value="Bangladesh">Bangladesh</option>
              <option value="Southeast Asia">Southeast Asia</option>
              <option value="East Africa">East Africa</option>
            </select>
          </div>
        </div>

        {/* Active Recall Priority Banner when unacknowledged alerts exist */}
        {unackRecallCount > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-4 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <strong>
                  {unackRecallCount} Active Portfolio Recall Alert{unackRecallCount > 1 ? 's' : ''} Requiring Action
                </strong>
                <span className="block text-xs text-amber-900 mt-0.5">
                  Review batch quarantine scope below or dispatch updated distributor notices from the QA/QC console.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTab('qa')}
              className="px-3.5 py-2 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800 whitespace-nowrap"
            >
              Open QA/QC Console
            </button>
          </div>
        )}

        {/* TAB 1: EXECUTIVE PHARMA DASHBOARD */}
        {tab === 'intel' && (
          <div className="space-y-6">
            {/* Enterprise KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                  Market Research Velocity
                </div>
                <div className="text-2xl font-bold text-cyan-800 tabular-nums mt-1">
                  {totalScriptsK.toLocaleString('en-US')}K{' '}
                  <span className="text-sm font-semibold text-emerald-700">+{avgGrowth}% YoY</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">Monthly consented prescriptions (demo index)</div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                  B2B Trade Book Value
                </div>
                <div className="text-2xl font-bold text-[#071e26] tabular-nums mt-1">
                  {fmtUSD(tradeSummary.totalUsd)}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {tradeSummary.totalOrders} POs · {tradeSummary.inTransitCount} active in prep / transit
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                  Portfolio Recall Alerts
                </div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                  {filteredRecalls.length}{' '}
                  <span className="text-sm font-medium text-slate-600">({unackRecallCount} pending)</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Filtered to {areaFilter === 'All' ? 'entire portfolio' : areaFilter}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                  QA/QC &amp; Safety Signals
                </div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                  {audits.filter((a) => a.status.startsWith('Released')).length}/{audits.length} Released
                </div>
                <div className="text-xs text-slate-600 mt-1">{pvReports.length} pharmacovigilance report(s) logged</div>
              </div>
            </div>

            {/* Recharts Multi-Line Market Insights Component */}
            <MarketInsights
              areaFilter={areaFilter}
              regionFilter={regionFilter}
              onResetFilters={() => {
                setAreaFilter('All');
                setRegionFilter('All');
              }}
            />

            {/* Partner Launch Monitor Quick Entry Banner */}
            <div className="rounded-xl border border-cyan-500/30 bg-[#03151c] text-white p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Radar className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                    Global Regulatory Generic Monitor · {partnerSession ? `Unlocked (${partnerSession.company})` : 'Partner Sign-In'}
                  </div>
                  <div className="text-base font-bold mt-0.5">
                    mAbs, NIBs &amp; Peptides · DGDA, EMA, PMDA, TGA, Swissmedic, Health Canada, UK MHRA &amp; NMPA
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Identify next-to-launch molecules, assess addressable patient cohorts &amp; market demand ($M), and publish educational research briefs to doctors and hospitals.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab('radar')}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5"
              >
                {!partnerSession && <Lock className="w-3.5 h-3.5" />}
                <span>{partnerSession ? 'Open Launch Monitor' : 'Partner Sign-In for Launch Monitor'}</span>
              </button>
            </div>

            {/* Row 1: Market Research Data + 3D Studio PBR SKU Formulation Inspector */}
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-cyan-700" />
                      <span>Market Research &amp; Regional Demand Cohorts</span>
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      De-identified prescribing cohorts &amp; cold-chain growth velocity across NIROG partner networks (synthetic data).
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-500">{filteredMetrics.length} market cohorts</span>
                </div>

                {/* Visual Demand Index Bars */}
                <div className="space-y-3 text-xs">
                  {filteredMetrics.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                        <span>
                          {m.area} · <span className="text-slate-500 font-normal">{m.region} — {m.topMolecule}</span>
                        </span>
                        <span className="font-mono tabular-nums text-cyan-800">
                          {m.demandIndex}/100 idx · +{m.yoyGrowthPct}% YoY
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-cyan-700 rounded-full transition-all" style={{ width: `${m.demandIndex}%` }} />
                      </div>
                    </div>
                  ))}
                  {filteredMetrics.length === 0 && (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No synthetic market cohorts match this exact portfolio and region combination.
                    </p>
                  )}
                </div>

                {/* Detailed Market Research Matrix */}
                {filteredMetrics.length > 0 && (
                  <div className="overflow-x-auto pt-2 border-t border-slate-100">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 font-mono uppercase text-slate-500">
                          <th className="py-2 pr-3">Therapeutic Area</th>
                          <th className="py-2 pr-3">Region</th>
                          <th className="py-2 pr-3 text-right">Monthly Rx</th>
                          <th className="py-2 pr-3 text-right">Cold-Chain</th>
                          <th className="py-2 text-right">Share</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMetrics.map((m) => (
                          <tr key={m.id}>
                            <td className="py-2.5 pr-3 font-semibold text-[#071e26]">{m.area}</td>
                            <td className="py-2.5 pr-3 text-slate-600">{m.region}</td>
                            <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.monthlyScriptsK}K</td>
                            <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{m.coldChainSharePct}%</td>
                            <td className="py-2.5 text-right font-mono font-semibold text-cyan-800 tabular-nums">
                              {m.marketSharePct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Interactive 3D Studio PBR Formulation & Batch Inspector */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold">3D Studio Formulation Inspector</h2>
                    <p className="text-xs text-slate-600">Inspect primary packaging &amp; cold-chain telemetry.</p>
                  </div>
                  <TrendingUp className="w-4 h-4 text-cyan-700 shrink-0" />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {SKU_3D_PRESETS.map((preset, idx) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelected3dIdx(idx)}
                      aria-pressed={selected3dIdx === idx}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        selected3dIdx === idx
                          ? 'bg-cyan-700 border-cyan-700 text-white'
                          : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-600'
                      }`}
                    >
                      {preset.kind === 'vial' ? 'Biologic Vial' : preset.kind === 'pen' ? 'Insulin Pen' : 'Blister Pack'}
                    </button>
                  ))}
                </div>

                <PharmaCanvas
                  assetKind={activePreset.kind}
                  title={activePreset.title}
                  batchCode={activePreset.batch}
                  coldChain={activePreset.cold}
                />
              </div>
            </div>

            {/* Row 2: Live B2B Trade Order Tracker + Active Product Recall Notifications */}
            <div className="grid lg:grid-cols-12 gap-6 items-start">
              {/* B2B Trade Order Status Tracker */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <PackageCheck className="w-5 h-5 text-cyan-700" />
                      <span>B2B Trade Order Tracking ({filteredOrders.length})</span>
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Real-time status milestones for purchase orders placed via the B2B Trade Portal (
                      {rfqs.filter((r) => r.status !== 'accepted').length} open RFQs).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Filter B2B trade orders by status"
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value as 'all' | TradeOrderStatus)}
                      className="h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                    >
                      <option value="all">All Statuses</option>
                      {ORDER_STEPS.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTab('trade')}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline whitespace-nowrap"
                    >
                      <span>New RFQ</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredOrders.map((o) => {
                    const orderTotal = o.lines.reduce((acc, l) => acc + l.qty * l.unitUsd, 0) + (o.freightUsd || 0);
                    const stepIdx = ORDER_STEPS.findIndex((s) => s.key === o.status);
                    return (
                      <article key={o.ref} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-[#f8fafa]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-[#071e26]">{o.ref}</span>
                              <span className="text-xs text-slate-500">· Quote {o.quoteRef}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {o.incoterm} {o.destination} ·{' '}
                              {o.lines
                                .map((l) => `${PRODUCTS.find((p) => p.id === l.id)?.generic || l.id} × ${l.qty}`)
                                .join(', ')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm font-bold text-cyan-800 tabular-nums">
                              {fmtUSD(orderTotal)}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {o.awb ? `AWB ${o.awb}` : 'AWB pending dispatch'}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-1.5 pt-1">
                          {ORDER_STEPS.map((st, idx) => {
                            const done = idx <= stepIdx;
                            return (
                              <div key={st.key} className="space-y-1">
                                <div className={`h-1.5 rounded-full ${done ? 'bg-cyan-700' : 'bg-slate-200'}`} />
                                <div
                                  className={`text-[10px] font-mono truncate ${
                                    done ? 'text-[#071e26] font-semibold' : 'text-slate-400'
                                  }`}
                                >
                                  {st.label}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                  {filteredOrders.length === 0 && (
                    <p className="text-sm text-slate-500 py-4 text-center">
                      No B2B trade orders match the current portfolio or status filter.
                    </p>
                  )}
                </div>
              </div>

              {/* Active Product Recall Notifications Relevant to Portfolio */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-amber-700" />
                      <span>Active Portfolio Recalls ({filteredRecalls.length})</span>
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Lot holds and distributor advisories relevant to selected portfolio.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredRecalls.map((r) => (
                    <article
                      key={r.ref}
                      className={`rounded-xl border p-4 space-y-2.5 ${
                        r.acknowledged
                          ? 'border-slate-200 bg-slate-50'
                          : r.severity === 'Class I'
                          ? 'border-red-300 bg-red-50/70'
                          : 'border-amber-300 bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <div>
                          <span className="font-mono font-bold text-[#071e26]">
                            {r.ref} · {r.severity || 'Class II'}
                          </span>
                          <span className="text-slate-500 ml-2">{r.issuedDate || 'Current'}</span>
                        </div>
                        <span
                          className={`font-semibold ${
                            r.acknowledged
                              ? 'text-emerald-700'
                              : r.severity === 'Class I'
                              ? 'text-red-800'
                              : 'text-amber-800'
                          }`}
                        >
                          {r.acknowledged ? 'Acknowledged' : 'Action Pending'}
                        </span>
                      </div>

                      <div>
                        <div className="text-sm font-bold text-[#071e26]">{r.product}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Batch <span className="font-mono font-semibold">{r.batch}</span> ·{' '}
                          {r.area || 'Portfolio'} · {r.affectedLots ? `${r.affectedLots} packs` : 'Verified lot'}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">Scope: {r.scope}</div>
                        <div className="text-xs font-semibold text-slate-700 mt-1">{r.status}</div>
                      </div>

                      {!r.acknowledged ? (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeRecall(r.ref)}
                          className="w-full py-2 px-3 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430] transition-colors"
                        >
                          Acknowledge &amp; Log Quarantine Compliance
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Distributor Hold Verified in Audit Ledger</span>
                        </div>
                      )}
                    </article>
                  ))}
                  {filteredRecalls.length === 0 && (
                    <p className="text-sm text-slate-500 py-4 text-center">No active recall notices for {areaFilter}.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PARTNER-ONLY GENERIC LAUNCH MONITOR */}
        {tab === 'radar' && (
          <div id="launch-radar" className="space-y-6 scroll-mt-24" data-testid="generic-launch-radar">
            {!partnerSession ? (
              <div className="grid lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 bg-[#03151c] text-white rounded-2xl p-6 sm:p-8 border border-cyan-500/20 space-y-4">
                  <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-cyan-300">
                    <Lock className="w-4 h-4" />
                    <span>Partner Companies Only · Sign-In Required</span>
                  </div>
                  <h2 className="text-2xl font-bold">
                    Generic Launch Monitor · mAbs, NIBs &amp; Peptides Across 8 Agencies
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Monitor approvals and regulatory momentum across <strong>DGDA, EMA, PMDA, TGA, Swissmedic, Health Canada, UK MHRA, and NMPA (China)</strong>. Evaluate addressable patient populations, market demand ($M), and share compliant clinical briefs directly to hospital doctors.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 pt-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Next-to-launch focus scoring across mAbs, selective NIBs, and GLP-1 peptides</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Check indication-level disease prevalence, patient cohort size, and global demand ($M)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Publish educational research &amp; AI usage briefs to physicians for first/global generics &amp; innovators</span>
                    </li>
                  </ul>
                </div>

                <form
                  onSubmit={handlePartnerLoginSubmit}
                  className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
                >
                  <div>
                    <h3 className="text-lg font-bold text-[#071e26]">Partner Company Sign-In</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Sign in with your partner credentials or use the verified demo partner button.
                    </p>
                  </div>

                  {loginError && (
                    <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-xs text-red-800">
                      {loginError}
                    </div>
                  )}

                  <div>
                    <label htmlFor="partner-org" className="block text-xs font-semibold mb-1">
                      Company Name (Optional)
                    </label>
                    <input
                      id="partner-org"
                      type="text"
                      value={partnerOrgInput}
                      onChange={(e) => setPartnerOrgInput(e.target.value)}
                      placeholder="e.g. Beacon Pharmaceuticals Ltd."
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-email" className="block text-xs font-semibold mb-1">
                      Partner Work Email
                    </label>
                    <input
                      id="partner-email"
                      type="email"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                      placeholder="partner@company.com"
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="partner-passkey" className="block text-xs font-semibold mb-1">
                      Partner Access Passkey
                    </label>
                    <input
                      id="partner-passkey"
                      type="password"
                      value={partnerPasskey}
                      onChange={(e) => setPartnerPasskey(e.target.value)}
                      placeholder="Min. 6 characters"
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold transition-colors"
                  >
                    Sign In to Generic Launch Monitor
                  </button>

                  <div className="pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleDemoPartnerLogin}
                      className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Quick Demo Sign-In · Beacon Pharmaceuticals Partner
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Signed-in Partner Header */}
                <div className="bg-white border border-cyan-600/30 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">
                      Authenticated Partner Session · {partnerSession.tier}
                    </div>
                    <h2 className="text-lg font-bold text-[#071e26] mt-0.5">
                      {partnerSession.company} ({partnerSession.email})
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onPartnerSignOut}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>

                {/* Launch Monitor Overview Strip + Recharts Priority & Market Demand Chart */}
                <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 scroll-mt-24">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-[#071e26] flex items-center gap-2">
                        <Radar className="w-5 h-5 text-cyan-700" />
                        <span>Next-to-Launch Focus · Market Demand &amp; Patient Cohorts</span>
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Ranking emerging <strong>mAbs, NIBs &amp; Peptides</strong> across DGDA, EMA, PMDA, TGA, Swissmedic, Health Canada, UK MHRA, and NMPA (China).
                      </p>
                    </div>
                    <span className="text-xs font-mono text-slate-500">
                      {radarItems.length} molecules matched
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 sm:gap-y-0 sm:divide-x divide-slate-200 border-y border-slate-200 py-3">
                    <div className="pr-3 sm:pl-0">
                      <span className="text-xs text-slate-500 block">Recommended Next Focus</span>
                      <span className="text-base sm:text-lg font-bold text-emerald-700 font-mono tabular-nums">
                        {launchSummary.recommendedCount} molecules
                      </span>
                    </div>
                    <div className="pl-3 sm:px-3">
                      <span className="text-xs text-slate-500 block">Addressable Market Demand</span>
                      <span className="text-base sm:text-lg font-bold text-cyan-800 font-mono tabular-nums">
                        US$ {launchSummary.totalDemandUsdM.toLocaleString('en-US')}M
                      </span>
                    </div>
                    <div className="pr-3 sm:px-3">
                      <span className="text-xs text-slate-500 block">Patient Size Affected</span>
                      <span className="text-base sm:text-lg font-bold text-[#071e26] font-mono tabular-nums">
                        {launchSummary.totalPatientPoolM.toLocaleString('en-US')}M pts
                      </span>
                    </div>
                    <div className="pl-3 sm:pr-0">
                      <span className="text-xs text-slate-500 block">Regulatory Agencies</span>
                      <span className="text-base sm:text-lg font-bold text-[#071e26] font-mono tabular-nums">
                        8 Authorities
                      </span>
                    </div>
                  </div>

                  {launchSummary.chartPoints.length > 0 && (
                    <div className="w-full h-[240px]" data-testid="launch-monitor-chart">
                      <ResponsiveContainer width="100%" height={240} minWidth={0}>
                        <ComposedChart data={launchSummary.chartPoints} margin={{ top: 10, right: 16, left: -8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: '#0e7490' }}
                            stroke="#cbd5e1"
                            unit="M"
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[60, 100]}
                            tick={{ fontSize: 11, fill: '#059669' }}
                            stroke="#cbd5e1"
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const p = payload[0]?.payload;
                              if (!p) return null;
                              return (
                                <div className="rounded-lg bg-[#03151c] border border-cyan-500/40 px-3.5 py-2.5 text-xs text-slate-100 shadow-lg space-y-1">
                                  <div className="font-mono font-bold text-cyan-300">{p.molecule}</div>
                                  <div className="text-slate-300">{p.modality} · {p.regulatorCount}/8 agencies</div>
                                  <div className="font-mono">Market Demand: US$ {p.marketDemandUsdM}M</div>
                                  <div className="font-mono text-emerald-300">Launch Focus Score: {p.launchFocusScore}/100</div>
                                  <div className="font-mono text-slate-300">Patient Group: ~{p.estimatedPatientPoolM}M</div>
                                </div>
                              );
                            }}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="marketDemandUsdM"
                            name="Market Demand ($M)"
                            fill="#0e7490"
                            radius={[4, 4, 0, 0]}
                            barSize={32}
                            maxBarSize={42}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="launchFocusScore"
                            name="Launch Priority Score"
                            stroke="#059669"
                            strokeWidth={2.5}
                            dot={{ r: 3.5, fill: '#059669' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 8-Authority Regulatory Filter Strip */}
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-mono uppercase text-slate-500">
                      Filter by Regulatory Authority Trend (DGDA, EMA, PMDA, TGA, Swissmedic, Health Canada, UK MHRA, NMPA)
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by regulatory authority">
                      <button
                        type="button"
                        aria-pressed={radarRegulator === 'All'}
                        onClick={() => setRadarRegulator('All')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          radarRegulator === 'All'
                            ? 'bg-[#03151c] border-[#03151c] text-white'
                            : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-700'
                        }`}
                      >
                        All Agencies ({GLOBAL_GENERIC_RELEASES.length})
                      </button>
                      {REGULATORY_AUTHORITIES.map((auth) => {
                        const count = GLOBAL_GENERIC_RELEASES.filter((x) => x.regulators.includes(auth)).length;
                        const active = radarRegulator === auth;
                        return (
                          <button
                            key={auth}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setRadarRegulator(active ? 'All' : auth)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                              active
                                ? 'bg-cyan-700 border-cyan-700 text-white'
                                : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-cyan-700'
                            }`}
                          >
                            {auth} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Search, Modality & Stage Filter Controls */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                  <input
                    type="search"
                    aria-label="Search generic launch monitor molecules"
                    value={radarQuery}
                    onChange={(e) => setRadarQuery(e.target.value)}
                    placeholder="Search mAb, NIB, peptide, indication (NSCLC, COPD, MASH), or regulator..."
                    className="flex-1 min-w-[240px] h-10 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                  <select
                    aria-label="Filter molecule modality"
                    value={radarModality}
                    onChange={(e) => setRadarModality(e.target.value as MoleculeModality | 'All')}
                    className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="All">All Modalities (mAbs / NIBs / Peptides)</option>
                    <option value="mAb (Biologic)">mAb (Biologic)</option>
                    <option value="NIB (Kinase / Targeted)">NIB (Kinase / Targeted)</option>
                    <option value="Peptide / GLP-1">Peptide / GLP-1</option>
                    <option value="Small Molecule">Small Molecule</option>
                  </select>
                  <select
                    aria-label="Filter launch stage"
                    value={radarStage}
                    onChange={(e) => setRadarStage(e.target.value as 'All' | GenericReleaseItem['releaseStage'])}
                    className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="All">All Launch Stages</option>
                    <option value="Released Globally">Released Globally</option>
                    <option value="Early Access / NPA">Early Access / NPA</option>
                    <option value="Upcoming Radar">Upcoming Radar</option>
                  </select>
                </div>

                {/* Partner Launch Monitor Molecule Grid */}
                <div className="grid md:grid-cols-2 gap-5">
                  {radarItems.map((item) => {
                    const watching = Boolean(watchedIds[item.id]);
                    const sharedWithDoctors = sharedBriefIds.includes(item.id);
                    return (
                      <article
                        key={item.id}
                        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-mono font-semibold text-cyan-800">
                              {item.modality} · {item.releaseStage}
                            </span>
                            <span className="font-mono font-bold text-emerald-700 tabular-nums">
                              Focus {item.launchFocusScore}/100 · US$ {item.marketDemandUsdM}M
                            </span>
                          </div>

                          <div>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h3 className="text-lg font-bold text-[#071e26] leading-snug">{item.molecule}</h3>
                              {item.recommendedNextFocus && (
                                <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                  Recommended Next Launch
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-cyan-800 mt-0.5">
                              {item.genericBrand} · <span className="text-slate-600">{item.launcherCategory}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">
                              {item.firstMoverCompany} · Originator: {item.originator}
                            </div>
                          </div>

                          {/* Regulatory Footprint Row */}
                          <div className="flex flex-wrap gap-1">
                            {item.regulators.map((reg) => (
                              <span
                                key={reg}
                                className="px-2 py-0.5 rounded border border-slate-200 bg-slate-50 font-mono text-[10px] font-semibold text-[#071e26]"
                              >
                                {reg}
                              </span>
                            ))}
                          </div>

                          <p className="text-xs text-slate-600 leading-relaxed">{item.latestRegulatoryTrend}</p>

                          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1.5">
                            <div>
                              <strong>Indications:</strong> {item.indications.join(' · ')}
                            </div>
                            <div>
                              <strong>Patient Size Affected:</strong> {item.affectedPatientGroup}
                            </div>
                            <div>
                              <strong>AI Usage &amp; Research Update:</strong> {item.researchUpdate}
                            </div>
                            <div className="text-cyan-900">
                              <strong>Strategy Note:</strong> {item.partnerRadarNote}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setWatchedIds((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                              }
                              aria-pressed={watching}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                watching
                                  ? 'bg-cyan-700 border-cyan-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-600'
                              }`}
                            >
                              <BellRing className="w-3.5 h-3.5" />
                              <span>{watching ? 'Watching' : 'Track Launch'}</span>
                            </button>

                            {onPublishClinicianBrief && (
                              <button
                                type="button"
                                onClick={() => onPublishClinicianBrief(item)}
                                aria-pressed={sharedWithDoctors}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                  sharedWithDoctors
                                    ? 'bg-emerald-700 border-emerald-700 text-white'
                                    : 'bg-white border-emerald-700 text-emerald-800 hover:bg-emerald-50'
                                }`}
                              >
                                {sharedWithDoctors ? <Sparkles className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                                <span>{sharedWithDoctors ? 'Shared to Doctors' : 'Share Brief to Doctors'}</span>
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setTab('trade')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:underline"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>B2B Trade RFQ</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {radarItems.length === 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                    <p className="text-sm text-slate-600">
                      No molecules match the active regulatory, modality, or search filters.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRadarQuery('');
                        setRadarModality('All');
                        setRadarRegulator('All');
                        setRadarStage('All');
                      }}
                      className="px-4 py-2 rounded-lg bg-[#03151c] text-white text-xs font-semibold"
                    >
                      Reset Launch Monitor Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QA/QC, RECALLS & SAFETY */}
        {tab === 'qa' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-lg font-bold">Electronic Batch Record (eBR) QA/QC Audits</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                        <th className="py-2 pr-4">Batch</th>
                        <th className="py-2 pr-4">Product</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {audits.map((a) => (
                        <tr key={a.batch}>
                          <td className="py-3 pr-4 font-mono text-xs font-bold">{a.batch}</td>
                          <td className="py-3 pr-4">{a.product}</td>
                          <td className="py-3 pr-4 text-xs font-semibold text-cyan-800">{a.status}</td>
                          <td className="py-3">
                            {a.status !== 'Released · QA Verified' ? (
                              <button
                                type="button"
                                onClick={() => onVerifyAudit(a.batch)}
                                className="px-3 py-1 rounded-lg bg-cyan-700 text-white text-xs font-semibold hover:bg-cyan-800"
                              >
                                QA Release
                              </button>
                            ) : (
                              <span className="text-xs text-emerald-700 font-semibold">Verified</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h3 className="text-base font-bold">Batch Recall Log</h3>
                {recalls.map((r) => (
                  <div key={r.ref} className="border border-slate-200 rounded-lg p-3 text-xs flex flex-wrap justify-between gap-2">
                    <div>
                      <strong className="font-mono">{r.ref}</strong> · {r.severity || 'Class II'} · Batch {r.batch} (
                      {r.product})
                      <span className="block text-slate-500 mt-0.5">Scope: {r.scope}</span>
                    </div>
                    <span className="font-semibold text-amber-700">{r.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleRecall} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold">Simulate Batch Recall Alert</h3>
              <div>
                <label htmlFor="rc-batch" className="block text-xs font-semibold mb-1">
                  Batch number
                </label>
                <input
                  id="rc-batch"
                  type="text"
                  value={recallBatch}
                  onChange={(e) => setRecallBatch(e.target.value)}
                  placeholder="e.g. DEMO-2417"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label htmlFor="rc-prod" className="block text-xs font-semibold mb-1">
                  Product
                </label>
                <input
                  id="rc-prod"
                  type="text"
                  value={recallProd}
                  onChange={(e) => setRecallProd(e.target.value)}
                  placeholder="Product name"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rc-area" className="block text-xs font-semibold mb-1">
                    Portfolio area
                  </label>
                  <select
                    id="rc-area"
                    value={recallArea}
                    onChange={(e) => setRecallArea(e.target.value as TherapeuticArea)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Oncology">Oncology</option>
                    <option value="Diabetes">Diabetes</option>
                    <option value="Anti-infective">Anti-infective</option>
                    <option value="Respiratory">Respiratory</option>
                    <option value="Gastrointestinal">Gastrointestinal</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rc-sev" className="block text-xs font-semibold mb-1">
                    Severity class
                  </label>
                  <select
                    id="rc-sev"
                    value={recallSeverity}
                    onChange={(e) => setRecallSeverity(e.target.value as 'Class I' | 'Class II' | 'Class III')}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    <option value="Class I">Class I (Urgent)</option>
                    <option value="Class II">Class II (Quarantine)</option>
                    <option value="Class III">Class III (Advisory)</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="rc-scope" className="block text-xs font-semibold mb-1">
                  Notification scope
                </label>
                <select
                  id="rc-scope"
                  value={recallScope}
                  onChange={(e) => setRecallScope(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  <option>Distributors &amp; Retail Pharmacies</option>
                  <option>Hospital Cold-Chain Accounts</option>
                </select>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold">
                Dispatch Simulated Recall Notice
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: B2B TRADE PORTAL */}
        {tab === 'trade' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-cyan-700">Approved Trade Account · ACC-DEMO</div>
                <h2 className="text-lg font-bold">Delta Care Distribution (Cambodia · Tier B 7% Discount)</h2>
                <p className="text-xs text-slate-600">Terms: Prepayment by bank transfer · Territory restrictions enforced per SKU.</p>
              </div>
              <span className="text-xs font-mono text-slate-500">Demo Enterprise Account</span>
            </div>

            {tradeErr && (
              <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-sm text-red-800">{tradeErr}</div>
            )}
            {tradeMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 text-sm text-emerald-900">{tradeMsg}</div>
            )}

            <form onSubmit={handleRfqSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <h3 className="text-base font-bold">Submit B2B Request for Quotation (RFQ)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                      <th className="py-2 pr-4">Product</th>
                      <th className="py-2 pr-4">List USD</th>
                      <th className="py-2 pr-4">MOQ / Mult</th>
                      <th className="py-2">Order Qty (Packs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {PRODUCTS.slice(0, 6).map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 pr-4 font-semibold">
                          {p.generic} {p.strength}{' '}
                          <span className="text-xs font-normal text-slate-500">({p.code})</span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">{fmtUSD(p.listUsd)}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                          {p.moq} / ×{p.mult}
                        </td>
                        <td className="py-2.5">
                          <input
                            type="number"
                            min={0}
                            step={p.mult}
                            aria-label={`Quantity for ${p.generic}`}
                            value={draftLines[p.id] || 0}
                            onChange={(e) =>
                              setDraftLines({ ...draftLines, [p.id]: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="w-28 h-9 px-2.5 rounded-lg border border-slate-300 font-mono text-sm text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="tr-inc" className="block text-xs font-semibold mb-1">
                    Incoterm
                  </label>
                  <select
                    id="tr-inc"
                    value={incoterm}
                    onChange={(e) => setIncoterm(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    {['EXW', 'FCA', 'CPT', 'CIP', 'FOB', 'CIF'].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="tr-dest" className="block text-xs font-semibold mb-1">
                    Destination port / city
                  </label>
                  <input
                    id="tr-dest"
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="tr-notes" className="block text-xs font-semibold mb-1">
                    Shipping notes
                  </label>
                  <input
                    id="tr-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <button type="submit" className="px-5 py-2.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white text-sm font-semibold">
                Submit RFQ
              </button>
            </form>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-base font-bold">Quotations &amp; RFQs ({rfqs.length})</h3>
                {rfqs.map((r) => (
                  <div key={r.ref} className="border border-slate-200 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex justify-between font-semibold">
                      <span className="font-mono">{r.ref}</span>
                      <span className="uppercase text-cyan-800">{r.status}</span>
                    </div>
                    <div className="text-slate-600">
                      {r.incoterm} · {r.destination} · {r.lines.length} SKU lines
                    </div>
                    {r.quote && (
                      <div className="bg-slate-50 rounded p-2.5 space-y-1.5">
                        <div>
                          <strong>Quote {r.quote.ref}:</strong> Freight {fmtUSD(r.quote.freightUsd)} · Lead: {r.quote.lead}
                        </div>
                        {r.status === 'quoted' && (
                          <button
                            type="button"
                            onClick={() => onAcceptQuote(r.ref)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white font-semibold"
                          >
                            Accept Quote &amp; Issue Purchase Order
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-base font-bold">Trade Purchase Orders ({tradeOrders.length})</h3>
                {tradeOrders.map((o) => (
                  <div key={o.ref} className="border border-slate-200 rounded-lg p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between font-semibold">
                      <span className="font-mono">{o.ref}</span>
                      <span className="uppercase text-emerald-700">{o.status.replace('_', ' ')}</span>
                    </div>
                    <div className="text-slate-600">
                      From {o.quoteRef} · {o.incoterm} {o.destination}
                      {o.awb ? ` · AWB ${o.awb}` : ''}
                    </div>
                    <div className="text-slate-500">
                      Documents: {o.invoices.map((inv) => `${inv.kind} (${inv.status})`).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
