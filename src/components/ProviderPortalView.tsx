import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bookmark,
  BookOpen,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Globe2,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { GLOBAL_GENERIC_RELEASES, HOSPITAL_SOURCING_CATALOG } from '../data/seed';
import type {
  AuditEntry,
  GenericReleaseItem,
  HospitalSourcingCatalogItem,
  HospitalSourcingCategory,
  HospitalSourcingRequest,
  HospitalSourcingRequestStatus,
  LauncherCategory,
  MoleculeModality,
  ProviderAppointment,
  ProviderPermission,
  ProviderRole,
  RadiologyCase,
  RouteId,
  SourcingOriginHub,
} from '../types/nirog';
import {
  filterGenericLaunches,
  filterHospitalSourcingCatalog,
  fmtUSD,
  hasProviderPermission,
  maskEmrForRole,
  PROVIDER_ROLE_PROFILES,
  summarizeHospitalSourcingRequests,
  validateHospitalSourcingInput,
} from '../utils/logic';
import { SubBanner } from './SubBanner';
import { HospitalWardTwinCanvas } from './three/HospitalWardTwinCanvas';

interface ProviderPortalViewProps {
  appointments: ProviderAppointment[];
  radQueue: RadiologyCase[];
  auditLog: AuditEntry[];
  sourcingRequests: HospitalSourcingRequest[];
  sharedBriefIds?: string[];
  bookmarkedMoleculeIds?: string[];
  onCompleteAppointment: (id: string, role: ProviderRole) => void;
  onCheckInAppointment: (id: string, role: ProviderRole) => void;
  onRecordVitals: (id: string, vitals: string, role: ProviderRole) => void;
  onScheduleAppointment: (patient: string, time: string, reason: string, role: ProviderRole) => void;
  onSignRadiology: (id: string, role: ProviderRole) => void;
  onSubmitSourcingRequest: (
    req: Omit<HospitalSourcingRequest, 'ref' | 't' | 'status' | 'requestedByRole'>,
    role: ProviderRole
  ) => string;
  onAdvanceSourcingStatus: (
    refNo: string,
    nextStatus: HospitalSourcingRequestStatus,
    role: ProviderRole
  ) => void;
  onToggleBookmarkMolecule?: (molecule: GenericReleaseItem, role: ProviderRole) => void;
  onRequestMedicalDossier?: (molecule: GenericReleaseItem, role: ProviderRole) => void;
  onRoleSwitch?: (role: ProviderRole) => void;
  onNavigate: (route: RouteId, focusId?: string) => void;
}

const PERMISSION_LABELS: { key: ProviderPermission; label: string }[] = [
  { key: 'viewDemographics', label: 'Patient Demographics' },
  { key: 'viewClinicalEmr', label: 'Clinical EMR & Labs' },
  { key: 'manageScheduling', label: 'Schedule & Check-in' },
  { key: 'recordVitals', label: 'Record Triage Vitals' },
  { key: 'signConsultAndRx', label: 'Consult & Rx Sign-off' },
  { key: 'accessAiTools', label: 'CDSS & AI Triage View' },
  { key: 'signRadiologyAi', label: 'Radiology AI Sign-off' },
  { key: 'manageHospitalErp', label: 'Hospital ERP & Wards' },
  { key: 'viewComplianceAudit', label: 'RBAC Privacy Audit' },
];

const ROLES: ProviderRole[] = ['Doctor', 'Nurse', 'Receptionist', 'Administrator'];

