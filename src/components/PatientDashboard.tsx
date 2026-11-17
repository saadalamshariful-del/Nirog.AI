import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarClock,
  Check,
  Download,
  Pill,
  Plus,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import type {
  PatientPrescription,
  PatientVitalReading,
  ProviderAppointment,
  RouteId,
} from '../types/nirog';
import {
  buildAdherenceProjectionSeries,
  buildPatientAdherenceSeries,
  buildPatientVitalsCsv,
  buildVitalProjectionSeries,
  classifyVitalStatus,
  computeWeeklyAdherencePct,
  filterPatientAppointments,
  filterPrescriptions,
  sliceVitalReadingsByHorizon,
  validateAndCreateVitalReading,
} from '../utils/logic';

interface PatientDashboardProps {
  vitals: PatientVitalReading[];
  prescriptions: PatientPrescription[];
  appointments: ProviderAppointment[];
  diaryOn: boolean;
  diaryDays: Record<number, boolean>;
  onLogVital: (reading: PatientVitalReading) => void;
  onQuickRefill: (rxId: string, productId: string) => void;
  onNavigate: (route: RouteId, focusId?: string) => void;
}

type VitalChartTab = 'glucose' | 'bp' | 'lipids' | 'adherence';
type TimeHorizon = '7D' | '30D' | '90D';

interface ChartTooltipEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: { isProjected?: boolean };
}

