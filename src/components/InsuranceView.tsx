import React from 'react';
import { AlertTriangle, CheckCircle2, Shield } from 'lucide-react';
import type { InsuranceClaim } from '../types/nirog';
import { fmtBDT, scoreInsuranceClaim } from '../utils/logic';
import { SubBanner } from './SubBanner';

interface InsuranceViewProps {
  claims: InsuranceClaim[];
  onDecideClaim: (id: string, status: InsuranceClaim['status']) => void;
}

export const InsuranceView: React.FC<InsuranceViewProps> = ({ claims, onDecideClaim }) => {
  return (
    <div>
      <SubBanner
        focusNode="insurance"
        eyebrow="Health Insurance Intelligence"
        title="Risk analytics, claims anomaly detection, and plan aggregation."
        lede="Addressing <1% insurance penetration in Bangladesh with transparent digital plans, prior-authorization linkage, and assistive claims fraud/anomaly flags."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-amber-700 tabular-nums">&lt;1%</div>
            <div className="text-xs text-slate-600 mt-1">Current National Health Insurance Coverage</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-amber-700 tabular-nums">72%</div>
            <div className="text-xs text-slate-600 mt-1">Out-of-Pocket Patient Spend Opportunity</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-amber-700 tabular-nums">{claims.length}</div>
            <div className="text-xs text-slate-600 mt-1">Synthetic Claims in Triage Queue</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-600" />
              <span>Claims Anomaly &amp; Fraud Detection Triage (Demo)</span>
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Flags potential duplicate CPT codes, unbundled billing, and tariff variance against regional benchmarks for human adjuster review.
            </p>
          </div>

          <div className="space-y-4">
            {claims.map((claim) => {
              const scored = scoreInsuranceClaim(claim);
              return (
                <article key={claim.id} className="border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 text-sm">
                      <span className="font-mono font-bold">{claim.id}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold">{claim.procedure}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">{claim.hospital}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-mono font-bold ${
                          scored.tier === 'High'
                            ? 'text-red-700'
                            : scored.tier === 'Moderate'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        Risk Score {scored.riskScore}/100 ({scored.tier})
                      </span>
                      <span className="text-xs font-semibold text-slate-700">{claim.status}</span>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-600">
                    <div>
                      Billed: <strong className="font-mono tabular-nums">{fmtBDT(claim.billedBdt)}</strong> vs. Regional Benchmark:{' '}
                      <strong className="font-mono tabular-nums">{fmtBDT(claim.benchmarkBdt)}</strong>
                    </div>
                    <div>
                      Prior Auth Match: <strong>{claim.priorAuthMatch ? 'Verified' : 'Missing / Mismatch'}</strong>
                    </div>
                  </div>

                  <ul className="space-y-1 text-xs text-slate-700 bg-slate-50 rounded-lg p-3">
                    {scored.reasons.map((r) => (
                      <li key={r} className="flex items-start gap-2">
                        {scored.tier === 'High' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onDecideClaim(claim.id, 'Approved for Settlement')}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                    >
                      Approve Settlement
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecideClaim(claim.id, 'Flagged for Audit')}
                      className="px-3.5 py-1.5 rounded-lg border border-red-600 text-red-700 text-xs font-semibold hover:bg-red-50"
                    >
                      Flag for Manual Audit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {[
            ['Individual & Family Micro-Cover', 'Affordable digital plans integrated into Patient Pro wallets for out-of-pocket protection.'],
            ['Corporate Group Health SaaS', 'Employer dashboard for claim utilization visibility and preventive wellness checkups.'],
            ['Actuarial Morbidity Modelling', 'De-identified chronic care trends helping insurers price sustainable health coverage.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <h3 className="text-base font-bold">{title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
