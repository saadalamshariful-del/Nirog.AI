import React, { useState } from 'react';
import { Database, Menu, ShoppingBag, X } from 'lucide-react';
import { BRAND } from '../data/seed';
import type { RouteId } from '../types/nirog';

interface LayoutProps {
  route: RouteId;
  onNavigate: (route: RouteId, focusId?: string) => void;
  cartCount: number;
  authEmail?: string | null;
  children: React.ReactNode;
}

export const NirogLogoMark: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="nirog-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22D3EE" />
        <stop offset="100%" stopColor="#10B981" />
      </linearGradient>
    </defs>
    <path
      d="M20 35.5C18.5 34.5 5 25.5 5 14.8 5 9.8 8.8 6 13.5 6c2.8 0 5.2 1.4 6.5 3.6C21.3 7.4 23.7 6 26.5 6 31.2 6 35 9.8 35 14.8c0 10.7-13.5 19.7-15 20.7z"
      fill="none"
      stroke="url(#nirog-grad)"
      strokeWidth="2.6"
      strokeLinejoin="round"
    />
    <path
      d="M11 19h4.2l2.3-5.2 3.6 9.4 2.4-4.2H29"
      fill="none"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="13.5" cy="11.5" r="1.8" fill="#22D3EE" />
    <circle cx="26.5" cy="11.5" r="1.8" fill="#34D399" />
    <circle cx="20" cy="30.5" r="1.8" fill="#FFFFFF" />
  </svg>
);

const PRIMARY_NAV: { id: RouteId; label: string }[] = [
  { id: 'home', label: 'Ecosystem' },
  { id: 'ai-solutions', label: 'AI Solutions' },
  { id: 'patient-pro', label: 'Patient Pro' },
  { id: 'providers', label: 'Providers' },
  { id: 'pharmacy', label: 'Pharmacy' },
];

const ALL_PORTALS: { id: RouteId; label: string; desc: string }[] = [
  { id: 'home', label: '3D Ecosystem', desc: 'Interactive stakeholder constellation' },
  { id: 'ai-solutions', label: 'AI Solutions', desc: 'CDSS, 3D Radiology AI & Health Assistant' },
  { id: 'patient-pro', label: 'Patient Pro', desc: 'EMR vault, dose diary & support programmes' },
  { id: 'providers', label: 'Provider Portal', desc: 'Physician, Hospital ERP & Diagnostics' },
  { id: 'pharmacy', label: 'Digital Pharmacy', desc: 'Generic search, Rx upload & checkout' },
  { id: 'pharma-tech', label: 'Pharma & Trade', desc: 'QA/QC audits, recalls & B2B trade RFQs' },
  { id: 'insurance', label: 'Insurance AI', desc: 'Claims anomaly flags & risk cohorts' },
  { id: 'company', label: 'Company & Investors', desc: 'Team, advisors & partnership enquiries' },
  { id: 'support', label: 'Safety & Verification', desc: 'ADR reporting & QR pack verification' },
  { id: 'staff', label: 'Staff Console', desc: 'Live operations queue & audit trail' },
];