const VitalsChartTooltip: React.FC<{
  active?: boolean;
  label?: string;
  payload?: ChartTooltipEntry[];
  tab: VitalChartTab;
}> = ({ active, label, payload, tab }) => {
  if (!active || !payload || payload.length === 0) return null;
  const isProjected = Boolean(payload[0]?.payload?.isProjected);
  const displayItems = payload.filter((entry) => entry.value !== undefined);
  if (displayItems.length === 0) return null;

  const unitForKey = (key?: string): string => {
    if (!key) return '';
    const lower = key.toLowerCase();
    if (lower.includes('glucose') || lower.includes('ldl') || lower.includes('hdl')) return ' mg/dL';
    if (lower.includes('hba1c') || lower.includes('adherence') || lower.includes('target')) return '%';
    if (lower.includes('systolic') || lower.includes('diastolic')) return ' mmHg';
    if (lower.includes('heartrate')) return ' bpm';
    if (lower.includes('weight')) return ' kg';
    if (lower.includes('bmi')) return ' kg/m²';
    if (lower.includes('doses')) return ' doses';
    return '';
  };

  return (
    <div className="rounded-lg bg-[#03151c] border border-cyan-500/40 px-3.5 py-2.5 text-xs text-slate-100 shadow-lg space-y-1.5 min-w-[235px]">
      <div className="font-mono font-bold text-cyan-300 border-b border-white/10 pb-1">
        {label} · {isProjected ? '7-Day SMA Forecast' : tab === 'adherence' ? 'Dose Adherence' : 'Clinical Reading'}
      </div>
      <div className="space-y-1">
        {displayItems.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span
                className="inline-block w-2.5 h-0.5 rounded-sm"
                style={{ backgroundColor: entry.color || '#22d3ee' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold text-white tabular-nums">
              {entry.value}
              {unitForKey(entry.dataKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PatientDashboard: React.FC<PatientDashboardProps> = ({
  vitals,
  prescriptions,
  appointments,
  diaryOn,
  diaryDays,
  onLogVital,
  onQuickRefill,
  onNavigate,
}) => {
  const [chartTab, setChartTab] = useState<VitalChartTab>('glucose');
  const [horizon, setHorizon] = useState<TimeHorizon>('30D');
  const [showProjection, setShowProjection] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [rxFilter, setRxFilter] = useState<'All' | PatientPrescription['status']>('All');
  const [aptFilter, setAptFilter] = useState<'All' | ProviderAppointment['status']>('All');
  const [refilledIds, setRefilledIds] = useState<Record<string, boolean>>({});
  const [logError, setLogError] = useState('');

  // Series toggles per chart tab
  const [visibleSeries, setVisibleSeries] = useState<Record<string, boolean>>({
    fastingGlucoseMgDl: true,
    postMealGlucoseMgDl: true,
    hba1cPct: true,
    systolicMmHg: true,
    diastolicMmHg: true,
    heartRateBpm: true,
    ldlMgDl: true,
    hdlMgDl: true,
    bmi: true,
  });

  const latestVital = vitals[vitals.length - 1];
  const [formValues, setFormValues] = useState({
    fastingGlucose: String(latestVital?.fastingGlucoseMgDl ?? 108),
    postMealGlucose: String(latestVital?.postMealGlucoseMgDl ?? 144),
    systolic: String(latestVital?.systolicMmHg ?? 122),
    diastolic: String(latestVital?.diastolicMmHg ?? 76),
    heartRate: String(latestVital?.heartRateBpm ?? 72),
    weightKg: String(latestVital?.weightKg ?? 73.8),
  });

  const vitalSlice = useMemo(
    () => sliceVitalReadingsByHorizon(vitals, horizon),
    [vitals, horizon]
  );

  const vitalChartData = useMemo(
    () =>
      showProjection
        ? buildVitalProjectionSeries(vitals, horizon, 7, 3)
        : vitalSlice.map((r) => ({ ...r, isProjected: false })),
    [vitals, vitalSlice, horizon, showProjection]
  );

  const adherenceSeries = useMemo(
    () => buildPatientAdherenceSeries(diaryOn, diaryDays, horizon),
    [diaryOn, diaryDays, horizon]
  );

  const adherenceChartData = useMemo(
    () =>
      showProjection
        ? buildAdherenceProjectionSeries(adherenceSeries, 7, 2)
        : adherenceSeries.map((p) => ({ ...p, isProjected: false })),
    [adherenceSeries, showProjection]
  );

  const weeklyAdherencePct = computeWeeklyAdherencePct(diaryOn, diaryDays);
  const vitalStatus = classifyVitalStatus(latestVital);
  const dueRefillsCount = prescriptions.filter((p) => p.status === 'Refill Due').length;
  const pendingVisitsCount = appointments.filter((a) => a.status !== 'Completed').length;

  const filteredRx = useMemo(
    () => filterPrescriptions(prescriptions, rxFilter),
    [prescriptions, rxFilter]
  );

  const filteredApts = useMemo(
    () => filterPatientAppointments(appointments, aptFilter),
    [appointments, aptFilter]
  );

  const toggleSeries = (key: string, groupKeys: string[]) => {
    setVisibleSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const activeCount = groupKeys.filter((k) => next[k]).length;
      if (activeCount === 0) return prev;
      return next;
    });
  };

  const handleSaveVital = (e: React.FormEvent) => {
    e.preventDefault();
    setLogError('');
    const result = validateAndCreateVitalReading(
      {
        fastingGlucose: Number(formValues.fastingGlucose),
        postMealGlucose: Number(formValues.postMealGlucose),
        systolic: Number(formValues.systolic),
        diastolic: Number(formValues.diastolic),
        heartRate: Number(formValues.heartRate),
        weightKg: Number(formValues.weightKg),
      },
      latestVital
    );
    if (!result.ok) {
      setLogError(result.error);
      return;
    }
    onLogVital(result.reading);
    setShowLogForm(false);
  };

  const handleExportVitalsCsv = () => {
    if (vitals.length === 0) return;
    const csv = buildPatientVitalsCsv(vitals);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nirog-patient-vitals-${horizon.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickRefillClick = (rx: PatientPrescription) => {
    onQuickRefill(rx.id, rx.productId);
    setRefilledIds((prev) => ({ ...prev, [rx.id]: true }));
  };

  const statusTextTone =
    vitalStatus.label === 'Elevated'
      ? 'text-red-700'
      : vitalStatus.label === 'Watch'
        ? 'text-amber-700'
        : 'text-emerald-700';

  return (
    <div className="space-y-6" data-testid="patient-dashboard">
      {/* Main Telemetry Card: KPI Summary Strip + Log Vitals + Switchable Recharts Canvas */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2 text-[#071e26]">
              <Activity className="w-5 h-5 text-emerald-700" />
              <span>Patient Health Dashboard</span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Longitudinal vital trends, active prescriptions, and upcoming clinician follow-ups synchronized across your care team.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLogError('');
                setShowLogForm((prev) => !prev);
              }}
              aria-expanded={showLogForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#03151c] hover:bg-[#072430] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showLogForm ? 'Close Vitals Form' : 'Log Vitals'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportVitalsCsv}
              disabled={vitals.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:border-emerald-700 text-xs font-semibold text-slate-700 hover:text-emerald-800 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Vitals CSV</span>
            </button>
          </div>
        </div>

        {/* Hairline-Divided 4-Column KPI Strip (Single Elevation) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 sm:gap-y-0 sm:divide-x divide-slate-200 border-y border-slate-200 py-3.5">
          <div className="pr-3 sm:pr-4">
            <span className="text-xs text-slate-500 block">Active Prescriptions</span>
            <span className="text-lg font-bold text-[#071e26] font-mono tabular-nums">
              {prescriptions.length}{' '}
              <span className="text-xs font-normal text-amber-700">
                ({dueRefillsCount} due)
              </span>
            </span>
          </div>
          <div className="pl-3 sm:px-4 border-l border-slate-200 sm:border-l-0">
            <span className="text-xs text-slate-500 block">Upcoming Appointments</span>
            <span className="text-lg font-bold text-cyan-800 font-mono tabular-nums">
              {pendingVisitsCount}{' '}
              <span className="text-xs font-normal text-slate-500">
                of {appointments.length} total
              </span>
            </span>
          </div>
          <div className="pr-3 sm:px-4 pt-3 sm:pt-0 border-t border-slate-200 sm:border-t-0">
            <span className="text-xs text-slate-500 block">7-Day Dose Adherence</span>
            <span className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
              {weeklyAdherencePct}%
            </span>
          </div>
          <div className="pl-3 sm:pl-4 pt-3 sm:pt-0 border-t border-l border-slate-200 sm:border-t-0 sm:border-l-0">
            <span className="text-xs text-slate-500 block">Latest Glucose · Resting BP</span>
            <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
              <span className="text-sm sm:text-[15px] font-bold text-[#071e26] font-mono tabular-nums sm:whitespace-nowrap">
                {latestVital
                  ? `${latestVital.fastingGlucoseMgDl} mg/dL · ${latestVital.systolicMmHg}/${latestVital.diastolicMmHg}`
                  : '—'}
              </span>
              <span className={`text-xs font-semibold whitespace-nowrap ${statusTextTone}`}>
                {vitalStatus.label}
              </span>
            </div>
          </div>
        </div>

        {/* Inline Log Vitals Form */}
        {showLogForm && (
          <form
            onSubmit={handleSaveVital}
            className="rounded-xl bg-[#f8fafa] border border-slate-200 p-4 space-y-4"
            aria-label="Log new personal vital signs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#071e26]">
                Record Today&apos;s Vital Readings
              </h3>
              <span className="text-xs text-slate-500">
                Immediately updates Recharts trends &amp; EMR baseline
              </span>
            </div>

            {logError && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 font-medium"
              >
                {logError}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="vit-fasting" className="block text-xs font-semibold mb-1 text-slate-700">
                  Fasting Glucose (mg/dL)
                </label>
                <input
                  id="vit-fasting"
                  type="number"
                  required
                  value={formValues.fastingGlucose}
                  onChange={(e) => setFormValues({ ...formValues, fastingGlucose: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vit-postmeal" className="block text-xs font-semibold mb-1 text-slate-700">
                  Post-Meal Glucose (mg/dL)
                </label>
                <input
                  id="vit-postmeal"
                  type="number"
                  required
                  value={formValues.postMealGlucose}
                  onChange={(e) => setFormValues({ ...formValues, postMealGlucose: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vit-sys" className="block text-xs font-semibold mb-1 text-slate-700">
                  Systolic BP (mmHg)
                </label>
                <input
                  id="vit-sys"
                  type="number"
                  required
                  value={formValues.systolic}
                  onChange={(e) => setFormValues({ ...formValues, systolic: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vit-dia" className="block text-xs font-semibold mb-1 text-slate-700">
                  Diastolic BP (mmHg)
                </label>
                <input
                  id="vit-dia"
                  type="number"
                  required
                  value={formValues.diastolic}
                  onChange={(e) => setFormValues({ ...formValues, diastolic: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vit-hr" className="block text-xs font-semibold mb-1 text-slate-700">
                  Heart Rate (bpm)
                </label>
                <input
                  id="vit-hr"
                  type="number"
                  required
                  value={formValues.heartRate}
                  onChange={(e) => setFormValues({ ...formValues, heartRate: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="vit-weight" className="block text-xs font-semibold mb-1 text-slate-700">
                  Weight (kg)
                </label>
                <input
                  id="vit-weight"
                  type="number"
                  step="0.1"
                  required
                  value={formValues.weightKg}
                  onChange={(e) => setFormValues({ ...formValues, weightKg: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
              >
                Save Vital Reading
              </button>
            </div>
          </form>
        )}

        {/* Switchable Vital Chart Tabs + Horizon Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="inline-flex flex-wrap rounded-lg bg-slate-100 p-1 gap-1"
            role="tablist"
            aria-label="Personal health metric charts"
          >
            {(
              [
                ['glucose', 'Glucose & HbA1c'],
                ['bp', 'BP & Heart Rate'],
                ['lipids', 'Lipid & BMI'],
                ['adherence', 'Dose Adherence'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={chartTab === id}
                onClick={() => setChartTab(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  chartTab === id
                    ? 'bg-emerald-700 text-white'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={showProjection}
              onClick={() => setShowProjection((p) => !p)}
              data-testid="vitals-projection-toggle"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                showProjection
                  ? 'bg-cyan-700 border-cyan-700 text-white'
                  : 'bg-white border-slate-300 text-slate-700 hover:border-cyan-700 hover:text-cyan-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Projection {showProjection ? '(7D SMA)' : ''}</span>
            </button>

            <div
              className="inline-flex rounded-lg bg-slate-100 p-1 gap-1"
              role="group"
              aria-label="Vital metrics timeframe"
            >
              {(['7D', '30D', '90D'] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={horizon === h}
                  onClick={() => setHorizon(h)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    horizon === h ? 'bg-[#03151c] text-white' : 'text-slate-700 hover:bg-white'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Series Visibility Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {chartTab === 'glucose' && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['fastingGlucoseMgDl', 'Fasting Glucose (mg/dL)', '#059669'],
                ['postMealGlucoseMgDl', 'Post-Meal Glucose (mg/dL)', '#0e7490'],
                ['hba1cPct', 'HbA1c (%)', '#d97706'],
              ].map(([key, lbl, color]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visibleSeries[key]}
                  onClick={() =>
                    toggleSeries(key, ['fastingGlucoseMgDl', 'postMealGlucoseMgDl', 'hba1cPct'])
                  }
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium ${
                    visibleSeries[key]
                      ? 'border-slate-300 bg-slate-50 text-[#071e26]'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
                  <span>{lbl}</span>
                </button>
              ))}
            </div>
          )}

          {chartTab === 'bp' && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['systolicMmHg', 'Systolic (mmHg)', '#0e7490'],
                ['diastolicMmHg', 'Diastolic (mmHg)', '#059669'],
                ['heartRateBpm', 'Heart Rate (bpm)', '#6366f1'],
              ].map(([key, lbl, color]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visibleSeries[key]}
                  onClick={() => toggleSeries(key, ['systolicMmHg', 'diastolicMmHg', 'heartRateBpm'])}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium ${
                    visibleSeries[key]
                      ? 'border-slate-300 bg-slate-50 text-[#071e26]'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
                  <span>{lbl}</span>
                </button>
              ))}
            </div>
          )}

          {chartTab === 'lipids' && (
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['ldlMgDl', 'LDL Cholesterol (mg/dL)', '#d97706'],
                ['hdlMgDl', 'HDL Cholesterol (mg/dL)', '#059669'],
                ['bmi', 'BMI (kg/m²)', '#0e7490'],
              ].map(([key, lbl, color]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visibleSeries[key]}
                  onClick={() => toggleSeries(key, ['ldlMgDl', 'hdlMgDl', 'bmi'])}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium ${
                    visibleSeries[key]
                      ? 'border-slate-300 bg-slate-50 text-[#071e26]'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}
                >
                  <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: color }} />
                  <span>{lbl}</span>
                </button>
              ))}
            </div>
          )}

          {chartTab === 'adherence' && (
            <div className="text-xs text-slate-600">
              Synced live with <strong>My Medicine Diary</strong> check-ins ({weeklyAdherencePct}% this week vs 85% target).
            </div>
          )}

          <span className="text-[11px] font-mono text-slate-500 ml-auto">
            {chartTab === 'adherence'
              ? `${adherenceSeries.length} intervals · Target 85%${showProjection ? ' + 7D SMA trend' : ''}`
              : `${vitalSlice.length} readings (${horizon})${showProjection ? ' + 7D SMA trend' : ''}`}
          </span>
        </div>

        {/* Recharts Responsive Viewport */}
        <div
          className="w-full h-[270px]"
          role="region"
          aria-label="Patient personal health metrics chart"
          data-testid="patient-vitals-chart"
        >
          <ResponsiveContainer width="100%" height={270} minWidth={0}>
            {chartTab === 'glucose' ? (
              <LineChart data={vitalChartData} margin={{ top: 10, right: 14, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                <YAxis
                  yAxisId="left"
                  domain={[70, 220]}
                  tick={{ fontSize: 11, fill: '#059669' }}
                  stroke="#cbd5e1"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[5, 10]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#d97706' }}
                  stroke="#cbd5e1"
                />
                <Tooltip content={<VitalsChartTooltip tab={chartTab} />} />
                <ReferenceLine
                  yAxisId="left"
                  y={120}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: 'Fasting Goal 120', position: 'insideBottomRight', fontSize: 10, fill: '#64748b' }}
                />
                {visibleSeries.fastingGlucoseMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="fastingGlucoseMgDl"
                    name="Fasting Glucose"
                    stroke="#059669"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#059669' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.fastingGlucoseMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="projFastingGlucoseMgDl"
                    name="Fasting Glucose (7D SMA)"
                    stroke="#059669"
                    strokeWidth={2.2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#059669', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.postMealGlucoseMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="postMealGlucoseMgDl"
                    name="Post-Meal Glucose"
                    stroke="#0e7490"
                    strokeWidth={2.2}
                    dot={{ r: 3, fill: '#0e7490' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.postMealGlucoseMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="projPostMealGlucoseMgDl"
                    name="Post-Meal Glucose (7D SMA)"
                    stroke="#0e7490"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#0e7490', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.hba1cPct && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="hba1cPct"
                    name="HbA1c"
                    stroke="#d97706"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#d97706' }}
                  />
                )}
                {showProjection && visibleSeries.hba1cPct && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="projHba1cPct"
                    name="HbA1c (7D SMA)"
                    stroke="#d97706"
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#d97706', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            ) : chartTab === 'bp' ? (
              <LineChart data={vitalChartData} margin={{ top: 10, right: 14, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                <YAxis domain={[55, 160]} tick={{ fontSize: 11, fill: '#0e7490' }} stroke="#cbd5e1" />
                <Tooltip content={<VitalsChartTooltip tab={chartTab} />} />
                <ReferenceLine
                  y={120}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: 'Systolic Goal 120', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
                />
                {visibleSeries.systolicMmHg && (
                  <Line
                    type="monotone"
                    dataKey="systolicMmHg"
                    name="Systolic BP"
                    stroke="#0e7490"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#0e7490' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.systolicMmHg && (
                  <Line
                    type="monotone"
                    dataKey="projSystolicMmHg"
                    name="Systolic BP (7D SMA)"
                    stroke="#0e7490"
                    strokeWidth={2.2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#0e7490', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.diastolicMmHg && (
                  <Line
                    type="monotone"
                    dataKey="diastolicMmHg"
                    name="Diastolic BP"
                    stroke="#059669"
                    strokeWidth={2.2}
                    dot={{ r: 3, fill: '#059669' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.diastolicMmHg && (
                  <Line
                    type="monotone"
                    dataKey="projDiastolicMmHg"
                    name="Diastolic BP (7D SMA)"
                    stroke="#059669"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#059669', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.heartRateBpm && (
                  <Line
                    type="monotone"
                    dataKey="heartRateBpm"
                    name="Heart Rate"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#6366f1' }}
                  />
                )}
                {showProjection && visibleSeries.heartRateBpm && (
                  <Line
                    type="monotone"
                    dataKey="projHeartRateBpm"
                    name="Heart Rate (7D SMA)"
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="2 3"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#6366f1', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            ) : chartTab === 'lipids' ? (
              <LineChart data={vitalChartData} margin={{ top: 10, right: 14, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                <YAxis
                  yAxisId="left"
                  domain={[30, 170]}
                  tick={{ fontSize: 11, fill: '#d97706' }}
                  stroke="#cbd5e1"
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[18, 32]}
                  tick={{ fontSize: 11, fill: '#0e7490' }}
                  stroke="#cbd5e1"
                />
                <Tooltip content={<VitalsChartTooltip tab={chartTab} />} />
                <ReferenceLine
                  yAxisId="left"
                  y={100}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  label={{ value: 'LDL Goal 100', position: 'insideTopRight', fontSize: 10, fill: '#64748b' }}
                />
                {visibleSeries.ldlMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="ldlMgDl"
                    name="LDL Cholesterol"
                    stroke="#d97706"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#d97706' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.ldlMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="projLdlMgDl"
                    name="LDL Cholesterol (7D SMA)"
                    stroke="#d97706"
                    strokeWidth={2.2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#d97706', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.hdlMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="hdlMgDl"
                    name="HDL Cholesterol"
                    stroke="#059669"
                    strokeWidth={2.2}
                    dot={{ r: 3, fill: '#059669' }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {showProjection && visibleSeries.hdlMgDl && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="projHdlMgDl"
                    name="HDL Cholesterol (7D SMA)"
                    stroke="#059669"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#059669', strokeWidth: 2 }}
                  />
                )}
                {visibleSeries.bmi && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="bmi"
                    name="BMI"
                    stroke="#0e7490"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#0e7490' }}
                  />
                )}
                {showProjection && visibleSeries.bmi && (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="projBmi"
                    name="BMI (7D SMA)"
                    stroke="#0e7490"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={{ r: 3, fill: '#ffffff', stroke: '#0e7490', strokeWidth: 2 }}
                  />
                )}
              </LineChart>
            ) : (
              <ComposedChart data={adherenceChartData} margin={{ top: 10, right: 14, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#059669' }} stroke="#cbd5e1" />
                <Tooltip content={<VitalsChartTooltip tab={chartTab} />} />
                <ReferenceLine
                  y={85}
                  stroke="#0e7490"
                  strokeDasharray="4 4"
                  label={{ value: 'Clinical Goal 85%', position: 'insideTopRight', fontSize: 10, fill: '#0e7490' }}
                />
                <Bar
                  dataKey="adherencePct"
                  name="Adherence Rate"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  barSize={horizon === '7D' ? 28 : 34}
                />
                {showProjection && (
                  <Line
                    type="monotone"
                    dataKey="projAdherencePct"
                    name="Adherence (7D SMA)"
                    stroke="#0e7490"
                    strokeWidth={2.5}
                    strokeDasharray="5 4"
                    dot={{ r: 3.5, fill: '#ffffff', stroke: '#0e7490', strokeWidth: 2 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="targetPct"
                  name="Target Baseline"
                  stroke="#03151c"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{vitalStatus.detail}</span>
          {showProjection && (
            <span className="font-mono text-cyan-800 font-medium">
              Dashed curves plot the 7-day Simple Moving Average (7D SMA) trend line and forward projection from current history (educational trend only).
            </span>
          )}
        </div>
      </section>

      {/* Active Prescriptions & Upcoming Appointments Split */}
      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Active Prescriptions */}
        <section
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          data-testid="patient-prescriptions-card"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold flex items-center gap-2 text-[#071e26] whitespace-nowrap">
              <Pill className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Active Prescriptions ({filteredRx.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('cart')}
              className="text-xs font-semibold text-cyan-800 hover:underline whitespace-nowrap shrink-0"
            >
              Pharmacy Cart
            </button>
          </div>

          <div
            className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter prescriptions by status"
          >
            {(['All', 'Refill Due', 'Cold-Chain', 'Active'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={rxFilter === st}
                onClick={() => setRxFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  rxFilter === st ? 'bg-white text-[#071e26] shadow-xs' : 'text-slate-600 hover:text-[#071e26]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {filteredRx.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {filteredRx.map((rx) => {
                const statusColor =
                  rx.status === 'Refill Due'
                    ? 'text-amber-700'
                    : rx.status === 'Cold-Chain'
                      ? 'text-cyan-800'
                      : 'text-emerald-700';
                const justRefilled = Boolean(refilledIds[rx.id]);
                return (
                  <div key={rx.id} className="py-3 first:pt-1 last:pb-1 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[#071e26]">
                          {rx.medicationName} <span className="font-mono text-xs">{rx.strength}</span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {rx.dosageSchedule} · {rx.prescriber}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap ${statusColor}`}>
                        {rx.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">
                        {rx.refillsRemaining} refills left · Next: {rx.nextRefillDate}
                      </span>
                      <button
                        type="button"
                        disabled={rx.refillsRemaining <= 0}
                        onClick={() => handleQuickRefillClick(rx)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700 text-emerald-800 hover:bg-emerald-50 text-xs font-semibold disabled:opacity-40 whitespace-nowrap shrink-0"
                      >
                        {justRefilled ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added to Cart</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Quick Refill</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center space-y-2">
              <p className="text-xs text-slate-600">No prescriptions match &ldquo;{rxFilter}&rdquo;.</p>
              <button
                type="button"
                onClick={() => setRxFilter('All')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800 hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Show All Prescriptions</span>
              </button>
            </div>
          )}
        </section>

        {/* Upcoming Appointments */}
        <section
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          data-testid="patient-appointments-card"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold flex items-center gap-2 text-[#071e26] whitespace-nowrap">
              <CalendarClock className="w-4 h-4 text-cyan-700 shrink-0" />
              <span>Upcoming Appointments ({filteredApts.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('providers')}
              className="text-xs font-semibold text-cyan-800 hover:underline whitespace-nowrap shrink-0"
            >
              Providers Portal
            </button>
          </div>

          <div
            className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg"
            role="group"
            aria-label="Filter appointments by status"
          >
            {(['All', 'Waiting', 'In Review', 'Scheduled', 'Completed'] as const).map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={aptFilter === st}
                onClick={() => setAptFilter(st)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  aptFilter === st ? 'bg-white text-[#071e26] shadow-xs' : 'text-slate-600 hover:text-[#071e26]'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {filteredApts.length > 0 ? (
            <div className="divide-y divide-slate-200">
              {filteredApts.map((apt) => {
                const aptColor =
                  apt.status === 'Completed'
                    ? 'text-emerald-700'
                    : apt.status === 'In Review'
                      ? 'text-cyan-800'
                      : apt.status === 'Waiting'
                        ? 'text-amber-700'
                        : 'text-slate-700';
                return (
                  <div key={apt.id} className="py-3 first:pt-1 last:pb-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-[#071e26]">{apt.reason}</div>
                        <div className="text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                          {apt.id} · {apt.time} · {apt.patient}
                        </div>
                      </div>
                      <span className={`text-xs font-semibold whitespace-nowrap ${aptColor}`}>
                        {apt.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Triage &amp; EMR: {apt.vitals || 'Pending nurse triage'}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center space-y-2">
              <p className="text-xs text-slate-600">No appointments with status &ldquo;{aptFilter}&rdquo;.</p>
              <button
                type="button"
                onClick={() => setAptFilter('All')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800 hover:underline"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Show All Appointments</span>
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
