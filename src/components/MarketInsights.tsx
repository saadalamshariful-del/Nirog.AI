import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, RotateCcw, TrendingUp } from 'lucide-react';
import { PHARMA_MARKET_METRICS } from '../data/seed';
import type { TherapeuticArea } from '../types/nirog';
import { buildMarketTrendCsv, buildMarketTrendSeries, type MarketTrendPoint } from '../utils/logic';

interface MarketInsightsProps {
  areaFilter: TherapeuticArea | 'All';
  regionFilter: 'All' | 'Bangladesh' | 'Southeast Asia' | 'East Africa';
  onResetFilters?: () => void;
}

type TrendSeriesKey = 'demand' | 'growth' | 'benchmark';
type VolumeSeriesKey = 'scripts' | 'cold';

interface TooltipPayloadEntry {
  dataKey?: string;
  name?: string;
  value?: number;
  color?: string;
  payload?: MarketTrendPoint;
}

const InsightsTooltip: React.FC<{
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
}> = ({ active, label, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  const spread = point ? (point.productGrowthPct - point.benchmarkGrowthPct).toFixed(1) : null;

  return (
    <div className="rounded-lg bg-[#03151c] border border-cyan-500/40 px-3.5 py-2.5 text-xs text-slate-100 shadow-lg space-y-1.5 min-w-[210px]">
      <div className="font-mono font-bold text-cyan-300 border-b border-white/10 pb-1">
        {label} · Market Telemetry
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span
                className="inline-block w-2.5 h-0.5 rounded-sm"
                style={{ backgroundColor: entry.color || '#22d3ee' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold text-white tabular-nums">
              {entry.dataKey === 'prescriptionsK'
                ? `${Number(entry.value).toLocaleString('en-US')}K`
                : entry.dataKey === 'marketDemandIndex'
                ? `${entry.value}/100`
                : `${entry.value}%`}
            </span>
          </div>
        ))}
      </div>
      {spread !== null && (
        <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-emerald-300 tabular-nums">
          <span>Growth Spread vs Benchmark</span>
          <span>+{spread}%</span>
        </div>
      )}
    </div>
  );
};

