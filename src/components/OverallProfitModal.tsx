import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FolderOpen,
  Search,
  TrendingUp,
  X
} from 'lucide-react';
import { SavedQuotation } from '../types';
import { formatLKR, formatUSD } from '../utils/calc';
import { computeTourFinancials } from '../utils/profitCalc';

interface OverallProfitModalProps {
  isOpen: boolean;
  savedQuotes: SavedQuotation[];
  onClose: () => void;
  onOpenChecklist: (quote: SavedQuotation) => void;
  onToggleConfirmed: (quote: SavedQuotation) => void;
  onOpenSavedModal: () => void;
}

export const OverallProfitModal: React.FC<OverallProfitModalProps> = ({
  isOpen,
  savedQuotes,
  onClose,
  onOpenChecklist,
  onToggleConfirmed,
  onOpenSavedModal
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actualsFilter, setActualsFilter] = useState<'all' | 'recorded' | 'pending'>('all');

  const confirmedRows = useMemo(() => {
    return savedQuotes
      .filter(q => Boolean(q.isConfirmed))
      .map(quote => ({
        quote,
        fin: computeTourFinancials(quote)
      }));
  }, [savedQuotes]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return confirmedRows.filter(({ quote, fin }) => {
      if (actualsFilter === 'recorded' && !fin.hasActualsEntered) return false;
      if (actualsFilter === 'pending' && fin.hasActualsEntered) return false;
      if (!term) return true;
      return (
        quote.id.toLowerCase().includes(term) ||
        (quote.customer?.custName || '').toLowerCase().includes(term) ||
        (quote.customer?.custCountry || '').toLowerCase().includes(term) ||
        (quote.customer?.travelDate || '').toLowerCase().includes(term)
      );
    });
  }, [confirmedRows, searchTerm, actualsFilter]);

  const totals = useMemo(() => {
    let totalQuotedLkr = 0;
    let totalQuotedUsd = 0;
    let totalRevenueActiveLkr = 0;
    let totalQuotedCostLkr = 0;
    let totalQuotedCostUsd = 0;
    let totalQuotedMarginLkr = 0;
    let totalQuotedMarginUsd = 0;
    let totalActualCostLkr = 0;
    let totalActualCostUsd = 0;
    let totalActualProfitLkr = 0;
    let totalActualProfitUsd = 0;
    let recordedRevenueLkr = 0;
    let totalAdvanceLkr = 0;
    let totalAdvanceUsd = 0;
    let totalBalanceLkr = 0;
    let totalBalanceUsd = 0;
    let recordedCount = 0;
    let pendingCount = 0;
    let totalPax = 0;

    filteredRows.forEach(({ quote, fin }) => {
      totalQuotedLkr += fin.adjustedQuotedPriceLkr;
      totalQuotedUsd += fin.adjustedTotalUsd;
      totalRevenueActiveLkr += fin.revenueAtActiveRateLkr;
      totalQuotedCostLkr += fin.quotedCostSubtotalLkr;
      totalQuotedCostUsd += fin.quotedCostSubtotalUsd;
      totalQuotedMarginLkr += fin.netQuotedMarginLkr;
      totalQuotedMarginUsd += fin.netQuotedMarginUsd;
      totalAdvanceLkr += fin.advanceLkr;
      totalAdvanceUsd += fin.advanceUsd;
      totalBalanceLkr += fin.balanceLkr;
      totalBalanceUsd += fin.balanceUsd;

      const paxCount =
        (quote.pax?.adults || 0) + (quote.pax?.child12 || 0) + (quote.pax?.child5 || 0);
      totalPax += paxCount;

      if (fin.hasActualsEntered) {
        recordedCount += 1;
        totalActualCostLkr += fin.totalActualCostLkr;
        totalActualCostUsd += fin.totalActualCostUsd;
        totalActualProfitLkr += fin.actualProfitLkr;
        totalActualProfitUsd += fin.actualProfitUsd;
        recordedRevenueLkr += fin.revenueAtActiveRateLkr;
      } else {
        pendingCount += 1;
      }
    });

    const overallActualMarginPct =
      recordedRevenueLkr > 0 ? (totalActualProfitLkr / recordedRevenueLkr) * 100 : 0;
    const overallQuotedMarginPct =
      totalQuotedLkr > 0 ? (totalQuotedMarginLkr / totalQuotedLkr) * 100 : 0;

    return {
      count: filteredRows.length,
      recordedCount,
      pendingCount,
      totalPax,
      totalQuotedLkr,
      totalQuotedUsd,
      totalRevenueActiveLkr,
      totalQuotedCostLkr,
      totalQuotedCostUsd,
      totalQuotedMarginLkr,
      totalQuotedMarginUsd,
      totalActualCostLkr,
      totalActualCostUsd,
      totalActualProfitLkr,
      totalActualProfitUsd,
      recordedRevenueLkr,
      overallActualMarginPct,
      overallQuotedMarginPct,
      totalAdvanceLkr,
      totalAdvanceUsd,
      totalBalanceLkr,
      totalBalanceUsd
    };
  }, [filteredRows]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const headers = [
      'Quote ID',
      'Customer',
      'Country',
      'Arrival Date',
      'Days',
      'Pax',
      'Quoted Price (USD)',
      'Quoted Price (LKR)',
      'Quoted Margin (LKR)',
      'Active USD Rate',
      'Actual Cost + Expenses (LKR)',
      'Actual Cost + Expenses (USD)',
      'Actual Profit (LKR)',
      'Actual Profit (USD)',
      'Actual Margin (%)',
      'Actuals Status',
      'Advance Paid (USD)',
      'Balance Due (USD)'
    ];

    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows = filteredRows.map(({ quote, fin }) => {
      const paxCount =
        (quote.pax?.adults || 0) + (quote.pax?.child12 || 0) + (quote.pax?.child5 || 0);
      return [
        quote.id,
        quote.customer?.custName || 'Valued Guest',
        quote.customer?.custCountry || '',
        quote.customer?.travelDate || '',
        quote.pax?.days || 1,
        paxCount,
        fin.adjustedTotalUsd.toFixed(2),
        Math.round(fin.adjustedQuotedPriceLkr),
        Math.round(fin.netQuotedMarginLkr),
        fin.activeRate,
        fin.hasActualsEntered ? Math.round(fin.totalActualCostLkr) : 'Pending',
        fin.hasActualsEntered ? fin.totalActualCostUsd.toFixed(2) : 'Pending',
        fin.hasActualsEntered ? Math.round(fin.actualProfitLkr) : 'Pending',
        fin.hasActualsEntered ? fin.actualProfitUsd.toFixed(2) : 'Pending',
        fin.hasActualsEntered ? fin.actualProfitPct.toFixed(1) + '%' : 'Pending',
        fin.hasActualsEntered ? 'Recorded' : 'Pending Actuals',
        fin.advanceUsd.toFixed(2),
        fin.balanceUsd.toFixed(2)
      ]
        .map(escapeCsv)
        .join(',');
    });

    const summaryRow = [
      'TOTAL (CONFIRMED)',
      `${totals.count} Tours`,
      '',
      '',
      '',
      totals.totalPax,
      totals.totalQuotedUsd.toFixed(2),
      Math.round(totals.totalQuotedLkr),
      Math.round(totals.totalQuotedMarginLkr),
      '',
      Math.round(totals.totalActualCostLkr),
      totals.totalActualCostUsd.toFixed(2),
      Math.round(totals.totalActualProfitLkr),
      totals.totalActualProfitUsd.toFixed(2),
      totals.overallActualMarginPct.toFixed(1) + '%',
      `${totals.recordedCount}/${totals.count} Recorded`,
      totals.totalAdvanceUsd.toFixed(2),
      totals.totalBalanceUsd.toFixed(2)
    ]
      .map(escapeCsv)
      .join(',');

    const csvContent = [headers.map(escapeCsv).join(','), ...rows, summaryRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Voya_Lanka_Confirmed_Tours_Profit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                Overall Confirmed Tours Profit
              </h2>
              <p className="text-xs text-slate-400 truncate mt-0.5 tabular-nums">
                {confirmedRows.length} Confirmed Tour{confirmedRows.length === 1 ? '' : 's'} included
                · {savedQuotes.length - confirmedRows.length} Unconfirmed quotation
                {savedQuotes.length - confirmedRows.length === 1 ? '' : 's'} excluded
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {filteredRows.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Export CSV</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenSavedModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Manage Saved Tours</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close overall profit modal"
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {confirmedRows.length === 0 ? (
            <div className="border border-slate-800 bg-slate-950/60 rounded-xl p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-bold text-slate-100">
                  No Confirmed Tours Yet
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Only quotations marked as <strong className="text-slate-200">Confirmed</strong>{' '}
                  are included in the Overall Profit calculation. Open your Saved Quotations and
                  click <strong className="text-emerald-400">Confirm Tour</strong> on booked tours
                  to track them here.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSavedModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Open Saved Quotations</span>
              </button>
            </div>
          ) : (
            <>
              {/* 1. Overall KPI Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">
                    Confirmed Tours
                  </span>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-100">
                    {totals.count} Tour{totals.count === 1 ? '' : 's'}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums mt-1">
                    {totals.recordedCount} with actuals · {totals.pendingCount} pending ·{' '}
                    {totals.totalPax} Pax
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">
                    Total Quoted Price
                  </span>
                  <div className="text-lg font-bold font-mono tabular-nums text-teal-300">
                    {formatUSD(totals.totalQuotedUsd)}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-200 mt-0.5">
                    {formatLKR(totals.totalQuotedLkr)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                    Advance: {formatUSD(totals.totalAdvanceUsd)} · Due:{' '}
                    {formatUSD(totals.totalBalanceUsd)}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs text-slate-400 block mb-1">
                    Total Actual Cost (Recorded)
                  </span>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-100">
                    {formatLKR(totals.totalActualCostLkr)}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-300 mt-0.5">
                    {formatUSD(totals.totalActualCostUsd)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                    Quoted Cost: {formatLKR(totals.totalQuotedCostLkr)}
                  </div>
                </div>

                <div
                  className={`rounded-xl p-4 border ${
                    totals.totalActualProfitLkr >= 0
                      ? 'bg-emerald-950/25 border-emerald-700/60'
                      : 'bg-rose-950/25 border-rose-700/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-300">
                      Overall Actual Profit
                    </span>
                    <span
                      className={`text-xs font-mono font-bold tabular-nums ${
                        totals.totalActualProfitLkr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {totals.recordedCount > 0
                        ? `${totals.overallActualMarginPct.toFixed(1)}%`
                        : 'Pending'}
                    </span>
                  </div>
                  <div
                    className={`text-lg font-extrabold font-mono tabular-nums ${
                      totals.totalActualProfitLkr >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {totals.totalActualProfitLkr < 0 ? '-' : ''}
                    {formatLKR(Math.abs(totals.totalActualProfitLkr))}
                  </div>
                  <div
                    className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${
                      totals.totalActualProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {totals.totalActualProfitUsd < 0 ? '-' : ''}
                    {formatUSD(Math.abs(totals.totalActualProfitUsd))}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1">
                    Quoted Margin: {formatLKR(totals.totalQuotedMarginLkr)} (
                    {totals.overallQuotedMarginPct.toFixed(1)}%)
                  </div>
                </div>
              </div>

              {/* 2. Search & Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Filter confirmed tours by ID, guest, country, or date..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActualsFilter('all')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      actualsFilter === 'all'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Confirmed ({confirmedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActualsFilter('recorded')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      actualsFilter === 'recorded'
                        ? 'bg-emerald-900/70 text-emerald-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Actuals Recorded (
                    {confirmedRows.filter(r => r.fin.hasActualsEntered).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActualsFilter('pending')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      actualsFilter === 'pending'
                        ? 'bg-amber-900/60 text-amber-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Pending Actuals (
                    {confirmedRows.filter(r => !r.fin.hasActualsEntered).length})
                  </button>
                </div>
              </div>

              {/* 3. Confirmed Tours Profit Breakdown Table */}
              <div className="border border-slate-800 bg-slate-950/50 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3.5">Tour ID &amp; Arrival</th>
                        <th className="py-2.5 px-3">Customer &amp; Pax</th>
                        <th className="py-2.5 px-3 text-right">Quoted Price</th>
                        <th className="py-2.5 px-3 text-right">Quoted Margin</th>
                        <th className="py-2.5 px-3 text-right">Actual Cost</th>
                        <th className="py-2.5 px-3 text-right">Actual Profit</th>
                        <th className="py-2.5 px-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredRows.length > 0 ? (
                        filteredRows.map(({ quote, fin }) => {
                          const days = quote.pax?.days || 1;
                          const nights = Math.max(0, days - 1);
                          const adults = quote.pax?.adults || 0;
                          const children =
                            (quote.pax?.child12 || 0) + (quote.pax?.child5 || 0);
                          const arrivalLabel = quote.customer?.travelDate
                            ? new Date(
                                quote.customer.travelDate + 'T00:00:00'
                              ).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric'
                              })
                            : 'No date';

                          return (
                            <tr
                              key={quote.id}
                              onClick={() => onOpenChecklist(quote)}
                              className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                              title="Click to open Checklist & edit Actual Costs"
                            >
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <span className="font-mono font-bold text-sky-400 block">
                                  {quote.id}
                                </span>
                                <span className="text-[11px] text-slate-400 tabular-nums block">
                                  {arrivalLabel} · {days}D/{nights}N
                                </span>
                              </td>

                              <td className="py-3 px-3">
                                <span className="font-semibold text-slate-100 block">
                                  {quote.customer?.custName || 'Valued Guest'}
                                </span>
                                <span className="text-[11px] text-slate-400 block tabular-nums">
                                  {quote.customer?.custCountry || '-'} · {adults} Ad,{' '}
                                  {children} Ch
                                </span>
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span className="font-bold text-teal-300 block">
                                  {formatUSD(fin.adjustedTotalUsd)}
                                </span>
                                <span className="text-[11px] text-slate-300 block">
                                  {formatLKR(fin.adjustedQuotedPriceLkr)}
                                </span>
                                {fin.totalCustomerUpgradeUsd > 0 && (
                                  <span className="text-[10px] text-amber-300 block">
                                    +{formatUSD(fin.totalCustomerUpgradeUsd)} upgrade
                                  </span>
                                )}
                                {fin.totalCustomerUpgradeUsd === 0 && fin.focAdjustmentCount > 0 && (
                                  <span className="text-[10px] text-emerald-400 block">
                                    FOC hotel upgrade
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span className="font-semibold text-sky-300 block">
                                  {formatLKR(fin.netQuotedMarginLkr)}
                                </span>
                                <span className="text-[11px] text-slate-400 block">
                                  {formatUSD(fin.netQuotedMarginUsd)}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {fin.hasActualsEntered ? (
                                  <>
                                    <span className="font-semibold text-slate-100 block">
                                      {formatLKR(fin.totalActualCostLkr)}
                                    </span>
                                    <span className="text-[11px] text-slate-400 block">
                                      {formatUSD(fin.totalActualCostUsd)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-amber-400 font-sans font-medium">
                                    Pending entry
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {fin.hasActualsEntered ? (
                                  <>
                                    <span
                                      className={`font-bold block ${
                                        fin.actualProfitLkr >= 0
                                          ? 'text-emerald-400'
                                          : 'text-rose-400'
                                      }`}
                                    >
                                      {fin.actualProfitLkr < 0 ? '-' : ''}
                                      {formatLKR(Math.abs(fin.actualProfitLkr))}
                                    </span>
                                    <span className="text-[11px] text-slate-400 block">
                                      {fin.actualProfitUsd < 0 ? '-' : ''}
                                      {formatUSD(Math.abs(fin.actualProfitUsd))} (
                                      {fin.actualProfitPct.toFixed(1)}%)
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[11px] text-slate-400 font-sans">
                                    —
                                  </span>
                                )}
                              </td>

                              <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onOpenChecklist(quote);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-teal-700 hover:bg-teal-600 text-white transition-colors cursor-pointer"
                                  >
                                    <ClipboardCheck className="w-3.5 h-3.5" />
                                    <span>{fin.hasActualsEntered ? 'Edit Costs' : 'Enter Costs'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onToggleConfirmed(quote);
                                    }}
                                    className="px-2 py-1 text-[11px] font-medium rounded-md border border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-700/60 hover:bg-rose-950/30 transition-colors cursor-pointer"
                                    title="Remove from Confirmed Tours"
                                  >
                                    Unconfirm
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-8 text-center text-slate-400 text-xs"
                          >
                            No confirmed tours match the current search or filter.
                          </td>
                        </tr>
                      )}
                    </tbody>

                    {filteredRows.length > 0 && (
                      <tfoot className="border-t-2 border-slate-800 bg-slate-900/90 text-xs">
                        <tr>
                          <td colSpan={2} className="py-3.5 px-3.5 font-bold text-slate-100">
                            Grand Total ({totals.count} Confirmed Tour
                            {totals.count === 1 ? '' : 's'})
                            {totals.pendingCount > 0 && (
                              <span className="block text-[11px] font-normal text-amber-400 mt-0.5">
                                Actual Profit sums {totals.recordedCount} tour(s) with recorded actual costs ({totals.pendingCount} pending entry).
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-teal-300 block">
                              {formatUSD(totals.totalQuotedUsd)}
                            </span>
                            <span className="text-[11px] text-slate-300 block">
                              {formatLKR(totals.totalQuotedLkr)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-sky-300 block">
                              {formatLKR(totals.totalQuotedMarginLkr)}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {formatUSD(totals.totalQuotedMarginUsd)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="font-bold text-slate-100 block">
                              {formatLKR(totals.totalActualCostLkr)}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {formatUSD(totals.totalActualCostUsd)}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={`font-extrabold block ${
                                totals.totalActualProfitLkr >= 0
                                  ? 'text-emerald-300'
                                  : 'text-rose-300'
                              }`}
                            >
                              {totals.totalActualProfitLkr < 0 ? '-' : ''}
                              {formatLKR(Math.abs(totals.totalActualProfitLkr))}
                            </span>
                            <span
                              className={`text-[11px] font-bold block ${
                                totals.totalActualProfitUsd >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {totals.totalActualProfitUsd < 0 ? '-' : ''}
                              {formatUSD(Math.abs(totals.totalActualProfitUsd))} (
                              {totals.recordedCount > 0
                                ? `${totals.overallActualMarginPct.toFixed(1)}%`
                                : '0.0%'}
                              )
                            </span>
                          </td>
                          <td className="py-3.5 px-3.5" />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
