import React, { useState } from 'react';
import { Check, Database, FileText, HeartHandshake, QrCode, ShieldAlert } from 'lucide-react';
import { PRODUCTS, PROGRAMMES } from '../data/seed';
import type {
  PatientPrescription,
  PatientVitalReading,
  ProviderAppointment,
  RouteId,
  SupportCase,
} from '../types/nirog';
import { PatientDashboard } from './PatientDashboard';
import { SubBanner } from './SubBanner';

interface PatientProViewProps {
  cases: SupportCase[];
  orderCount: number;
  diaryOn: boolean;
  diaryDays: Record<number, boolean>;
  vitals: PatientVitalReading[];
  prescriptions: PatientPrescription[];
  appointments: ProviderAppointment[];
  onToggleDiaryOn: (val: boolean) => void;
  onToggleDiaryDay: (dayIdx: number) => void;
  onLogVital: (reading: PatientVitalReading) => void;
  onQuickRefill: (rxId: string, productId: string) => void;
  onSubmitCase: (newCase: Omit<SupportCase, 'ref' | 't' | 'status' | 'note' | 'history' | 'mine' | 'initials'>) => string;
  onWithdrawCase: (refNo: string) => void;
  onNavigate: (route: RouteId, focusId?: string) => void;
  databasePanel?: React.ReactNode;
}

type PspTab = 'dashboard' | 'programmes' | 'apply' | 'database';
type WizardStep = 'programme' | 'eligibility' | 'contact' | 'consent' | 'details' | 'review';

