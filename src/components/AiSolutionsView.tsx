import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Send, ShieldAlert } from 'lucide-react';
import { PRODUCTS } from '../data/seed';
import type { RadiologyCase, RouteId } from '../types/nirog';
import { lookupDrugInteraction } from '../utils/logic';
import { RadiologyWorkstation } from './RadiologyWorkstation';
import { SubBanner } from './SubBanner';
import { MolecularPharmaCanvas } from './three/MolecularPharmaCanvas';

interface AiSolutionsViewProps {
  initialTab?: 'cdss' | 'radiology' | 'assistant' | 'modules';
  onDispatchRadiologyCase: (item: {
    patient: string;
    modality: string;
    findingKey: RadiologyCase['findingKey'];
    aiHighlight: string;
  }) => string;
  onNavigate: (route: RouteId, focusId?: string) => void;
}

type AiTab = 'cdss' | 'radiology' | 'assistant' | 'modules';

export const AiSolutionsView: React.FC<AiSolutionsViewProps> = ({
  initialTab = 'radiology',
  onDispatchRadiologyCase,
  onNavigate,
}) => {
  const [tab, setTab] = useState<AiTab>(initialTab);
  const [medA, setMedA] = useState('ato20');
  const [medB, setMedB] = useState('azi500');
  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<{ who: 'ai' | 'user'; text: string }[]>([
    {
      who: 'ai',
      text: 'Hello. I am the NIROG.AI Virtual Health Navigator (navigation demo). Ask about prescriptions, dose reminders, side-effect reporting, or booking pathways.',
    },
  ]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const interaction = lookupDrugInteraction(medA, medB);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q) return;
    const low = q.toLowerCase();
    let reply =
      'I can help you navigate NIROG.AI modules. Open Patient Pro for digital medical records, Pharmacy for verified refills, or Support for ADR reporting.';
    if (low.includes('side') || low.includes('adr') || low.includes('reaction') || low.includes('pain')) {
      reply =
        'If you are experiencing an urgent or severe medical symptom, seek emergency care immediately. To submit an Adverse Drug Reaction (ADR) report for pharmacovigilance review, open Safety & Verification.';
    } else if (low.includes('insulin') || low.includes('dose') || low.includes('remind') || low.includes('pill')) {
      reply =
        'Daily doses can be logged in your Patient Pro Medicine Diary. Cold-chain insulin storage (2–8 °C) guidance is listed on each Pharmacy product specification.';
    } else if (low.includes('doctor') || low.includes('appoint') || low.includes('book')) {
      reply =
        'Clinician appointment queues and EMR reviews are demonstrated inside the Healthcare Provider Portal.';
    }
    setChatLog((prev) => [...prev, { who: 'user', text: q }, { who: 'ai', text: reply }]);
    setChatInput('');
  };

  return (
    <div>
      <SubBanner
        focusNode="diagnostics"
        eyebrow="AI Healthcare Solutions"
        title="Assistive AI built for human clinical oversight."
        lede="Clinical Decision Support (CDSS), 3D Radiology AI concepts, Virtual Health Navigation, EMR, and Medical Education—engineered to support clinicians, never replace them."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-sm text-amber-950">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong>Responsible AI &amp; Safety Boundary:</strong> All AI capabilities below are interactive assistive technology concepts running on synthetic demo data. None are clinically validated or autonomous diagnostic devices. A licensed clinician or pharmacist makes every final decision.
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="AI Solutions">
          {[
            ['radiology', '3D Radiology & AI Scanning'],
            ['cdss', 'CDSS & Drug Interactions'],
            ['assistant', 'Virtual Health Assistant'],
            ['modules', 'EMR, ERP & Medical Edu'],
          ].map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id as AiTab)}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-cyan-700 text-cyan-800 bg-cyan-50/70'
                    : 'border-transparent text-slate-600 hover:text-[#071e26]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab 1: CDSS */}
        {tab === 'cdss' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-xl font-bold">Clinical Decision Support: Drug-Drug Check (Demo)</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Select two medicines to test how NIROG.AI CDSS surfaces interaction advisories and monitoring prompts before prescribing or dispensing.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cdss-med-a" className="block text-sm font-semibold mb-1.5">
                    Medicine A
                  </label>
                  <select
                    id="cdss-med-a"
                    value={medA}
                    onChange={(e) => setMedA(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.generic} {p.strength}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="cdss-med-b" className="block text-sm font-semibold mb-1.5">
                    Medicine B
                  </label>
                  <select
                    id="cdss-med-b"
                    value={medB}
                    onChange={(e) => setMedB(e.target.value)}
                    className="w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.generic} {p.strength}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                className={`rounded-xl p-4 border flex items-start gap-3 text-sm ${
                  interaction.level === 'warn'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : interaction.level === 'info'
                    ? 'bg-blue-50 border-blue-300 text-blue-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                }`}
              >
                {interaction.level === 'warn' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                ) : interaction.level === 'info' ? (
                  <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{interaction.title}</div>
                  <p className="mt-1 leading-relaxed">{interaction.message}</p>
                </div>
              </div>
            </div>

            <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold">Dosage &amp; ADR Monitoring</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Patient-reported side effects and dosage anomalies flow directly from Patient Pro into pharmacovigilance triage with full batch traceability.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('support', 'pv-section')}
                className="w-full py-2.5 px-4 rounded-lg border border-cyan-700 text-cyan-800 text-sm font-semibold hover:bg-cyan-50 transition-colors"
              >
                Open ADR Reporting Workflow
              </button>
            </aside>
          </div>
        )}

        {/* Tab 2: Multi-Modality 3D Radiology & AI Scanning */}
        {tab === 'radiology' && (
          <RadiologyWorkstation onDispatchRadiologyCase={onDispatchRadiologyCase} />
        )}

        {/* Tab 3: Virtual Health Assistant */}
        {tab === 'assistant' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">AI Virtual Healthcare Assistant (Demo)</h2>
                <span className="text-xs font-mono text-slate-500">Local Navigation Demo</span>
              </div>

              <div className="h-72 overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                {chatLog.map((m, idx) => (
                  <div
                    key={idx}
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.who === 'ai'
                        ? 'bg-white border border-slate-200 text-[#071e26]'
                        : 'ml-auto bg-cyan-700 text-white'
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
              </div>

              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <label htmlFor="ai-chat-input" className="sr-only">
                  Ask the Virtual Health Navigator
                </label>
                <input
                  id="ai-chat-input"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Try: 'side effect', 'insulin reminder', or 'book doctor'"
                  className="flex-1 h-11 px-4 rounded-lg border border-slate-300 bg-white text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 h-11 rounded-lg bg-cyan-700 text-white text-sm font-semibold hover:bg-cyan-800 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </form>
            </div>

            <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold">Safety Guardrails</h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                  <span>Never prescribes medications or overrides physician instructions.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>Directs acute or severe symptoms immediately to emergency care.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Connects seamlessly to Patient Pro EMR &amp; dose diaries.</span>
                </li>
              </ul>
            </aside>
          </div>
        )}

        {/* Tab 4: EMR, ERP, Analytics & Medical Edu */}
        {tab === 'modules' && (
          <div className="grid md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-lg font-bold">Electronic Medical Records (EMR)</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Patient-consented longitudinal vault storing e-prescriptions, diagnostic imaging summaries, allergy histories, and discharge notes with fine-grained role permissions.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('patient-pro')}
                className="text-sm font-semibold text-cyan-700 hover:underline"
              >
                Explore Patient Pro EMR →
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-lg font-bold">Intelligent Healthcare ERP</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Unifies outpatient scheduling, ward occupancy, diagnostic referrals, pharmacy stock control, and insurance billing inside one hospital-ready workspace.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('providers')}
                className="text-sm font-semibold text-cyan-700 hover:underline"
              >
                Open Provider Portal →
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-lg font-bold">Predictive Healthcare Analytics</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                De-identified cohort trends, readmission risk indicators, and regional medicine demand forecasting for hospitals, pharma teams, and health insurers.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('insurance')}
                className="text-sm font-semibold text-cyan-700 hover:underline"
              >
                View Risk &amp; Claims AI →
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-lg font-bold">Medical Education Environment</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Interactive radiology training workspaces allowing medical students to inspect anonymized 3D cases and compare annotations against senior specialist reviews.
              </p>
            </div>

            <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold">3D Structural Pharmacology &amp; Nanoparticle Carrier Lab</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Interactive Three.js PBR workspace for exploring first-mover global generic molecules (Tagrix Osimertinib, Orforglipron) and cold-chain lipid nanoparticle carriers.
                </p>
              </div>
              <MolecularPharmaCanvas heightClassName="h-[420px]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
