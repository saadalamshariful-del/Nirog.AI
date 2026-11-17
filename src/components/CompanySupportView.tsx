import React, { useState } from 'react';
import { CheckCircle2, QrCode, ShieldAlert } from 'lucide-react';
import {
  ADVISORY_BOARD,
  BRAND,
  LEADERSHIP_TEAM,
  PRODUCTS,
} from '../data/seed';
import type {
  AuditEntry,
  EnquiryRecord,
  Order,
  OrderStatus,
  PharmacovigilanceReport,
  RouteId,
  SupportCase,
  TradeOrder,
  TradeOrderStatus,
  TradeRfq,
} from '../types/nirog';
import { fmtBDT, verifySerialCode } from '../utils/logic';
import { SubBanner } from './SubBanner';

/* ============================================================
   COMPANY, LEADERSHIP, INVESTORS & CONTACT VIEW
   ============================================================ */
interface CompanyViewProps {
  enquiries: EnquiryRecord[];
  onSubmitEnquiry: (e: Omit<EnquiryRecord, 'ref' | 't'>) => string;
  onNavigate: (route: RouteId) => void;
}

export const CompanyView: React.FC<CompanyViewProps> = ({ enquiries, onSubmitEnquiry, onNavigate }) => {
  const [kind, setKind] = useState('Hospital / Clinic Pilot');
  const [org, setOrg] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Bangladesh');
  const [notes, setNotes] = useState('');
  const [sentRef, setSentRef] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!org.trim() || !contact.trim() || !email.trim()) return;
    const refNo = onSubmitEnquiry({ kind, org: org.trim(), contact: contact.trim(), email: email.trim(), country, notes: notes.trim() });
    setSentRef(refNo);
    setOrg('');
    setContact('');
    setEmail('');
    setNotes('');
  };

  return (
    <div>
      <SubBanner
        focusNode="core"
        eyebrow="About NIROG.AI"
        title="Leadership, Advisors, and Seed Investment Roadmap."
        lede={`${BRAND.mission} Headquartered at ${BRAND.address}.`}
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-12">
        {/* Founding Leadership */}
        <section className="space-y-5">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-700">Founding Leadership</p>
            <h2 className="text-2xl font-bold mt-1">Executive Team</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LEADERSHIP_TEAM.map((m) => (
              <article key={m.name} className="bg-white border border-slate-200 rounded-xl p-5 flex gap-4 items-start">
                <div className="w-11 h-11 rounded-full bg-[#072430] text-cyan-300 font-bold text-sm flex items-center justify-center shrink-0">
                  {m.init}
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#071e26]">{m.name}</h3>
                  <div className="text-xs font-semibold text-cyan-700">
                    {m.role} · {m.equity}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{m.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Board of Advisors */}
        <section className="space-y-5">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-700">Governance &amp; Mentorship</p>
            <h2 className="text-2xl font-bold mt-1">Board of Advisors</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {ADVISORY_BOARD.map((a) => (
              <article key={a.name} className="bg-white border border-slate-200 rounded-xl p-5 flex gap-4 items-start">
                <div className="w-11 h-11 rounded-full bg-slate-800 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {a.init}
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#071e26]">{a.name}</h3>
                  <div className="text-xs font-semibold text-cyan-700">{a.role}</div>
                  <p className="text-xs text-slate-600 leading-relaxed">{a.bio}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Seed Round & Contact / Enquiry Form */}
        <section className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-700">Investment Overview</p>
              <h2 className="text-xl font-bold mt-1">Seed Round Context</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200">
                <div className="text-xs text-slate-500">Seed Capital Ask</div>
                <div className="font-bold text-lg text-cyan-700 tabular-nums">{BRAND.seedCapital}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200">
                <div className="text-xs text-slate-500">Equity Offered</div>
                <div className="font-bold text-lg text-cyan-700 tabular-nums">{BRAND.equityOffered}</div>
              </div>
            </div>
            <div className="text-sm text-slate-600 space-y-2">
              <div><strong>Post-money Valuation Basis:</strong> {BRAND.valuation}</div>
              <div><strong>Headquarters:</strong> {BRAND.address}</div>
              <div><strong>Contact Phone:</strong> {BRAND.phone}</div>
              <div><strong>Email:</strong> {BRAND.email}</div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 text-xs font-semibold hover:border-cyan-600"
            >
              View Enquiries inside Staff Console ({enquiries.length})
            </button>
          </div>

          <form onSubmit={handleSubmit} className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Partnership &amp; Investor Enquiry</h2>
            {sentRef && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 text-sm text-emerald-900">
                Enquiry <strong className="font-mono">{sentRef}</strong> logged to NIROG.AI operations queue.
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="enq-kind" className="block text-xs font-semibold mb-1">Enquiry Type</label>
                <select
                  id="enq-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                >
                  <option>Hospital / Clinic Pilot</option>
                  <option>Pharmaceutical Partner</option>
                  <option>Health Insurance Collaboration</option>
                  <option>Seed Investor Inquiry</option>
                  <option>Diagnostic Centre Integration</option>
                </select>
              </div>
              <div>
                <label htmlFor="enq-country" className="block text-xs font-semibold mb-1">Country</label>
                <input
                  id="enq-country"
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label htmlFor="enq-org" className="block text-xs font-semibold mb-1">Organization</label>
                <input
                  id="enq-org"
                  type="text"
                  required
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="Hospital, fund, or company"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label htmlFor="enq-contact" className="block text-xs font-semibold mb-1">Contact Name</label>
                <input
                  id="enq-contact"
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="enq-email" className="block text-xs font-semibold mb-1">Email</label>
                <input
                  id="enq-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="enq-notes" className="block text-xs font-semibold mb-1">Message / Scope</label>
                <textarea
                  id="enq-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
            <button type="submit" className="px-5 py-2.5 rounded-lg bg-[#03151c] text-white text-sm font-semibold hover:bg-[#072430]">
              Submit Enquiry
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

/* ============================================================
   SAFETY, ADR REPORTING & PACK VERIFICATION VIEW
   ============================================================ */
interface SupportViewProps {
  pvReports: PharmacovigilanceReport[];
  scanCounts: Record<string, number>;
  onSubmitPv: (r: Omit<PharmacovigilanceReport, 'ref' | 't' | 'status'>) => string;
  onVerifySerial: (code: string) => ReturnType<typeof verifySerialCode>;
}

export const SupportView: React.FC<SupportViewProps> = ({
  pvReports,
  onSubmitPv,
  onVerifySerial,
}) => {
  const [serialInput, setSerialInput] = useState('NRG-7K2M-94QX');
  const [verifyResult, setVerifyResult] = useState<ReturnType<typeof verifySerialCode> | null>(null);

  const [reporter, setReporter] = useState('Patient');
  const [product, setProduct] = useState('azi500');
  const [severity, setSeverity] = useState<'Mild' | 'Moderate' | 'Serious'>('Mild');
  const [desc, setDesc] = useState('');
  const [pvRef, setPvRef] = useState<string | null>(null);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyResult(onVerifySerial(serialInput));
  };

  const handlePv = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    const refNo = onSubmitPv({ reporter, product, severity, description: desc.trim() });
    setPvRef(refNo);
    setDesc('');
  };

  return (
    <div>
      <SubBanner
        focusNode="pharmacy"
        eyebrow="Governance, Safety & Authenticity"
        title="Pharmacovigilance (ADR) & Pack Serial Verification."
        lede="Report suspected adverse drug reactions directly to safety officers or verify serialized medicine packs before dispensing."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 grid lg:grid-cols-12 gap-6 items-start">
        {/* Pack Verification */}
        <section id="verify-section" className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <QrCode className="w-5 h-5 text-cyan-700" />
            <span>Verify Medicine Pack Authenticity</span>
          </h2>
          <p className="text-xs text-slate-600">
            Try sample serials: <code className="font-mono">NRG-7K2M-94QX</code>, <code className="font-mono">NRG-3HFA-55TP</code>, or <code className="font-mono">NRG-9WQC-18LD</code>.
          </p>
          <form onSubmit={handleVerify} className="flex gap-2">
            <label htmlFor="pack-serial" className="sr-only">Pack Serial Code</label>
            <input
              id="pack-serial"
              type="text"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 font-mono text-sm"
            />
            <button type="submit" className="px-4 h-10 rounded-lg bg-cyan-700 text-white text-sm font-semibold">
              Verify
            </button>
          </form>

          {verifyResult && (
            <div
              className={`rounded-lg border p-3.5 text-sm ${
                verifyResult.valid
                  ? verifyResult.scans > 1
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-900'
              }`}
            >
              <div className="font-bold">
                {verifyResult.valid && verifyResult.product
                  ? `${verifyResult.product.generic} ${verifyResult.product.strength} · Batch ${verifyResult.batch} (Exp ${verifyResult.exp})`
                  : 'Unrecognized Serial'}
              </div>
              <p className="text-xs mt-1">{verifyResult.message}</p>
            </div>
          )}
        </section>

        {/* ADR Reporting */}
        <section id="pv-section" className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <span>Report Adverse Drug Reaction (ADR)</span>
          </h2>
          {pvRef && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 text-sm text-emerald-900">
              Safety report <strong className="font-mono">{pvRef}</strong> logged ({pvReports.length} total in session).
            </div>
          )}
          <form onSubmit={handlePv} className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="pv-rep" className="block text-xs font-semibold mb-1">Reporter</label>
                <select
                  id="pv-rep"
                  value={reporter}
                  onChange={(e) => setReporter(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  <option>Patient</option>
                  <option>Caregiver</option>
                  <option>Doctor / Pharmacist</option>
                </select>
              </div>
              <div>
                <label htmlFor="pv-med" className="block text-xs font-semibold mb-1">Medicine</label>
                <select
                  id="pv-med"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  {PRODUCTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.generic} {p.strength}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pv-sev" className="block text-xs font-semibold mb-1">Severity</label>
                <select
                  id="pv-sev"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as 'Mild' | 'Moderate' | 'Serious')}
                  className="w-full h-10 px-2.5 rounded-lg border border-slate-300 bg-white text-xs"
                >
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Serious">Serious</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pv-desc" className="block text-xs font-semibold mb-1">Reaction Description</label>
              <textarea
                id="pv-desc"
                rows={3}
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Describe onset timing and observed reaction..."
                className="w-full p-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button type="submit" className="px-4 py-2 rounded-lg bg-[#03151c] text-white text-sm font-semibold">
              Submit ADR Safety Report
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

/* ============================================================
   STAFF OPERATIONS CONSOLE (UPDATES ALL PORTALS LIVE)
   ============================================================ */
interface StaffConsoleViewProps {
  orders: Order[];
  rfqs: TradeRfq[];
  tradeOrders: TradeOrder[];
  cases: SupportCase[];
  pvReports: PharmacovigilanceReport[];
  enquiries: EnquiryRecord[];
  auditLog: AuditEntry[];
  onAdvanceOrder: (refNo: string, nextStatus: OrderStatus) => void;
  onIssueQuote: (rfqRef: string) => void;
  onAdvanceTradeOrder: (refNo: string, nextStatus: TradeOrderStatus) => void;
  onTriageCase: (refNo: string, status: SupportCase['status']) => void;
  onResetDemo: () => void;
  databasePanel?: React.ReactNode;
}

export const StaffConsoleView: React.FC<StaffConsoleViewProps> = ({
  orders,
  rfqs,
  tradeOrders,
  cases,
  pvReports,
  enquiries,
  auditLog,
  onAdvanceOrder,
  onIssueQuote,
  onAdvanceTradeOrder,
  onTriageCase,
  onResetDemo,
  databasePanel,
}) => {
  const [role, setRole] = useState<'overview' | 'database' | 'pharmacist' | 'trade' | 'psp' | 'audit'>('overview');

  return (
    <div>
      <SubBanner
        focusNode="core"
        eyebrow="Staff Operations Console"
        title="Unified operations workspace across all NIROG.AI portals."
        lede="Actions taken here immediately update public Order Tracking, B2B Trade Quotations, and Patient Pro case statuses, with Cloud Firestore & Google Drive database backup."
        actions={
          <button
            type="button"
            onClick={onResetDemo}
            className="px-4 py-2 rounded-lg border border-cyan-400/40 bg-[#072430] text-white text-xs font-semibold"
          >
            Reset Demo State
          </button>
        }
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
          {[
            ['overview', 'Operations Overview'],
            ['database', 'Cloud DB & Google Drive'],
            ['pharmacist', `Pharmacist Queue (${orders.length})`],
            ['trade', `Trade Desk (${rfqs.length + tradeOrders.length})`],
            ['psp', `Patient Support (${cases.length})`],
            ['audit', `Audit Log (${auditLog.length})`],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={role === id}
              onClick={() => setRole(id as typeof role)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap ${
                role === id
                  ? 'border-cyan-700 text-cyan-800 bg-cyan-50/40'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {(role === 'overview' || role === 'database') && databasePanel}

        {role === 'overview' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['Pharmacy Orders', orders.length],
              ['Pending Rx Review', orders.filter((o) => o.status === 'rx_review').length],
              ['Open Trade RFQs', rfqs.filter((r) => r.status === 'submitted').length],
              ['Active Trade POs', tradeOrders.length],
              ['Support Cases', cases.length],
              ['ADR / Enquiries', pvReports.length + enquiries.length],
            ].map(([lbl, val]) => (
              <div key={String(lbl)} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-700 tabular-nums">{val}</div>
                <div className="text-xs text-slate-600 mt-1">{lbl}</div>
              </div>
            ))}
          </div>
        )}

        {(role === 'overview' || role === 'pharmacist') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold">Pharmacist Verification &amp; Dispatch Queue</h2>
            <div className="space-y-3">
              {orders.map((o) => (
                <div key={o.ref} className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <div className="font-mono font-bold">
                      {o.ref} · {fmtBDT(o.totals.total)}
                    </div>
                    <div className="text-xs text-slate-600">
                      {o.delivery.name} · Status: <strong className="uppercase">{o.status.replace('_', ' ')}</strong>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {o.status === 'rx_review' && (
                      <button
                        type="button"
                        onClick={() => onAdvanceOrder(o.ref, 'confirmed')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Approve Rx &amp; Confirm
                      </button>
                    )}
                    {o.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => onAdvanceOrder(o.ref, 'dispatched')}
                        className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs font-semibold"
                      >
                        Dispatch Courier
                      </button>
                    )}
                    {o.status === 'dispatched' && (
                      <button
                        type="button"
                        onClick={() => onAdvanceOrder(o.ref, 'delivered')}
                        className="px-3 py-1.5 rounded-lg bg-[#03151c] text-white text-xs font-semibold"
                      >
                        Mark Delivered
                      </button>
                    )}
                    {o.status === 'delivered' && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> Completed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(role === 'overview' || role === 'trade') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold">B2B Trade Desk (RFQs &amp; Purchase Orders)</h2>
            <div className="space-y-3">
              {rfqs.map((r) => (
                <div key={r.ref} className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <div className="font-mono font-bold">{r.ref}</div>
                    <div className="text-xs text-slate-600">
                      {r.incoterm} {r.destination} · {r.lines.length} SKU lines · Status: <strong className="uppercase">{r.status}</strong>
                    </div>
                  </div>
                  {r.status === 'submitted' && (
                    <button
                      type="button"
                      onClick={() => onIssueQuote(r.ref)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      Issue Tier B Quotation
                    </button>
                  )}
                </div>
              ))}
              {tradeOrders.map((o) => (
                <div key={o.ref} className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <div className="font-mono font-bold">{o.ref}</div>
                    <div className="text-xs text-slate-600">
                      {o.destination} · Status: <strong className="uppercase">{o.status.replace('_', ' ')}</strong>
                    </div>
                  </div>
                  {o.status === 'awaiting_payment' && (
                    <button
                      type="button"
                      onClick={() => onAdvanceTradeOrder(o.ref, 'payment_received')}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      Confirm Wire Payment
                    </button>
                  )}
                  {o.status === 'payment_received' && (
                    <button
                      type="button"
                      onClick={() => onAdvanceTradeOrder(o.ref, 'dispatched')}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-700 text-white text-xs font-semibold"
                    >
                      Dispatch Air Freight
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(role === 'overview' || role === 'psp') && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold">Patient Support Programme Case Triage</h2>
            <div className="space-y-3">
              {cases.map((c) => (
                <div key={c.ref} className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div>
                    <div className="font-mono font-bold">
                      {c.ref} · {c.initials} ({c.country})
                    </div>
                    <div className="text-xs text-slate-600">Status: <strong className="uppercase">{c.status}</strong></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onTriageCase(c.ref, 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      Enrol
                    </button>
                    <button
                      type="button"
                      onClick={() => onTriageCase(c.ref, 'more_info')}
                      className="px-3 py-1.5 rounded-lg border border-amber-600 text-amber-800 text-xs font-semibold"
                    >
                      Request Info
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {role === 'audit' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-bold">System Audit Trail</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 font-mono uppercase text-slate-500">
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLog.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="py-2 pr-4 font-mono tabular-nums">{new Date(entry.t).toLocaleTimeString()}</td>
                      <td className="py-2 pr-4 font-semibold">{entry.role}</td>
                      <td className="py-2 pr-4">{entry.action}</td>
                      <td className="py-2 font-mono">{entry.ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