export const MarketInsights: React.FC<MarketInsightsProps> = ({
  areaFilter,
  regionFilter,
  onResetFilters,
}) => {
  const [horizon, setHorizon] = useState<'3M' | '6M' | '12M'>('12M');
  const [chartMode, setChartMode] = useState<'trends' | 'volume'>('trends');
  const [visibleTrends, setVisibleTrends] = useState<Record<TrendSeriesKey, boolean>>({
    demand: true,
    growth: true,
    benchmark: true,
  });
  const [visibleVolume, setVisibleVolume] = useState<Record<VolumeSeriesKey, boolean>>({
    scripts: true,
    cold: true,
  });

  const series = useMemo(
    () => buildMarketTrendSeries(PHARMA_MARKET_METRICS, areaFilter, regionFilter, horizon),
    [areaFilter, regionFilter, horizon]
  );

  const latest = series[series.length - 1];
  const earliest = series[0];
  const demandDelta =
    latest && earliest ? (latest.marketDemandIndex - earliest.marketDemandIndex).toFixed(1) : '0.0';
  const benchmarkSpread =
    latest ? (latest.productGrowthPct - latest.benchmarkGrowthPct).toFixed(1) : '0.0';

  const toggleTrendSeries = (key: TrendSeriesKey) => {
    setVisibleTrends((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.demand && !next.growth && !next.benchmark) return prev;
      return next;
    });
  };

  const toggleVolumeSeries = (key: VolumeSeriesKey) => {
    setVisibleVolume((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.scripts && !next.cold) return prev;
      return next;
    });
  };

  const handleExportCsv = () => {
    if (series.length === 0) return;
    const csv = buildMarketTrendCsv(series, areaFilter, regionFilter);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nirog-market-insights-${areaFilter.toLowerCase()}-${horizon.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
      data-testid="market-insights-chart"
    >
      {/* Toolbar Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-[#071e26]">
            <TrendingUp className="w-5 h-5 text-cyan-700" />
            <span>Market Insights · Demand &amp; Product Growth Trends</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Synthetic longitudinal trajectory for{' '}
            <strong className="text-[#071e26]">{areaFilter === 'All' ? 'all therapeutic areas' : areaFilter}</strong>{' '}
            across{' '}
            <strong className="text-[#071e26]">{regionFilter === 'All' ? 'all partner regions' : regionFilter}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1" role="group" aria-label="Chart metric mode">
            <button
              type="button"
              aria-pressed={chartMode === 'trends'}
              onClick={() => setChartMode('trends')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'trends' ? 'bg-cyan-700 text-white' : 'text-slate-700 hover:bg-white'
              }`}
            >
              Demand &amp; Growth
            </button>
            <button
              type="button"
              aria-pressed={chartMode === 'volume'}
              onClick={() => setChartMode('volume')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                chartMode === 'volume' ? 'bg-cyan-700 text-white' : 'text-slate-700 hover:bg-white'
              }`}
            >
              Rx Volume &amp; Cold-Chain
            </button>
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1" role="group" aria-label="Time horizon">
            {(['3M', '6M', '12M'] as const).map((h) => (
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

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={series.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-cyan-700 hover:text-cyan-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Single-Elevation Hairline KPI Summary Bar (Zero Nested Cards) */}
      {latest && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-y border-slate-200 py-3">
          <div className="px-2 sm:pr-4 py-1">
            <span className="text-xs text-slate-500 block">Latest Demand Index</span>
            <span className="text-lg font-bold text-cyan-800 font-mono tabular-nums">
              {latest.marketDemandIndex}/100
            </span>
          </div>
          <div className="px-2 sm:px-4 py-1">
            <span className="text-xs text-slate-500 block">{horizon} Index Lift</span>
            <span className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
              +{demandDelta} pts
            </span>
          </div>
          <div className="px-2 sm:px-4 py-1">
            <span className="text-xs text-slate-500 block">YoY Product Growth</span>
            <span className="text-lg font-bold text-emerald-700 font-mono tabular-nums">
              +{latest.productGrowthPct}%{' '}
              <span className="text-xs font-normal text-slate-500">(+{benchmarkSpread}% vs cat)</span>
            </span>
          </div>
          <div className="px-2 sm:pl-4 py-1">
            <span className="text-xs text-slate-500 block">Monthly Rx Volume</span>
            <span className="text-lg font-bold text-[#071e26] font-mono tabular-nums">
              {latest.prescriptionsK.toLocaleString('en-US')}K
            </span>
          </div>
        </div>
      )}

      {/* Interactive Series Visibility Controls + Recharts Multi-Line Canvas */}
      {series.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Toggle chart series lines">
              {chartMode === 'trends' ? (
                <>
                  <button
                    type="button"
                    aria-pressed={visibleTrends.demand}
                    onClick={() => toggleTrendSeries('demand')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      visibleTrends.demand
                        ? 'border-cyan-700/40 bg-cyan-50/70 text-[#071e26]'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className="w-3 h-0.5 bg-[#0e7490] inline-block" />
                    <span>Market Demand Index</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibleTrends.growth}
                    onClick={() => toggleTrendSeries('growth')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      visibleTrends.growth
                        ? 'border-emerald-700/40 bg-emerald-50/70 text-[#071e26]'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className="w-3 h-0.5 bg-[#059669] inline-block" />
                    <span>YoY Product Growth (%)</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibleTrends.benchmark}
                    onClick={() => toggleTrendSeries('benchmark')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      visibleTrends.benchmark
                        ? 'border-amber-700/40 bg-amber-50/70 text-[#071e26]'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-[#d97706] inline-block" />
                    <span>Category Benchmark YoY (%)</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-pressed={visibleVolume.scripts}
                    onClick={() => toggleVolumeSeries('scripts')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      visibleVolume.scripts
                        ? 'border-sky-700/40 bg-sky-50/70 text-[#071e26]'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className="w-3 h-0.5 bg-[#0284c7] inline-block" />
                    <span>Monthly Rx Volume (K)</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={visibleVolume.cold}
                    onClick={() => toggleVolumeSeries('cold')}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                      visibleVolume.cold
                        ? 'border-teal-700/40 bg-teal-50/70 text-[#071e26]'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <span className="w-3 h-0.5 bg-[#0d9488] inline-block" />
                    <span>Cold-Chain Share (%)</span>
                  </button>
                </>
              )}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {series.length}-month synthetic index · Target Demand 75
            </span>
          </div>

          <div className="w-full h-[290px]" role="region" aria-label="Market demand and product growth line chart">
            <ResponsiveContainer width="100%" height={290} minWidth={0}>
              {chartMode === 'trends' ? (
                <LineChart data={series} margin={{ top: 12, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                  <YAxis
                    yAxisId="left"
                    domain={[30, 100]}
                    tick={{ fontSize: 11, fill: '#0e7490' }}
                    stroke="#cbd5e1"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 30]}
                    unit="%"
                    tick={{ fontSize: 11, fill: '#059669' }}
                    stroke="#cbd5e1"
                  />
                  <Tooltip content={<InsightsTooltip />} />
                  <ReferenceLine
                    yAxisId="left"
                    y={75}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{ value: 'Target 75', position: 'insideTopLeft', fontSize: 10, fill: '#64748b' }}
                  />
                  {visibleTrends.demand && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="marketDemandIndex"
                      name="Market Demand Index"
                      stroke="#0e7490"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0e7490' }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {visibleTrends.growth && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="productGrowthPct"
                      name="YoY Product Growth (%)"
                      stroke="#059669"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#059669' }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {visibleTrends.benchmark && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="benchmarkGrowthPct"
                      name="Category Benchmark YoY (%)"
                      stroke="#d97706"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                </LineChart>
              ) : (
                <LineChart data={series} margin={{ top: 12, right: 16, left: -4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} stroke="#cbd5e1" />
                  <YAxis
                    yAxisId="left"
                    unit="K"
                    tick={{ fontSize: 11, fill: '#0284c7' }}
                    stroke="#cbd5e1"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    unit="%"
                    tick={{ fontSize: 11, fill: '#0d9488' }}
                    stroke="#cbd5e1"
                  />
                  <Tooltip content={<InsightsTooltip />} />
                  {visibleVolume.scripts && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="prescriptionsK"
                      name="Monthly Rx Volume (K)"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0284c7' }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                  {visibleVolume.cold && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="coldChainSharePct"
                      name="Cold-Chain Share (%)"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0d9488' }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 py-10 px-4 text-center space-y-3">
          <p className="text-sm text-slate-700">
            No synthetic market cohorts match <strong>{areaFilter}</strong> in <strong>{regionFilter}</strong>.
          </p>
          {onResetFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#03151c] text-white text-xs font-semibold hover:bg-[#072430] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Portfolio &amp; Region Filters</span>
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Synthetic market trend telemetry · Consented, de-identified cohort index for enterprise demonstration.
      </p>
    </section>
  );
};