export const ProviderPortalView: React.FC<ProviderPortalViewProps> = ({
  appointments,
  radQueue,
  auditLog,
  sourcingRequests,
  sharedBriefIds = [],
  bookmarkedMoleculeIds = [],
  onCompleteAppointment,
  onCheckInAppointment,
  onRecordVitals,
  onScheduleAppointment,
  onSignRadiology,
  onSubmitSourcingRequest,
  onAdvanceSourcingStatus,
  onToggleBookmarkMolecule,
  onRequestMedicalDossier,
  onRoleSwitch,
  onNavigate,
}) => {
  const [role, setRole] = useState<ProviderRole>('Doctor');
  const [showMatrix, setShowMatrix] = useState(true);
  const [briefModality, setBriefModality] = useState<MoleculeModality | 'All'>('All');
  const [briefLauncher, setBriefLauncher] = useState<LauncherCategory | 'All'>('All');
  const [briefQuery, setBriefQuery] = useState('');
  const [requestedDossiers, setRequestedDossiers] = useState<Record<string, boolean>>({});

  // Hospital Global Direct Sourcing & DGDA NPA Hub state
  const [sourcingStream, setSourcingStream] = useState<'all' | 'medicines' | 'medtech'>('all');
  const [sourcingQuery, setSourcingQuery] = useState('');
  const [sourcingCategoryFilter, setSourcingCategoryFilter] = useState<
    'All' | HospitalSourcingCategory
  >('All');
  const [sourcingHubFilter, setSourcingHubFilter] = useState<'All' | SourcingOriginHub>('All');
  const [srcHospitalName, setSrcHospitalName] = useState('Dhaka Care Specialty Hospital');
  const [srcCategory, setSrcCategory] = useState<HospitalSourcingCategory>(
    'Unapproved / Unavailable Medicine'
  );
  const [srcOriginHub, setSrcOriginHub] = useState<SourcingOriginHub>(
    'China NMPA Originator Hub'
  );
  const [srcItemName, setSrcItemName] = useState(
    'Osimertinib 80 mg Originator (China NMPA NRDL Pack)'
  );
  const [srcQuantity, setSrcQuantity] = useState('5');
  const [srcDgdaAssist, setSrcDgdaAssist] = useState(true);
  const [srcContext, setSrcContext] = useState(
    'Named Patient Access cohort · EGFRm NSCLC board authorization'
  );
  const [srcError, setSrcError] = useState('');

  // Scheduling form state
  const [newPatient, setNewPatient] = useState('');
  const [newTime, setNewTime] = useState('02:30 PM');
  const [newReason, setNewReason] = useState('');

  // Nurse / Doctor vitals editor state
  const [vitalsTargetId, setVitalsTargetId] = useState<string | null>(null);
  const [vitalsInput, setVitalsInput] = useState('BP 120/78 · SpO2 98% · 36.8 °C');

  const clinicianBriefs = useMemo(() => {
    const filtered = filterGenericLaunches(
      GLOBAL_GENERIC_RELEASES,
      briefQuery,
      'All',
      'All',
      briefModality,
      'All'
    ).filter((item) => briefLauncher === 'All' || item.launcherCategory === briefLauncher);

    return [...filtered].sort((a, b) => {
      const aShared = sharedBriefIds.includes(a.id) ? 1 : 0;
      const bShared = sharedBriefIds.includes(b.id) ? 1 : 0;
      if (aShared !== bShared) return bShared - aShared;
      return b.launchFocusScore - a.launchFocusScore;
    });
  }, [briefQuery, briefModality, briefLauncher, sharedBriefIds]);

  const filteredSourcingCatalog = useMemo(() => {
    const base = filterHospitalSourcingCatalog(
      HOSPITAL_SOURCING_CATALOG,
      sourcingQuery,
      sourcingCategoryFilter,
      sourcingHubFilter
    );
    if (sourcingStream === 'medicines') {
      return base.filter((i) => i.category === 'Unapproved / Unavailable Medicine');
    }
    if (sourcingStream === 'medtech') {
      return base.filter((i) => i.category !== 'Unapproved / Unavailable Medicine');
    }
    return base;
  }, [sourcingQuery, sourcingCategoryFilter, sourcingHubFilter, sourcingStream]);

  const sourcingSummary = useMemo(
    () => summarizeHospitalSourcingRequests(sourcingRequests),
    [sourcingRequests]
  );

  const profile = PROVIDER_ROLE_PROFILES[role];
  const canViewEmr = hasProviderPermission(role, 'viewClinicalEmr');
  const canSchedule = hasProviderPermission(role, 'manageScheduling');
  const canRecordVitals = hasProviderPermission(role, 'recordVitals');
  const canSignConsult = hasProviderPermission(role, 'signConsultAndRx');
  const canAccessAi = hasProviderPermission(role, 'accessAiTools');
  const canSignRad = hasProviderPermission(role, 'signRadiologyAi');
  const canManageErp = hasProviderPermission(role, 'manageHospitalErp');
  const canViewAudit = hasProviderPermission(role, 'viewComplianceAudit');
  const canSubmitSourcing = canSignConsult || canManageErp;
  const canViewSourcingHub = canSubmitSourcing || role === 'Nurse';

  const handleSelectRole = (nextRole: ProviderRole) => {
    setRole(nextRole);
    setVitalsTargetId(null);
    onRoleSwitch?.(nextRole);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSchedule || !newPatient.trim() || !newReason.trim()) return;
    onScheduleAppointment(newPatient.trim(), newTime.trim() || '02:30 PM', newReason.trim(), role);
    setNewPatient('');
    setNewReason('');
  };

  const handleVitalsSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRecordVitals || !vitalsTargetId || !vitalsInput.trim()) return;
    onRecordVitals(vitalsTargetId, vitalsInput.trim(), role);
    setVitalsTargetId(null);
  };

  const handlePrefillCatalogItem = (item: HospitalSourcingCatalogItem) => {
    setSrcCategory(item.category);
    setSrcOriginHub(item.originHub);
    setSrcItemName(item.name);
    setSrcDgdaAssist(item.dgdaNpaEligible);
    setSrcContext(
      item.dgdaNpaEligible
        ? `DGDA NPA / Compassionate Use filing · ${item.partnerName}`
        : `Hospital institutional procurement · ${item.partnerName}`
    );
    setSrcError('');
  };

  const handleSourcingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitSourcing) return;
    const qtyNum = Number(srcQuantity);
    const check = validateHospitalSourcingInput({
      hospitalName: srcHospitalName,
      itemName: srcItemName,
      quantity: qtyNum,
      patientOrDeptContext: srcContext,
    });
    if (!check.ok) {
      setSrcError(check.error);
      return;
    }
    setSrcError('');
    onSubmitSourcingRequest(
      {
        hospitalName: srcHospitalName.trim(),
        category: srcCategory,
        originHub: srcOriginHub,
        itemName: srcItemName.trim(),
        quantity: Math.round(qtyNum),
        dgdaAssistance: srcDgdaAssist,
        patientOrDeptContext: srcContext.trim(),
      },
      role
    );
  };

  return (
    <div>
      <SubBanner
        focusNode="hospitals"
        eyebrow="Healthcare Provider Portal · RBAC Enforced"
        title="Role-based clinical, scheduling, EMR, and AI governance."
        lede="Select a staff role—Doctor, Nurse, Receptionist, or Administrator—to verify real-time permission enforcement across patient PHI, scheduling, EMR updates, AI tools, and Hospital ERP."
      />

      <div className="max-w-[1280px] mx-auto px-5 py-10 space-y-8">
        {/* RBAC Role Switcher & Active Policy Bar */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-cyan-700">
                Active RBAC Session · {profile.title}
              </div>
              <h2 className="text-lg font-bold text-[#071e26] mt-0.5">
                Signed in as: {role}
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl">{profile.summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1"
                role="group"
                aria-label="Provider Role Selector"
              >
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={role === r}
                    onClick={() => handleSelectRole(r)}
                    className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      role === r
                        ? 'bg-cyan-700 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowMatrix((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showMatrix ? 'Hide Permissions' : 'Show Permissions'}
              </button>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-center gap-2 text-xs text-slate-700">
            <ShieldCheck className="w-4 h-4 text-cyan-700 shrink-0" />
            <span>
              <strong>Data Privacy Boundary:</strong> {profile.dataBoundary}
            </span>
          </div>

          {/* Explicit Permission Matrix */}
          {showMatrix && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1" data-testid="rbac-permission-matrix">
              {PERMISSION_LABELS.map((perm) => {
                const allowed = profile.permissions[perm.key];
                return (
                  <div
                    key={perm.key}
                    className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between gap-2 ${
                      allowed
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <span className="font-medium truncate">{perm.label}</span>
                    <span className="font-mono text-[10px] font-bold uppercase shrink-0">
                      {allowed ? 'Allow' : 'Deny'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Role-aware KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-cyan-800 tabular-nums">{appointments.length}</div>
            <div className="text-xs text-slate-600 mt-1">Outpatient Appointments in Queue</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-cyan-800 tabular-nums">
              {canViewEmr ? `${appointments.filter((a) => a.status !== 'Completed').length} Open` : 'Masked (PHI)'}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {canViewEmr ? 'Active Clinical EMR Reviews' : 'Clinical EMR Restricted for This Role'}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-2xl font-bold text-emerald-700 tabular-nums">
              {canAccessAi
                ? `${radQueue.filter((r) => r.status.startsWith('Pending')).length} AI Assists`
                : canManageErp
                ? '82% Beds'
                : 'Restricted'}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {canAccessAi
                ? 'Radiology AI Triage Queue'
                : canManageErp
                ? 'Hospital ERP Ward Occupancy'
                : 'AI Clinical Tools Require Clinical Role'}
            </div>
          </div>
        </div>

        {/* Scheduling & Outpatient Queue (All 4 roles have scheduling/demographics; PHI & clinical edits enforced by role) */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 min-w-0 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-cyan-700" />
                <span>Outpatient Scheduling &amp; EMR Queue</span>
              </h2>
              {canAccessAi ? (
                <button
                  type="button"
                  onClick={() => onNavigate('ai-solutions')}
                  className="text-xs font-semibold text-cyan-700 hover:underline"
                >
                  Open CDSS Drug Checker →
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500">
                  <Lock className="w-3.5 h-3.5" />
                  <span>CDSS Locked ({role})</span>
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-mono uppercase text-slate-500">
                    <th className="py-2.5 pr-4">ID</th>
                    <th className="py-2.5 pr-4">Patient</th>
                    <th className="py-2.5 pr-4">Slot</th>
                    <th className="py-2.5 pr-4">Clinical EMR &amp; Vitals</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5">Role Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {appointments.map((a) => {
                    const emrView = maskEmrForRole(role, a.emr);
                    return (
                      <tr key={a.id}>
                        <td className="py-3 pr-4 font-mono text-xs font-bold">{a.id}</td>
                        <td className="py-3 pr-4">
                          <div className="font-semibold">{a.patient}</div>
                          <div className="text-xs text-slate-500">{a.reason}</div>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums whitespace-nowrap">{a.time}</td>
                        <td className="py-3 pr-4 text-xs">
                          {emrView.visible ? (
                            <div className="space-y-0.5">
                              <div className="text-[#071e26] font-medium">{emrView.text}</div>
                              {a.vitals && (
                                <div className="text-cyan-800 font-mono text-[11px]">{a.vitals}</div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>{emrView.text}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs font-semibold whitespace-nowrap">
                          <span className={a.status === 'Completed' ? 'text-emerald-700' : 'text-cyan-800'}>
                            {a.status}
                          </span>
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          {a.status === 'Completed' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Signed
                            </span>
                          ) : canSignConsult ? (
                            <button
                              type="button"
                              onClick={() => onCompleteAppointment(a.id, role)}
                              className="px-3 py-1.5 rounded-lg border border-cyan-700 text-cyan-800 text-xs font-semibold hover:bg-cyan-50"
                            >
                              Complete Consult
                            </button>
                          ) : canRecordVitals ? (
                            <button
                              type="button"
                              onClick={() => {
                                setVitalsTargetId(a.id);
                                setVitalsInput(a.vitals && !a.vitals.startsWith('Pending') ? a.vitals : 'BP 122/80 · SpO2 98% · 36.8 °C');
                              }}
                              className="px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 text-xs font-semibold hover:bg-emerald-50"
                            >
                              Record Vitals
                            </button>
                          ) : a.status === 'Scheduled' ? (
                            <button
                              type="button"
                              onClick={() => onCheckInAppointment(a.id, role)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                            >
                              Check In
                            </button>
                          ) : (
                            <span className="text-xs font-mono text-slate-400">Clinical Sign-off Restricted</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Inline Vitals Triage Editor for Nurse/Doctor */}
            {vitalsTargetId && canRecordVitals && (
              <form
                onSubmit={handleVitalsSave}
                className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 flex flex-wrap items-end gap-3"
              >
                <div className="flex-1 min-w-[220px]">
                  <label htmlFor="nurse-vitals-input" className="block text-xs font-semibold text-emerald-950 mb-1">
                    Update Triage Vitals for {vitalsTargetId} ({role})
                  </label>
                  <input
                    id="nurse-vitals-input"
                    type="text"
                    value={vitalsInput}
                    onChange={(e) => setVitalsInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-emerald-300 bg-white text-sm font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  Save Vitals &amp; Set In Review
                </button>
                <button
                  type="button"
                  onClick={() => setVitalsTargetId(null)}
                  className="h-10 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>

          {/* Appointment Scheduling Form */}
          <form onSubmit={handleScheduleSubmit} className="lg:col-span-4 min-w-0 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-cyan-700" />
              <span>Schedule Outpatient Slot</span>
            </h3>
            <p className="text-xs text-slate-600">
              Authorized for Receptionist, Nurse, Doctor, and Administrator roles.
            </p>
            <div>
              <label htmlFor="sched-patient" className="block text-xs font-semibold mb-1">
                Patient Name / Initials
              </label>
              <input
                id="sched-patient"
                type="text"
                value={newPatient}
                onChange={(e) => setNewPatient(e.target.value)}
                placeholder="e.g. Patient S.M. (Sample)"
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="sched-time" className="block text-xs font-semibold mb-1">
                Time Slot
              </label>
              <input
                id="sched-time"
                type="text"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <label htmlFor="sched-reason" className="block text-xs font-semibold mb-1">
                Visit Reason (Non-PHI)
              </label>
              <input
                id="sched-reason"
                type="text"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="e.g. Follow-up consultation"
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!canSchedule}
              className="w-full py-2.5 rounded-lg bg-cyan-700 text-white text-sm font-semibold hover:bg-cyan-800 disabled:opacity-50"
            >
              Book Appointment
            </button>
          </form>
        </div>

        {/* AI Tools & Radiology Queue (Enforced by accessAiTools & signRadiologyAi) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-700" />
              <span>Assistive AI &amp; Radiology Triage Queue</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {canSignRad
                ? 'Doctor: Full Review & Final Sign-off'
                : canAccessAi
                ? 'Nurse: View-Only AI Triage (Physician Sign-off Required)'
                : `${role}: Restricted by Clinical AI Boundary`}
            </span>
          </div>

          {canAccessAi ? (
            <div className="grid md:grid-cols-2 gap-4">
              {radQueue.map((r) => (
                <article key={r.id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-[#f8fafa]">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold">
                      {r.id} · {r.modality}
                    </span>
                    <span className={r.status === 'Clinician Signed' ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold">{r.patient}</div>
                  <p className="text-xs text-slate-600">AI Highlight: {r.aiHighlight}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate('ai-solutions', 'radiology-workbench')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold hover:border-cyan-600"
                    >
                      Inspect 3D Viewer
                    </button>
                    {r.status !== 'Clinician Signed' &&
                      (canSignRad ? (
                        <button
                          type="button"
                          onClick={() => onSignRadiology(r.id, role)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-700 text-white text-xs font-semibold hover:bg-cyan-800"
                        >
                          Clinician Sign-off
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-500 text-xs font-mono">
                          <Lock className="w-3 h-3" /> Physician Sign-off Only
                        </span>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3 text-sm text-slate-700"
              data-testid="ai-access-denied"
            >
              <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>AI Clinical Decision Support Restricted for {role}</strong>
                <p className="text-xs text-slate-600 mt-1">
                  To uphold patient data privacy and clinical safety, Radiology AI highlights and CDSS drug checks are accessible only to credentialed clinical roles (Doctor or Nurse).
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Smart ICU Ward & Cold-Chain Med-Bot 3D Digital Twin */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-700" />
                <span>Smart ICU Ward &amp; Cold-Chain Med-Bot 3D Twin</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Inspect bedside ICU telemetry sync, hydraulic articulated ward beds, and autonomous cold-chain medication delivery bots in interactive 3D.
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-800">
              Active View · {role}
            </span>
          </div>
          <HospitalWardTwinCanvas heightClassName="h-[420px]" />
        </section>

        {/* Clinical Molecule Suggestions, Research Updates & AI Summaries (Doctors & Clinical Care Teams) */}
        <section
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 scroll-mt-24"
          data-testid="provider-molecule-briefs"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-cyan-700 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Clinical Therapy Updates · Indirect Medical Affairs Briefs</span>
              </div>
              <h2 className="text-lg font-bold text-[#071e26] mt-0.5 flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-cyan-700" />
                <span>Emerging Molecules, Indications &amp; AI Clinical Summaries</span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 max-w-3xl">
                Evidence-focused updates on new <strong>mAbs, NIBs &amp; Peptides</strong> from first generic launchers, global generic launchers, and originator innovators—including indications, latest clinical trial shifts, AI dosing summaries, and side-effect monitoring to help physicians modernize treatment protocols.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pharma-tech', 'launch-radar')}
              className="text-xs font-semibold text-cyan-800 hover:underline whitespace-nowrap"
            >
              Open Pharma Launch Monitor →
            </button>
          </div>

          {canAccessAi ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <input
                  type="search"
                  aria-label="Filter clinical molecule briefs"
                  value={briefQuery}
                  onChange={(e) => setBriefQuery(e.target.value)}
                  placeholder="Search molecule, indication (NSCLC, COPD, T2D, CLL), or trial..."
                  className="flex-1 min-w-[220px] h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                />
                <select
                  aria-label="Filter clinical brief modality"
                  value={briefModality}
                  onChange={(e) => setBriefModality(e.target.value as MoleculeModality | 'All')}
                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="All">All Modalities</option>
                  <option value="mAb (Biologic)">mAb (Biologic)</option>
                  <option value="NIB (Kinase / Targeted)">NIB (Kinase / Targeted)</option>
                  <option value="Peptide / GLP-1">Peptide / GLP-1</option>
                </select>
                <select
                  aria-label="Filter scientific launcher source"
                  value={briefLauncher}
                  onChange={(e) => setBriefLauncher(e.target.value as LauncherCategory | 'All')}
                  className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                >
                  <option value="All">All Launcher Sources</option>
                  <option value="First Generic Launcher">First Generic Launcher</option>
                  <option value="Global Generic Launcher">Global Generic Launcher</option>
                  <option value="Originator Innovator">Originator Innovator</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {clinicianBriefs.slice(0, 6).map((item) => {
                  const isFeaturedByPartner = sharedBriefIds.includes(item.id);
                  const isBookmarked = bookmarkedMoleculeIds.includes(item.id);
                  const dossierSent = Boolean(requestedDossiers[item.id]);
                  return (
                    <article
                      key={item.id}
                      className={`rounded-xl border p-4 space-y-3 ${
                        isFeaturedByPartner
                          ? 'border-cyan-600/50 bg-cyan-50/30'
                          : 'border-slate-200 bg-[#f8fafa]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-cyan-800">
                          {item.modality} · {item.therapeuticArea}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-600">
                          {item.launcherCategory}
                          {isFeaturedByPartner ? ' · Partner Shared' : ''}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-[#071e26]">{item.molecule}</h3>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {item.genericBrand} · Originator: {item.originator}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {item.regulators.map((reg) => (
                          <span
                            key={reg}
                            className="px-2 py-0.5 rounded border border-slate-200 bg-white font-mono text-[10px] font-semibold text-slate-700"
                          >
                            {reg}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
                        <div>
                          <strong className="text-[#071e26]">Indications &amp; Cohort:</strong>{' '}
                          {item.indications.join(', ')} ({item.affectedPatientGroup})
                        </div>
                        <div>
                          <strong className="text-emerald-800">AI Summary · Usage &amp; Protocol Shift:</strong>{' '}
                          {item.aiSummaryUsage}
                        </div>
                        <div>
                          <strong className="text-amber-800">Side-Effects &amp; Monitoring:</strong>{' '}
                          {item.sideEffectsSummary}
                        </div>
                        <div>
                          <strong className="text-cyan-800">Latest Research Update:</strong>{' '}
                          {item.researchUpdate}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onToggleBookmarkMolecule?.(item, role)}
                          aria-pressed={isBookmarked}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                            isBookmarked
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-700'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span>{isBookmarked ? 'In Hospital Formulary' : 'Bookmark Protocol'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRequestedDossiers((prev) => ({ ...prev, [item.id]: true }));
                            onRequestMedicalDossier?.(item, role);
                          }}
                          disabled={dossierSent}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-700 text-cyan-800 hover:bg-cyan-50 text-xs font-semibold disabled:opacity-60"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{dossierSent ? 'Medical Affairs Dossier Requested' : 'Request Medical Affairs Dossier'}</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {clinicianBriefs.length === 0 && (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No clinical molecule briefs match this filter combination.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3 text-sm text-slate-700">
              <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Clinical Prescribing Briefs Restricted for {role}</strong>
                <p className="text-xs text-slate-600 mt-1">
                  New therapy AI summaries, side-effect monitoring guidelines, and medical affairs dossiers are available to credentialed clinical roles (Doctor or Nurse).
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Hospital ERP & RBAC Audit Panel (Administrator Only) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-cyan-700" />
              <span>Hospital ERP, Bed Operations &amp; RBAC Audit</span>
            </h2>
            <span className="text-xs font-mono text-slate-500">
              {canManageErp ? 'Administrator: Unlocked' : `${role}: Administrator Role Required`}
            </span>
          </div>

          {canManageErp ? (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 bg-[#f8fafa] p-4">
                  <div className="text-2xl font-bold text-cyan-800 tabular-nums">82%</div>
                  <div className="text-xs text-slate-600 mt-1">Ward Bed Occupancy (Sample)</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#f8fafa] p-4">
                  <div className="text-2xl font-bold text-cyan-800 tabular-nums">14 min</div>
                  <div className="text-xs text-slate-600 mt-1">Average OPD Wait Target</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-[#f8fafa] p-4">
                  <div className="text-2xl font-bold text-cyan-800 tabular-nums">৳ 15,30,400</div>
                  <div className="text-xs text-slate-600 mt-1">Sample Monthly ERP Ledger</div>
                </div>
              </div>

              {canViewAudit && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-cyan-700" />
                    <span>Live RBAC &amp; Clinical Governance Audit Trail</span>
                  </h3>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                    {auditLog.slice(0, 8).map((entry, idx) => (
                      <div key={idx} className="px-3.5 py-2 text-xs flex flex-wrap justify-between gap-2">
                        <span>
                          <strong className="font-mono text-cyan-800">{entry.role}</strong> · {entry.action}
                        </span>
                        <span className="font-mono text-slate-500">{entry.ref}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3 text-sm text-slate-700"
              data-testid="erp-access-denied"
            >
              <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Hospital ERP &amp; Audit Logs Restricted for {role}</strong>
                <p className="text-xs text-slate-600 mt-1">
                  Financial ledgers, bed configuration, and RBAC privacy logs require the <strong>Administrator</strong> role. Switch to Administrator above to inspect Hospital ERP &amp; Governance.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Hospital & Clinic Direct Global Sourcing & DGDA Compassionate / NPA Hub */}
        <section
          id="hospital-sourcing-hub"
          data-testid="hospital-sourcing-hub"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 scroll-mt-24"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-cyan-700 font-semibold flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 shrink-0" />
                <span>Hospital Direct Sourcing · China NMPA Originators &amp; Turkey / China MedTech</span>
              </div>
              <h2 className="text-lg font-bold text-[#071e26] mt-0.5">
                Unapproved Medicines (China Originators + DGDA NPA), Hospital Beds &amp; Robotic Surgery
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-3xl">
                Source originator medicines unavailable or unapproved in Bangladesh directly from{' '}
                <strong>China</strong> (often substantially lower in cost than US/EU markets) with{' '}
                <strong>DGDA Compassionate Use / Named Patient Access (NPA)</strong> dossier support, alongside{' '}
                <strong>hospital beds, clinical devices, and robotic surgery systems</strong> from vetted{' '}
                <strong>Chinese &amp; Turkish</strong> sourcing partners.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {canSubmitSourcing
                ? `${role}: Sourcing & DGDA Intake Unlocked`
                : canViewSourcingHub
                ? 'Nurse: Read-Only Reference'
                : `${role}: Restricted`}
            </span>
          </div>

          {canViewSourcingHub ? (
            <div className="space-y-6">
              {/* Hairline-Divided Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-y border-slate-200 py-3.5 text-xs">
                <div className="sm:border-r sm:border-slate-200 sm:pr-3">
                  <span className="text-slate-500 block">Partner Catalog Lines</span>
                  <span className="text-base font-bold text-[#071e26] font-mono tabular-nums">
                    {HOSPITAL_SOURCING_CATALOG.length} direct SKUs
                  </span>
                </div>
                <div className="sm:border-r sm:border-slate-200 sm:pr-3">
                  <span className="text-slate-500 block">China NMPA Originators</span>
                  <span className="text-base font-bold text-cyan-800 font-mono tabular-nums">
                    {HOSPITAL_SOURCING_CATALOG.filter((c) => c.originHub === 'China NMPA Originator Hub').length}{' '}
                    NPA-ready
                  </span>
                </div>
                <div className="sm:border-r sm:border-slate-200 sm:pr-3">
                  <span className="text-slate-500 block">Active Sourcing Filings</span>
                  <span className="text-base font-bold text-[#071e26] font-mono tabular-nums">
                    {sourcingSummary.total} requests
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">DGDA NPA / Quote Active</span>
                  <span className="text-base font-bold text-emerald-700 font-mono tabular-nums">
                    {sourcingSummary.dgdaAssistedCount} DGDA filings
                  </span>
                </div>
              </div>

              {/* Dual-Stream Controls + Search */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="inline-flex flex-wrap rounded-lg bg-white border border-slate-200 p-1 gap-1"
                    role="group"
                    aria-label="Hospital Sourcing Stream Filter"
                  >
                    {[
                      { id: 'all' as const, label: 'All Sourcing' },
                      { id: 'medicines' as const, label: 'Unapproved Medicines (China + DGDA)' },
                      { id: 'medtech' as const, label: 'Beds, Devices & Robotic Surgery (CN / TR)' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        aria-pressed={sourcingStream === tab.id}
                        onClick={() => {
                          setSourcingStream(tab.id);
                          if (tab.id === 'medicines') {
                            setSourcingCategoryFilter('Unapproved / Unavailable Medicine');
                          } else if (sourcingCategoryFilter === 'Unapproved / Unavailable Medicine') {
                            setSourcingCategoryFilter('All');
                          }
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          sourcingStream === tab.id
                            ? 'bg-[#03151c] text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Showing {filteredSourcingCatalog.length} of {HOSPITAL_SOURCING_CATALOG.length} direct partner SKUs
                  </span>
                </div>

                <div className="grid sm:grid-cols-12 gap-2.5">
                  <input
                    type="search"
                    aria-label="Search global hospital sourcing catalog"
                    value={sourcingQuery}
                    onChange={(e) => setSourcingQuery(e.target.value)}
                    placeholder="Search China originator, robotic surgery, ICU bed, Turkey..."
                    className="sm:col-span-6 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                  />
                  <select
                    aria-label="Filter sourcing category"
                    value={sourcingCategoryFilter}
                    onChange={(e) =>
                      setSourcingCategoryFilter(e.target.value as 'All' | HospitalSourcingCategory)
                    }
                    className="sm:col-span-3 h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="All">All Categories</option>
                    <option value="Unapproved / Unavailable Medicine">
                      Unapproved / Unavailable Medicine
                    </option>
                    <option value="Hospital Beds">Hospital Beds</option>
                    <option value="Clinical Equipment & Devices">Clinical Equipment &amp; Devices</option>
                    <option value="Robotic Surgery Systems">Robotic Surgery Systems</option>
                  </select>
                  <select
                    aria-label="Filter origin sourcing hub"
                    value={sourcingHubFilter}
                    onChange={(e) =>
                      setSourcingHubFilter(e.target.value as 'All' | SourcingOriginHub)
                    }
                    className="sm:col-span-3 h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                  >
                    <option value="All">All Origin Hubs</option>
                    <option value="China NMPA Originator Hub">China NMPA Originator Hub</option>
                    <option value="China MedTech Partner">China MedTech Partner</option>
                    <option value="Turkey MedTech Partner">Turkey MedTech Partner</option>
                  </select>
                </div>
              </div>

              {/* Catalog Grid */}
              <div className="grid md:grid-cols-2 gap-4">
                {filteredSourcingCatalog.map((item) => (
                  <article
                    key={item.id}
                    className="min-w-0 rounded-xl border border-slate-200 bg-[#f8fafa] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-cyan-800">
                          {item.originHub} · {item.partnerRegion}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-slate-600">
                          {item.category}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-sm font-bold text-[#071e26] leading-snug">
                          {item.name}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{item.partnerName}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-lg p-2.5 text-xs">
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            Direct Sourcing Est.
                          </span>
                          <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                            {fmtUSD(item.directSourcingPriceUsd)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block">
                            US/EU Ref. Benchmark
                          </span>
                          <span className="text-sm font-semibold text-slate-500 line-through font-mono tabular-nums">
                            {fmtUSD(item.referenceBenchmarkPriceUsd)}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">{item.clinicalSpec}</p>
                      <div className="text-xs text-emerald-900 bg-emerald-50/70 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                        <strong>Cost Advantage:</strong> {item.priceAdvantageNote}
                      </div>
                      <div className="text-xs text-cyan-950 bg-cyan-50/70 border border-cyan-200 rounded-lg px-2.5 py-1.5">
                        <strong>DGDA / Import Pathway:</strong> {item.dgdaPathwayNote}
                      </div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap gap-1">
                        {item.regulatoryCertifications.map((cert) => (
                          <span
                            key={cert}
                            className="px-2 py-0.5 rounded border border-slate-200 bg-white font-mono text-[10px] font-semibold text-slate-700"
                          >
                            {cert}
                          </span>
                        ))}
                        <span className="px-2 py-0.5 rounded border border-slate-200 bg-white font-mono text-[10px] text-slate-500">
                          {item.leadTimeWeeks}
                        </span>
                      </div>

                      {canSubmitSourcing ? (
                        <button
                          type="button"
                          onClick={() => handlePrefillCatalogItem(item)}
                          className="w-full py-2 rounded-lg border border-cyan-700 text-cyan-800 hover:bg-cyan-50 text-xs font-semibold transition-colors"
                        >
                          Select for Hospital Quote / DGDA Filing
                        </button>
                      ) : (
                        <span className="block text-[11px] font-mono text-slate-500">
                          Switch to Doctor or Administrator to file quote / DGDA request
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {filteredSourcingCatalog.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  No direct sourcing catalog items match this filter.
                </p>
              )}

              {/* Intake Form & Active Filings Queue */}
              <div className="grid lg:grid-cols-12 gap-6 items-start pt-2">
                <form
                  onSubmit={handleSourcingSubmit}
                  className="lg:col-span-5 min-w-0 rounded-xl border border-slate-200 bg-[#f8fafa] p-5 space-y-3.5"
                  data-testid="hospital-sourcing-form"
                >
                  <h3 className="text-base font-bold text-[#071e26]">
                    Request Direct Sourcing &amp; DGDA Permission
                  </h3>
                  <p className="text-xs text-slate-600">
                    Doctors can request China originator medicines with DGDA Compassionate Use / NPA clearance; Administrators can file ward beds, clinical devices, and surgical robotics orders.
                  </p>

                  <div>
                    <label htmlFor="src-hospital-name" className="block text-xs font-semibold mb-1">
                      Hospital / Clinic Name
                    </label>
                    <input
                      id="src-hospital-name"
                      type="text"
                      value={srcHospitalName}
                      onChange={(e) => setSrcHospitalName(e.target.value)}
                      required
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="src-category" className="block text-xs font-semibold mb-1">
                        Category
                      </label>
                      <select
                        id="src-category"
                        value={srcCategory}
                        onChange={(e) => setSrcCategory(e.target.value as HospitalSourcingCategory)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                      >
                        <option value="Unapproved / Unavailable Medicine">
                          Unapproved / Unavailable Medicine
                        </option>
                        <option value="Hospital Beds">Hospital Beds</option>
                        <option value="Clinical Equipment & Devices">
                          Clinical Equipment &amp; Devices
                        </option>
                        <option value="Robotic Surgery Systems">Robotic Surgery Systems</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="src-hub" className="block text-xs font-semibold mb-1">
                        Sourcing Partner Hub
                      </label>
                      <select
                        id="src-hub"
                        value={srcOriginHub}
                        onChange={(e) => setSrcOriginHub(e.target.value as SourcingOriginHub)}
                        className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                      >
                        <option value="China NMPA Originator Hub">China NMPA Originator Hub</option>
                        <option value="China MedTech Partner">China MedTech Partner</option>
                        <option value="Turkey MedTech Partner">Turkey MedTech Partner</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label htmlFor="src-item-name" className="block text-xs font-semibold mb-1">
                        Originator Drug or Equipment Model
                      </label>
                      <input
                        id="src-item-name"
                        type="text"
                        value={srcItemName}
                        onChange={(e) => setSrcItemName(e.target.value)}
                        required
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="src-quantity" className="block text-xs font-semibold mb-1">
                        Units / Packs
                      </label>
                      <input
                        id="src-quantity"
                        type="number"
                        min={1}
                        max={10000}
                        value={srcQuantity}
                        onChange={(e) => setSrcQuantity(e.target.value)}
                        required
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={srcDgdaAssist}
                      onChange={(e) => setSrcDgdaAssist(e.target.checked)}
                      className="mt-0.5 accent-cyan-700"
                    />
                    <span>
                      <strong>Request DGDA Compassionate Use / Named Patient Access (NPA)</strong>{' '}
                      import clearance &amp; regulatory dossier assistance
                    </span>
                  </label>

                  <div>
                    <label htmlFor="src-context" className="block text-xs font-semibold mb-1">
                      Patient Cohort / Clinical Department Context
                    </label>
                    <input
                      id="src-context"
                      type="text"
                      value={srcContext}
                      onChange={(e) => setSrcContext(e.target.value)}
                      required
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm"
                    />
                  </div>

                  {srcError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                      {srcError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmitSourcing}
                    className="w-full py-2.5 rounded-lg bg-[#03151c] hover:bg-[#072430] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {canSubmitSourcing
                      ? 'Submit Sourcing & DGDA Request'
                      : 'Doctor or Administrator Role Required to Submit'}
                  </button>
                </form>

                {/* Active Sourcing Queue */}
                <div className="lg:col-span-7 min-w-0 space-y-3" data-testid="hospital-sourcing-queue">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-[#071e26]">
                      Hospital Sourcing &amp; DGDA Filings Queue ({sourcingRequests.length})
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {canManageErp
                        ? 'Administrator: Status Transition Unlocked'
                        : 'Admin advances quote & transit stages'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sourcingRequests.map((req) => (
                      <article
                        key={req.ref}
                        className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-bold text-cyan-800">
                            {req.ref} · {req.originHub}
                          </span>
                          <span
                            className={`font-mono font-semibold ${
                              req.status === 'Approved / In Transit'
                                ? 'text-emerald-700'
                                : req.status === 'DGDA Filing / Partner Quote'
                                ? 'text-cyan-800'
                                : 'text-amber-700'
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>

                        <div>
                          <div className="text-sm font-bold text-[#071e26]">{req.itemName}</div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {req.hospitalName} · {req.category} ·{' '}
                            <span className="font-mono font-semibold">Qty: {req.quantity}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <strong>Context:</strong> {req.patientOrDeptContext}
                          </span>
                          <span className="font-mono text-[11px] font-semibold text-cyan-800">
                            {req.dgdaAssistance ? 'DGDA NPA Dossier Included' : 'Standard Device NOC'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-0.5">
                          <span className="text-slate-500 font-mono text-[11px]">
                            Filed by: {req.requestedByRole}
                          </span>

                          {canManageErp && req.status === 'Submitted' && (
                            <button
                              type="button"
                              onClick={() =>
                                onAdvanceSourcingStatus(
                                  req.ref,
                                  'DGDA Filing / Partner Quote',
                                  role
                                )
                              }
                              className="px-3 py-1.5 rounded-lg border border-cyan-700 text-cyan-800 font-semibold hover:bg-cyan-50"
                            >
                              Issue Partner Quote &amp; DGDA Filing
                            </button>
                          )}

                          {canManageErp && req.status === 'DGDA Filing / Partner Quote' && (
                            <button
                              type="button"
                              onClick={() =>
                                onAdvanceSourcingStatus(req.ref, 'Approved / In Transit', role)
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                            >
                              Approve &amp; Mark In Transit
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">
                Note: Cost benchmarks, China/Turkey partner lead times, and DGDA NPA/Compassionate Use workflow statuses represent synthetic prototype demonstrations and do not constitute formal regulatory approval or live customs brokerage.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3 text-sm text-slate-700"
              data-testid="sourcing-access-denied"
            >
              <Lock className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Global Direct Sourcing &amp; DGDA Hub Restricted for {role}</strong>
                <p className="text-xs text-slate-600 mt-1">
                  Unapproved medicine Named Patient Access filings, China/Turkey medical equipment quotes, and DGDA permits require a clinical physician (<strong>Doctor</strong>) or <strong>Administrator</strong> role.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
