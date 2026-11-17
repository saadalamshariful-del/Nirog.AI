import React, { useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Cpu,
  FileText,
  FlaskConical,
  Globe,
  HeartPulse,
  Lock,
  Pause,
  Play,
  ShieldCheck,
  Stethoscope,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { BRAND, BUSINESS_STREAMS, ECOSYSTEM_NODES, GLOBAL_GENERIC_RELEASES } from '../data/seed';
import type { NodeKey, RouteId } from '../types/nirog';
import { EcosystemCanvas } from './three/EcosystemCanvas';
import { HospitalWardTwinCanvas } from './three/HospitalWardTwinCanvas';
import { MolecularPharmaCanvas } from './three/MolecularPharmaCanvas';

interface HomeViewProps {
  onNavigate: (route: RouteId, focusId?: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const [selectedNode, setSelectedNode] = useState<NodeKey>('core');
  const [paused, setPaused] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [studioTab, setStudioTab] = useState<'ward' | 'molecule'>('ward');

  const activeNode = ECOSYSTEM_NODES[selectedNode];

  return (
    <div>
      {/* Full-width 3D Healthcare Intelligence Network Hero */}
      <section className="relative overflow-hidden bg-[#03151c] text-white pt-8 pb-24 md:pt-10 md:pb-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(rgba(34,211,238,0.14) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative max-w-[1280px] mx-auto px-5 grid lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Copy + Active 3D Node Inspector */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-300 mb-3">
                {BRAND.name} · {BRAND.subtitle} ({BRAND.bangla})
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight text-white">
                Reimagining Healthcare Through Intelligence.
              </h1>
              <p className="text-sm sm:text-base text-slate-300 mt-4 leading-relaxed max-w-xl">
                Connecting patients, doctors, hospitals, diagnostic centres, pharmaceutical companies, pharmacies, and health insurers through intelligent, accessible, and eco-friendly digital infrastructure.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('ai-solutions')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-[#03151c] text-sm font-bold hover:bg-cyan-50 transition-colors"
              >
                <span>Explore Our Ecosystem</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('company')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-400/35 bg-[#072430] text-white text-sm font-semibold hover:border-cyan-300 transition-colors"
              >
                <span>Partner With Us</span>
              </button>
            </div>

            {/* Live Selected 3D Node Inspector */}
            <div className="rounded-xl border border-cyan-500/25 bg-[#072430] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-mono uppercase tracking-wider" style={{ color: activeNode.color }}>
                  Selected 3D Node · {activeNode.short}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(activeNode.route)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-white whitespace-nowrap"
                >
                  <span>Open Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <h2 className="text-base font-bold text-white">{activeNode.title}</h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{activeNode.desc}</p>
            </div>
          </div>

          {/* Right Interactive 3D Ecosystem Stage */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-b from-[#06222c] to-[#03151c] overflow-hidden flex flex-col">
              <div className="relative w-full min-h-[340px] sm:min-h-[420px] aspect-[1.12] max-h-[520px]">
                <EcosystemCanvas
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  paused={paused}
                  zoomLevel={zoomLevel}
                />
              </div>

              {/* Dedicated Non-Overlapping Control Bar */}
              <div className="px-4 py-2.5 bg-[#041b24] border-t border-white/10 flex items-center justify-between gap-3 text-xs text-slate-200">
                <span className="font-mono text-[11px] text-slate-300 whitespace-nowrap truncate">
                  Drag to rotate · Click any node
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(0.75, +(z - 0.15).toFixed(2)))}
                    className="p-1.5 rounded hover:bg-white/10"
                    aria-label="Zoom out 3D ecosystem"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(1.35, +(z + 0.15).toFixed(2)))}
                    className="p-1.5 rounded hover:bg-white/10"
                    aria-label="Zoom in 3D ecosystem"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaused((p) => !p)}
                    aria-pressed={paused}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 font-mono text-[11px] whitespace-nowrap"
                  >
                    {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    <span>{paused ? 'Resume' : 'Pause'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5 Stakeholder Pathways */}
      <section className="max-w-[1280px] mx-auto px-5 -mt-14 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            {
              route: 'patient-pro' as RouteId,
              icon: HeartPulse,
              title: 'Patients & Caregivers',
              text: 'Digital EMR vault, daily dose diary, support programmes, and ADR reporting.',
              cta: 'Open Patient Pro',
            },
            {
              route: 'providers' as RouteId,
              icon: Stethoscope,
              title: 'Doctors & Hospitals',
              text: 'Clinical Decision Support (CDSS), Radiology AI review, and Hospital ERP.',
              cta: 'Provider Portal',
            },
            {
              route: 'pharma-tech' as RouteId,
              icon: FlaskConical,
              title: 'Pharma & Trade',
              text: 'QA/QC batch audits, recall alerts, market analytics, and B2B trade RFQs.',
              cta: 'Pharma & Trade',
            },
            {
              route: 'insurance' as RouteId,
              icon: ShieldCheck,
              title: 'Health Insurers',
              text: 'Claims anomaly flags, risk cohort modelling, and plan aggregation.',
              cta: 'Insurance AI',
            },
            {
              route: 'company' as RouteId,
              icon: Globe,
              title: 'Partners & Investors',
              text: 'Leadership team, advisory board, seed context, and pilot enquiries.',
              cta: 'About NIROG.AI',
            },
          ].map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.route}
                type="button"
                onClick={() => onNavigate(card.route)}
                className="text-left rounded-xl bg-white border border-slate-200 p-4 shadow-sm hover:border-cyan-600 transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <Icon className="w-5 h-5 text-cyan-700 mb-2.5" />
                  <h3 className="text-sm font-bold text-[#071e26]">{card.title}</h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{card.text}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-700">
                  <span>{card.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive 3D Clinical & Molecular Studios */}
      <section className="max-w-[1280px] mx-auto px-5 pt-14 pb-4 space-y-6" data-testid="home-3d-studios-section">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-700">
              Interactive Studio PBR Digital Twins
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#071e26]">
              Explore 3D Hospital Ward &amp; Molecular Pharmacology Twins.
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Orbit, explode composite assemblies, and switch clinical views across NIROG.AI’s smart ICU telemetry bay, autonomous cold-chain Med-Bot, and targeted oncology/GLP-1 nanoparticle carriers.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 gap-1" role="tablist" aria-label="3D Studio Selector">
            <button
              type="button"
              role="tab"
              aria-selected={studioTab === 'ward'}
              onClick={() => setStudioTab('ward')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                studioTab === 'ward'
                  ? 'bg-[#03151c] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Smart ICU &amp; Med-Bot 3D Twin
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studioTab === 'molecule'}
              onClick={() => setStudioTab('molecule')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                studioTab === 'molecule'
                  ? 'bg-[#03151c] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Nanoparticle &amp; Molecule 3D Lab
            </button>
          </div>
        </div>

        {studioTab === 'ward' ? (
          <HospitalWardTwinCanvas heightClassName="h-[460px] sm:h-[520px]" />
        ) : (
          <MolecularPharmaCanvas heightClassName="h-[460px] sm:h-[520px]" />
        )}
      </section>

      {/* Mission, Market Reality & Healthcare Challenges */}
      <section className="max-w-[1280px] mx-auto px-5 py-16">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div>
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-700 mb-2">
                Mission &amp; Market Context
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#071e26]">
                More than telemedicine: connected healthcare infrastructure.
              </h2>
              <p className="text-sm sm:text-base text-slate-600 mt-3 leading-relaxed max-w-2xl">
                {BRAND.mission}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-700 tabular-nums">$586B</div>
                <div className="text-xs text-slate-600 mt-1">Projected global digital health market by 2030 (16.8% CAGR)*</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-700 tabular-nums">$14B</div>
                <div className="text-xs text-slate-600 mt-1">Serviceable available market ($197B TAM)*</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-700 tabular-nums">72%</div>
                <div className="text-xs text-slate-600 mt-1">Out-of-pocket healthcare expenditure in Bangladesh*</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-2xl font-bold text-cyan-700 tabular-nums">&lt;1%</div>
                <div className="text-xs text-slate-600 mt-1">Current health insurance coverage in Bangladesh*</div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              *Reference figures from the NIROG.AI presentation citing Vantage Research, BIDA Healthcare &amp; Medical Devices Sector Report, and Data BD.
            </p>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#071e26]">Industry Challenges We Address</h3>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>Absence of Clinical Decision Support (CDSS) SaaS in frontline facilities</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>Manual appointment scheduling inefficiencies and long outpatient queues</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>Lack of portable, accessible Electronic Medical Records (EMR) for patients</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>Limited personalized dosage guidance and Adverse Drug Reaction (ADR) tracking</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>Fragmented collaboration and outdated ERP across hospitals, labs, and pharma</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 8 Technology Verticals */}
      <section className="bg-white border-y border-slate-200 py-14">
        <div className="max-w-[1280px] mx-auto px-5">
          <div className="max-w-2xl mb-8">
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-700 mb-2">
              8 Core Technology Verticals
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#071e26]">
              Integrated architecture across clinical, patient, and pharma operations.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Cpu, title: 'AI / ML & CDSS', desc: 'Assistive drug-interaction checks & 3D radiology ROI triage.', route: 'ai-solutions' as RouteId },
              { icon: FileText, title: 'Electronic Medical Records', desc: 'Encrypted longitudinal health records & e-prescriptions.', route: 'patient-pro' as RouteId },
              { icon: Building2, title: 'Healthcare ERP SaaS', desc: 'Hospital scheduling, ward workflows, and diagnostic routing.', route: 'providers' as RouteId },
              { icon: FlaskConical, title: 'Pharma QA/QC & Recall', desc: 'Electronic batch audits, recall notices, and ADR monitoring.', route: 'pharma-tech' as RouteId },
              { icon: HeartPulse, title: 'LOHAS & Wellness', desc: 'Paperless eco-friendly care and medicine adherence tracking.', route: 'patient-pro' as RouteId },
              { icon: Building2, title: 'B2B Trade & Fulfilment', desc: 'Verified distributor RFQs, quotations, and cold-chain orders.', route: 'pharma-tech' as RouteId },
              { icon: ShieldCheck, title: 'Insurance Risk & Fraud', desc: 'Claims anomaly detection and health plan aggregation.', route: 'insurance' as RouteId },
              { icon: Globe, title: 'Cloud Governance', desc: 'Role-based permissions, patient consent, and audit logs.', route: 'staff' as RouteId },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className="text-left rounded-xl border border-slate-200 bg-[#f8fafa] p-5 hover:border-cyan-600 transition-colors space-y-2"
                >
                  <Icon className="w-5 h-5 text-cyan-700" />
                  <h3 className="text-sm font-bold text-[#071e26]">{item.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Latest Global Generic Releases & Named Patient Access Pathways */}
      <section className="max-w-[1280px] mx-auto px-5 py-14 space-y-8" data-testid="global-generics-section">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl space-y-2.5">
            <p className="text-xs font-mono uppercase tracking-wider text-cyan-700">
              Global Generic Releases &amp; Access Intelligence
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#071e26]">
              First-mover global generics from Bangladesh, reaching patients worldwide.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Under the WTO TRIPS least-developed country (LDC) pharmaceutical patent exemption, WHO-GMP manufacturers in countries like <strong>Bangladesh</strong> can produce early generic versions of breakthrough molecules—such as <strong>Beacon Pharmaceuticals’ Tagrix (Osimertinib)</strong> and emerging oral GLP-1 generics like <strong>Orforglipron</strong>—and supply them internationally through physician-certified <strong>Named Patient Access (NPA)</strong> and <strong>Compassionate Use</strong> programmes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('patient-pro')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430] transition-colors"
            >
              <span>Named Patient Access Intake</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('pharma-tech', 'launch-radar')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-cyan-700 text-cyan-800 text-xs font-semibold hover:bg-cyan-50 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Partner Generic Launch Radar</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {GLOBAL_GENERIC_RELEASES.slice(0, 4).map((rel) => (
            <article
              key={rel.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-cyan-800 font-semibold">{rel.therapeuticArea}</span>
                  <span className="text-slate-500">{rel.originCountry}</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#071e26]">{rel.molecule}</h3>
                  <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                    {rel.genericBrand} · {rel.firstMoverCompany}
                  </p>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{rel.summary}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                <div>
                  <strong className="text-[#071e26]">Pathway:</strong> {rel.accessPathway}
                </div>
                <div>
                  <strong className="text-[#071e26]">Originator:</strong> {rel.originator}
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          Regulatory note: International Named Patient Access and Compassionate Use supply is subject to local importing-country regulations, valid specialist prescriptions, and customs import permits.
        </p>
      </section>

      {/* Proposed Business Model */}
      <section className="max-w-[1280px] mx-auto px-5 py-14">
        <div className="max-w-2xl mb-8">
          <p className="text-xs font-mono uppercase tracking-wider text-cyan-700 mb-2">
            Proposed Business Model
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#071e26]">
            Multi-stakeholder revenue architecture.
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            Presented as proposed monetization streams across B2C, B2B, and SaaS layers—not verified historical revenue.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUSINESS_STREAMS.map((stream, i) => (
            <div key={stream.title} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="text-xs font-mono text-slate-500">
                0{i + 1} · {stream.stage}
              </div>
              <h3 className="text-base font-bold text-[#071e26]">{stream.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{stream.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Partnership CTA Band */}
      <section className="max-w-[1280px] mx-auto px-5 pb-4">
        <div className="rounded-2xl bg-[#03151c] text-white p-8 md:p-10 flex flex-wrap items-center justify-between gap-6 border border-cyan-500/20">
          <div className="max-w-xl space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Partner with NIROG.AI to modernize healthcare delivery.
            </h2>
            <p className="text-sm text-slate-300">
              Explore institutional pilots, review our founding team and seed roadmap, or test live workflows in the Staff Operations Console.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('company')}
              className="px-5 py-2.5 rounded-lg bg-white text-[#03151c] text-sm font-bold hover:bg-cyan-50 transition-colors"
            >
              Team, Investors &amp; Contact
            </button>
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="px-5 py-2.5 rounded-lg border border-cyan-400/35 bg-[#072430] text-white text-sm font-semibold hover:border-cyan-300 transition-colors"
            >
              Open Staff Console
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