const COUNTRIES = ['Bangladesh', 'Cambodia', 'Kenya', 'Nepal', 'Philippines', 'Sri Lanka', 'Vietnam', 'Other'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const PatientProView: React.FC<PatientProViewProps> = ({
  cases,
  orderCount,
  diaryOn,
  diaryDays,
  vitals,
  prescriptions,
  appointments,
  onToggleDiaryOn,
  onToggleDiaryDay,
  onLogVital,
  onQuickRefill,
  onSubmitCase,
  onWithdrawCase,
  onNavigate,
  databasePanel,
}) => {
  const [tab, setTab] = useState<PspTab>('dashboard');
  const [step, setStep] = useState<WizardStep>('programme');
  const [wizError, setWizError] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const [form, setForm] = useState({
    programme: 'ccc' as 'npa' | 'oap' | 'ccc',
    readNotice: false,
    who: 'Patient' as 'Patient' | 'Caregiver',
    country: 'Bangladesh',
    name: '',
    phone: '',
    consentData: false,
    neutralWording: true,
    channels: ['Phone call'] as string[],
    physician: '',
    hospital: '',
    product: 'gla100',
    docsCount: 1,
  });

  const myCases = cases.filter((c) => c.mine);
  const activeProg = PROGRAMMES.find((p) => p.id === form.programme) || PROGRAMMES[0];
  const checkedDays = Object.values(diaryDays).filter(Boolean).length;

  const startWizardFor = (progId: 'npa' | 'oap' | 'ccc') => {
    const p = PROGRAMMES.find((x) => x.id === progId)!;
    setForm((prev) => ({
      ...prev,
      programme: progId,
      country: progId === 'npa' ? 'Kenya' : 'Bangladesh',
      product: p.products[0],
    }));
    setStep('eligibility');
    setWizError('');
    setSubmittedRef(null);
    setTab('apply');
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((x) => x !== ch)
        : [...prev.channels, ch],
    }));
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setWizError('');
    if (step === 'programme') {
      setStep('eligibility');
    } else if (step === 'eligibility') {
      if (!form.readNotice) {
        setWizError('Please confirm you have read the eligibility & privacy notice.');
        return;
      }
      setStep('contact');
    } else if (step === 'contact') {
      if (!form.name.trim() || !form.phone.trim()) {
        setWizError('Patient full name and phone number are required.');
        return;
      }
      if (activeProg.scope === 'Bangladesh' && form.country !== 'Bangladesh') {
        setWizError(`${activeProg.name} is limited to residents of Bangladesh.`);
        return;
      }
      if (activeProg.id === 'npa' && form.country === 'Bangladesh') {
        setWizError('Named Patient Access applies to international markets outside Bangladesh.');
        return;
      }
      setStep('consent');
    } else if (step === 'consent') {
      if (!form.consentData) {
        setWizError('Explicit consent is required to submit a support application.');
        return;
      }
      if (form.channels.length === 0) {
        setWizError('Select at least one communication channel.');
        return;
      }
      setStep('details');
    } else if (step === 'details') {
      if (!form.physician.trim() || !form.hospital.trim()) {
        setWizError('Treating physician and hospital name are required.');
        return;
      }
      setStep('review');
    } else if (step === 'review') {
      const refNo = onSubmitCase({
        programme: form.programme,
        who: form.who,
        name: form.name.trim(),
        country: form.country,
        product: form.product,
        physician: form.physician.trim(),
        hospital: form.hospital.trim(),
        docs: form.docsCount,
        channels: form.channels,
        neutralWording: form.neutralWording,
      });
      setSubmittedRef(refNo);
      setTab('dashboard');
      setStep('programme');
    }
  };

  return (
    <div>
      <SubBanner
        focusNode="patients"
        eyebrow="Patient Pro · Consumer Care Platform"
        title="Your health records, daily adherence, and care programmes."
        lede="Manage digital e-prescriptions, log daily medicine doses, enrol in structured patient support programmes, and verify pack authenticity."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        {submittedRef && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 flex items-center justify-between gap-3">
            <span>
              Application <strong className="font-mono">{submittedRef}</strong> submitted to the Patient Support queue. You can also triage it in the Staff Console.
            </span>
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="text-xs font-semibold text-emerald-800 underline whitespace-nowrap"
            >
              Open Staff Console
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
          {[
            ['dashboard', 'My Dashboard & EMR'],
            ['programmes', 'Support Programmes'],
            ['apply', 'Apply for Support'],
            ['database', 'Cloud DB & Drive'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id as PspTab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                  : 'border-transparent text-slate-600 hover:text-[#071e26]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <PatientDashboard
                vitals={vitals}
                prescriptions={prescriptions}
                appointments={appointments}
                diaryOn={diaryOn}
                diaryDays={diaryDays}
                onLogVital={onLogVital}
                onQuickRefill={onQuickRefill}
                onNavigate={onNavigate}
              />

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold">My Electronic Medical Records (EMR Vault)</h2>
                  <span className="text-xs font-mono text-slate-500">Synthetic Sample Vault</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                        <th className="py-2.5 pr-4">Date</th>
                        <th className="py-2.5 pr-4">Record</th>
                        <th className="py-2.5 pr-4">Provider</th>
                        <th className="py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums">14 Nov 2026</td>
                        <td className="py-3 pr-4 font-semibold">E-Prescription · Insulin glargine 100 U/mL</td>
                        <td className="py-3 pr-4 text-slate-600">Sample Endocrine Clinic</td>
                        <td className="py-3 text-xs font-semibold text-emerald-700">Verified</td>
                      </tr>
                      <tr>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums">08 Nov 2026</td>
                        <td className="py-3 pr-4 font-semibold">HbA1c &amp; Lipid Panel Summary</td>
                        <td className="py-3 pr-4 text-slate-600">Sample Diagnostic Lab</td>
                        <td className="py-3 text-xs font-semibold text-blue-700">Stored in Vault</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-bold">My Support Applications</h2>
                {myCases.map((c) => {
                  const prog = PROGRAMMES.find((p) => p.id === c.programme)!;
                  const med = PRODUCTS.find((p) => p.id === c.product);
                  return (
                    <article key={c.ref} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-mono font-bold">{c.ref}</span>
                          <span className="text-slate-400">·</span>
                          <span className="font-semibold text-emerald-700 capitalize">{c.status.replace('_', ' ')}</span>
                        </div>
                        <span className="text-xs text-slate-500">{prog.name}</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-600">
                        <div>
                          <strong>Patient:</strong> {c.name} ({c.country})
                        </div>
                        <div>
                          <strong>Medicine:</strong> {med ? `${med.generic} ${med.strength}` : c.product}
                        </div>
                        <div>
                          <strong>Clinician:</strong> {c.physician}, {c.hospital}
                        </div>
                        <div>
                          <strong>Channels:</strong> {c.channels.join(', ')}
                          {c.neutralWording ? ' (neutral wording)' : ''}
                        </div>
                      </div>
                      {c.note && (
                        <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
                          <strong>Case note:</strong> {c.note}
                        </p>
                      )}
                      {c.status !== 'withdrawn' && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onWithdrawCase(c.ref)}
                            className="text-xs font-semibold text-slate-600 hover:text-red-700 underline"
                          >
                            Withdraw application
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="lg:col-span-4 space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-3 divide-x divide-slate-200 text-center">
                <div className="px-2">
                  <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums">{myCases.length}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">Support Cases</div>
                </div>
                <div className="px-2">
                  <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums">{orderCount}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">Rx Orders</div>
                </div>
                <div className="px-2">
                  <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums">{checkedDays}/7</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">Dose Days</div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h3 className="text-base font-bold">My Medicine Diary</h3>
                <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={diaryOn}
                    onChange={(e) => onToggleDiaryOn(e.target.checked)}
                    className="mt-1 accent-emerald-600"
                  />
                  <span>
                    Track daily doses taken
                    <span className="block text-xs text-slate-500">Demo adherence log stored in-session.</span>
                  </span>
                </label>

                {diaryOn && (
                  <div className="grid grid-cols-7 gap-1.5 pt-1" role="group" aria-label="Weekly dose tracker">
                    {DAYS.map((day, idx) => {
                      const on = !!diaryDays[idx];
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onToggleDiaryDay(idx)}
                          className={`py-2 rounded-lg border text-center text-[11px] font-mono transition-colors ${
                            on
                              ? 'bg-emerald-600 border-emerald-600 text-white font-bold'
                              : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-500'
                          }`}
                        >
                          <span className="block">{on ? '✓' : '·'}</span>
                          <span>{day}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-base font-bold">Safety &amp; Authenticity</h3>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('support', 'pv-section')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:border-emerald-600"
                  >
                    <ShieldAlert className="w-4 h-4 text-emerald-700" />
                    <span>Report Adverse Event (ADR)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('support', 'verify-section')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 text-sm font-semibold hover:border-emerald-600"
                  >
                    <QrCode className="w-4 h-4 text-emerald-700" />
                    <span>Verify Medicine Pack QR</span>
                  </button>
                  {databasePanel && (
                    <button
                      type="button"
                      onClick={() => setTab('database')}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-cyan-700 bg-cyan-50/70 text-sm font-semibold text-cyan-900 hover:bg-cyan-50"
                    >
                      <Database className="w-4 h-4 text-cyan-700" />
                      <span>Cloud DB &amp; Google Drive Backup</span>
                    </button>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}

        {tab === 'database' && databasePanel}

        {/* Programmes Catalog */}
        {tab === 'programmes' && (
          <div className="grid md:grid-cols-3 gap-5">
            {PROGRAMMES.map((pr) => (
              <article key={pr.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="text-xs font-mono text-emerald-700">
                    {pr.scope} · {pr.area}
                  </div>
                  <h3 className="text-lg font-bold">{pr.name}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{pr.summary}</p>
                  <ul className="space-y-1.5 text-xs text-slate-600 pt-1">
                    {pr.support.map((s) => (
                      <li key={s} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => startWizardFor(pr.id)}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Start Application
                </button>
              </article>
            ))}
          </div>
        )}

        {/* 6-Step Application Wizard */}
        {tab === 'apply' && (
          <div className="max-w-3xl space-y-6">
            <ol className="flex flex-wrap gap-2 text-xs font-mono">
              {(['programme', 'eligibility', 'contact', 'consent', 'details', 'review'] as WizardStep[]).map((s, idx) => (
                <li
                  key={s}
                  className={`px-3 py-1.5 rounded-lg border capitalize ${
                    step === s
                      ? 'bg-emerald-600 border-emerald-600 text-white font-semibold'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  {idx + 1}. {s}
                </li>
              ))}
            </ol>

            <form onSubmit={handleNext} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              {wizError && (
                <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-sm text-red-800 font-medium">
                  {wizError}
                </div>
              )}

              {step === 'programme' && (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold">1. Choose Support Programme</h2>
                  {PROGRAMMES.map((p) => (
                    <label
                      key={p.id}
                      className={`block rounded-xl border p-4 cursor-pointer ${
                        form.programme === p.id ? 'border-emerald-600 bg-emerald-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="prog"
                          checked={form.programme === p.id}
                          onChange={() => setForm({ ...form, programme: p.id, product: p.products[0] })}
                          className="mt-1 accent-emerald-600"
                        />
                        <div>
                          <div className="font-bold text-sm">
                            {p.name} ({p.scope})
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{p.summary}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {step === 'eligibility' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">2. {activeProg.name}: Eligibility &amp; Privacy</h2>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {activeProg.eligibility.map((e) => (
                      <li key={e} className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-700" />
                        <span>{e}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={form.readNotice}
                      onChange={(e) => setForm({ ...form, readNotice: e.target.checked })}
                      className="mt-1 accent-emerald-600"
                    />
                    <span>I confirm I have read the eligibility criteria and privacy notice (details are never used for advertising).</span>
                  </label>
                </div>
              )}

              {step === 'contact' && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <h2 className="sm:col-span-2 text-lg font-bold">3. Applicant &amp; Contact Details</h2>
                  <div>
                    <label htmlFor="psp-who" className="block text-sm font-semibold mb-1">
                      Applying as
                    </label>
                    <select
                      id="psp-who"
                      value={form.who}
                      onChange={(e) => setForm({ ...form, who: e.target.value as 'Patient' | 'Caregiver' })}
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="Patient">Patient</option>
                      <option value="Caregiver">Caregiver</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="psp-country" className="block text-sm font-semibold mb-1">
                      Country
                    </label>
                    <select
                      id="psp-country"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="psp-name" className="block text-sm font-semibold mb-1">
                      Patient full name
                    </label>
                    <input
                      id="psp-name"
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Full name"
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="psp-phone" className="block text-sm font-semibold mb-1">
                      Phone number
                    </label>
                    <input
                      id="psp-phone"
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+880 1..."
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </div>
              )}

              {step === 'consent' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">4. Consent &amp; Communication</h2>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.consentData}
                      onChange={(e) => setForm({ ...form, consentData: e.target.checked })}
                      className="mt-1 accent-emerald-600"
                    />
                    <span>I explicitly consent to the programme team reviewing my application details.</span>
                  </label>
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.neutralWording}
                      onChange={(e) => setForm({ ...form, neutralWording: e.target.checked })}
                      className="mt-1 accent-emerald-600"
                    />
                    <span>Use neutral wording in messages (never names a condition or medicine).</span>
                  </label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {['Phone call', 'SMS', 'WhatsApp'].map((ch) => {
                      const active = form.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleChannel(ch)}
                          className={`px-3.5 py-2 rounded-lg text-xs font-semibold border ${
                            active
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-300 text-slate-700'
                          }`}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 'details' && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <h2 className="sm:col-span-2 text-lg font-bold">5. Treatment Details</h2>
                  <div>
                    <label htmlFor="psp-physician" className="block text-sm font-semibold mb-1">
                      Treating physician
                    </label>
                    <input
                      id="psp-physician"
                      type="text"
                      value={form.physician}
                      onChange={(e) => setForm({ ...form, physician: e.target.value })}
                      placeholder="Dr. ..."
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="psp-hospital" className="block text-sm font-semibold mb-1">
                      Hospital / clinic
                    </label>
                    <input
                      id="psp-hospital"
                      type="text"
                      value={form.hospital}
                      onChange={(e) => setForm({ ...form, hospital: e.target.value })}
                      placeholder="Hospital name"
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="psp-product" className="block text-sm font-semibold mb-1">
                      Prescribed medicine
                    </label>
                    <select
                      id="psp-product"
                      value={form.product}
                      onChange={(e) => setForm({ ...form, product: e.target.value })}
                      className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      {activeProg.products.map((pid) => {
                        const med = PRODUCTS.find((p) => p.id === pid);
                        return (
                          <option key={pid} value={pid}>
                            {med ? `${med.generic} ${med.strength}` : pid}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>
              )}

              {step === 'review' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold">6. Review &amp; Submit</h2>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm space-y-1.5">
                    <div><strong>Programme:</strong> {activeProg.name}</div>
                    <div><strong>Patient:</strong> {form.name} ({form.country})</div>
                    <div><strong>Clinician:</strong> {form.physician}, {form.hospital}</div>
                    <div><strong>Contact Channels:</strong> {form.channels.join(', ')}</div>
                  </div>
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <HeartHandshake className="w-4 h-4 text-emerald-700" />
                    Submitting creates a synthetic support case for programme coordinator review.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {step !== 'programme' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const order: WizardStep[] = ['programme', 'eligibility', 'contact', 'consent', 'details', 'review'];
                      setStep(order[order.indexOf(step) - 1]);
                      setWizError('');
                    }}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  {step === 'review' ? 'Submit Application' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