export const Layout: React.FC<LayoutProps> = ({ route, onNavigate, cartCount, authEmail, children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleNav = (id: RouteId, focusId?: string) => {
    setDrawerOpen(false);
    onNavigate(id, focusId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7f7] text-[#071e26]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-white focus:text-[#03151c] focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#03151c] text-white border-b border-cyan-500/15">
        <div className="max-w-[1280px] mx-auto px-5 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              handleNav('home');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 font-bold text-lg tracking-tight text-white"
          >
            <NirogLogoMark className="w-8 h-8 shrink-0" />
            <span>NIROG.AI</span>
          </a>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const active = route === item.id || (item.id === 'pharmacy' && (route === 'cart' || route === 'orders'));
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNav(item.id);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`py-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'text-white border-cyan-400'
                      : 'border-transparent hover:text-white hover:border-cyan-400/40'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action (opens Portal Switcher & Cart Drawer) + mobile menu button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              aria-label={`Open Portals and Cart (${cartCount} items)`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Portals &amp; Cart ({cartCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Portal Switcher & Cart Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#03151c]/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-drawer-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDrawerOpen(false);
          }}
        >
          <div className="w-full max-w-md bg-white text-[#071e26] h-full overflow-y-auto p-6 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 id="portal-drawer-title" className="text-lg font-bold">
                  NIROG.AI Workspace Directory
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synthetic demo environment · All portals synchronized in-session
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                aria-label="Close directory"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleNav('cart')}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#03151c] text-white text-sm font-semibold hover:bg-[#072430] transition-colors"
                >
                  Pharmacy Cart ({cartCount})
                </button>
                <button
                  type="button"
                  onClick={() => handleNav('orders')}
                  className="flex-1 py-2.5 px-4 rounded-lg border border-slate-300 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Track Orders
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleNav('staff', 'database-drive-sync')}
                className="w-full py-2.5 px-4 rounded-lg border border-cyan-700 bg-cyan-50/70 hover:bg-cyan-50 text-cyan-900 text-xs font-semibold inline-flex items-center justify-between gap-2 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
                  <span>Cloud DB &amp; Google Drive Backup</span>
                </span>
                <span className="font-mono text-[11px] text-cyan-700 truncate max-w-[140px]">
                  {authEmail ? authEmail : 'Not signed in'}
                </span>
              </button>
            </div>

            <div className="grid gap-2">
              {ALL_PORTALS.map((p) => {
                const isCurrent = route === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleNav(p.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors ${
                      isCurrent
                        ? 'bg-cyan-50 border-cyan-600 text-[#071e26]'
                        : 'bg-white border-slate-200 hover:border-cyan-500 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-semibold flex items-center justify-between">
                      <span>{p.label}</span>
                      {isCurrent && <span className="text-xs font-mono text-cyan-700">Active</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{p.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main id="main-content" className="flex-1" tabIndex={-1}>
        {children}
      </main>

      <footer className="bg-[#03151c] text-slate-300 mt-16 border-t border-cyan-500/15">
        <div className="max-w-[1280px] mx-auto px-5 py-12 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2.5 text-white font-bold text-lg">
              <NirogLogoMark className="w-7 h-7" />
              <span>NIROG.AI</span>
            </div>
            <p className="text-xs text-cyan-300 font-mono">
              {BRAND.subtitle} · {BRAND.bangla}
            </p>
            <p className="text-xs leading-relaxed text-slate-400">{BRAND.mission}</p>
            <div className="text-xs font-mono text-slate-400 pt-1 space-y-1">
              <span className="block">{BRAND.address}</span>
              <span className="block">
                {BRAND.phone} · {BRAND.email}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3">
              Intelligence &amp; Portals
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#ai-solutions" onClick={(e) => { e.preventDefault(); handleNav('ai-solutions'); }} className="hover:text-white">
                  AI Healthcare Solutions
                </a>
              </li>
              <li>
                <a href="#patient-pro" onClick={(e) => { e.preventDefault(); handleNav('patient-pro'); }} className="hover:text-white">
                  Patient Pro Portal
                </a>
              </li>
              <li>
                <a href="#providers" onClick={(e) => { e.preventDefault(); handleNav('providers'); }} className="hover:text-white">
                  Healthcare Provider Portal
                </a>
              </li>
              <li>
                <a href="#insurance" onClick={(e) => { e.preventDefault(); handleNav('insurance'); }} className="hover:text-white">
                  Health Insurance AI
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3">
              Pharmacy &amp; Pharma Trade
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#pharmacy" onClick={(e) => { e.preventDefault(); handleNav('pharmacy'); }} className="hover:text-white">
                  Digital Pharmacy
                </a>
              </li>
              <li>
                <a href="#cart" onClick={(e) => { e.preventDefault(); handleNav('cart'); }} className="hover:text-white">
                  Cart &amp; Checkout ({cartCount})
                </a>
              </li>
              <li>
                <a href="#orders" onClick={(e) => { e.preventDefault(); handleNav('orders'); }} className="hover:text-white">
                  Track Pharmacy Orders
                </a>
              </li>
              <li>
                <a href="#pharma-tech" onClick={(e) => { e.preventDefault(); handleNav('pharma-tech'); }} className="hover:text-white">
                  Pharma Intelligence &amp; B2B Trade
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-white mb-3">
              Governance &amp; Safety
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#company" onClick={(e) => { e.preventDefault(); handleNav('company'); }} className="hover:text-white">
                  About, Team &amp; Investors
                </a>
              </li>
              <li>
                <a href="#support" onClick={(e) => { e.preventDefault(); handleNav('support', 'pv-section'); }} className="hover:text-white">
                  Report Adverse Event (ADR)
                </a>
              </li>
              <li>
                <a href="#support" onClick={(e) => { e.preventDefault(); handleNav('support', 'verify-section'); }} className="hover:text-white">
                  Verify Medicine Pack
                </a>
              </li>
              <li>
                <a href="#staff" onClick={(e) => { e.preventDefault(); handleNav('staff'); }} className="hover:text-white">
                  Staff Operations Console
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-[1280px] mx-auto px-5 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>© NIROG.AI — {BRAND.tagline}</span>
            <span>Interactive prototype with synthetic demo data. Assistive AI concepts only; not clinically validated medical devices.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
