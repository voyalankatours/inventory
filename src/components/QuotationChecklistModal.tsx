import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Copy,
  FileText,
  Hotel,
  Plus,
  Route,
  Save,
  Trash2,
  Wallet,
  X
} from 'lucide-react';
import {
  ActualExpenseItem,
  ChecklistCostEntry,
  ChecklistHotelAdjustment,
  QuotationChecklistData,
  SavedQuotation
} from '../types';
import { formatLKR, formatUSD } from '../utils/calc';
import { computeTourFinancials } from '../utils/profitCalc';
import { getAllPartnerHotels } from '../utils/storage';

interface QuotationChecklistModalProps {
  isOpen: boolean;
  quote: SavedQuotation | null;
  onClose: () => void;
  onSaveChecklist: (updatedQuote: SavedQuotation) => Promise<void> | void;
  onLoadQuote: (quote: SavedQuotation) => void;
}

interface ExtractedHotelStay {
  key: string;
  hotelName: string;
  nights: number[];
  roomsCount: number;
  changeNotes: string[];
}

interface QuotedStayOption {
  key: string;
  nightNumber: number;
  hotelName: string;
  detailsLabel: string;
}

function buildDefaultChecklist(quote: SavedQuotation): QuotationChecklistData {
  const existing = quote.checklist;
  return {
    itinerarySent: existing?.itinerarySent ?? false,
    quotationSent: existing?.quotationSent ?? false,
    hotelVouchers: existing?.hotelVouchers ? { ...existing.hotelVouchers } : {},
    advanceReceived: existing?.advanceReceived ?? 0,
    advanceCurrency: existing?.advanceCurrency ?? 'USD',
    actualUsdRate:
      existing?.actualUsdRate && existing.actualUsdRate > 0
        ? existing.actualUsdRate
        : quote.pricing?.usdRate > 0
          ? quote.pricing.usdRate
          : 305,
    actualCosts: existing?.actualCosts ? { ...existing.actualCosts } : {},
    otherExpenses: existing?.otherExpenses
      ? existing.otherExpenses.map(e => ({ ...e }))
      : [],
    hotelAdjustments: existing?.hotelAdjustments
      ? existing.hotelAdjustments.map(a => ({ ...a }))
      : [],
    notes: existing?.notes ?? '',
    updatedAt: existing?.updatedAt
  };
}

export const QuotationChecklistModal: React.FC<QuotationChecklistModalProps> = ({
  isOpen,
  quote,
  onClose,
  onSaveChecklist,
  onLoadQuote
}) => {
  const [checklist, setChecklist] = useState<QuotationChecklistData | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && quote) {
      setChecklist(buildDefaultChecklist(quote));
      setIsConfirmed(Boolean(quote.isConfirmed));
    }
  }, [isOpen, quote]);

  const financials = useMemo(() => {
    if (!quote) return null;
    return computeTourFinancials(quote, checklist);
  }, [quote, checklist]);

  const partnerHotelOptions = useMemo(() => {
    if (!isOpen) return [];
    return getAllPartnerHotels().map(h => `${h.name} - ${h.destination}`);
  }, [isOpen]);

  // Quoted night stay options for Hotel Change / Upgrade selector
  const quotedStayOptions = useMemo<QuotedStayOption[]>(() => {
    if (!quote) return [];
    const days = Math.max(0, quote.pax?.days || 0);
    const nightCount = days > 0 ? Math.max(0, days - 1) : (quote.nights || []).length;
    const activeNights = (quote.nights || []).slice(0, nightCount || (quote.nights || []).length);
    const opts: QuotedStayOption[] = [];

    activeNights.forEach((night, i) => {
      const nNum = night.nightNumber || i + 1;
      (night.rooms || []).forEach((room, rIdx) => {
        const hotelName = (room.hotel || '').trim();
        if (!hotelName) return;
        const detailsLabel = [room.roomCategory, room.bedType, room.meal, room.roomView]
          .filter(Boolean)
          .join(' · ');
        opts.push({
          key: `night_${i}_room_${rIdx}_${room.id || rIdx}`,
          nightNumber: nNum,
          hotelName,
          detailsLabel
        });
      });
    });

    return opts;
  }, [quote]);

  // Automatically extract hotels included in the quotation (reflecting any hotel changes or upgrades)
  const hotelStays = useMemo<ExtractedHotelStay[]>(() => {
    if (!quote) return [];
    const days = Math.max(0, quote.pax?.days || 0);
    const nightCount = days > 0 ? Math.max(0, days - 1) : (quote.nights || []).length;
    const activeNights = (quote.nights || []).slice(0, nightCount || (quote.nights || []).length);
    const adjustments = checklist?.hotelAdjustments || [];

    const map = new Map<string, ExtractedHotelStay>();
    activeNights.forEach((night, nIdx) => {
      const nNum = night.nightNumber || nIdx + 1;
      (night.rooms || []).forEach((room, rIdx) => {
        const origHotel = (room.hotel || '').trim();
        if (!origHotel) return;
        const roomKey = `night_${nIdx}_room_${rIdx}_${room.id || rIdx}`;
        const matchingAdj = adjustments.find(a => a.nightKey === roomKey);

        let effectiveHotel = origHotel;
        let changeNote = '';
        if (matchingAdj) {
          const billingLabel =
            matchingAdj.billingMode === 'FOC'
              ? 'FOC'
              : `+${matchingAdj.customerChargeCurrency} ${Number(matchingAdj.customerChargeAmount || 0).toLocaleString()}`;
          if (
            matchingAdj.changeType === 'HOTEL_CHANGE' &&
            matchingAdj.updatedHotel.trim()
          ) {
            effectiveHotel = matchingAdj.updatedHotel.trim();
            changeNote = `Changed from ${origHotel} (${billingLabel})`;
          } else if (matchingAdj.changeType === 'SAME_HOTEL_UPGRADE') {
            changeNote = `Same-hotel upgrade: ${matchingAdj.updatedDetails || 'Upgraded'} (${billingLabel})`;
          }
        }

        const normKey = effectiveHotel.toLowerCase();
        const existing = map.get(normKey);
        if (existing) {
          if (!existing.nights.includes(nNum)) {
            existing.nights.push(nNum);
          }
          existing.roomsCount += 1;
          if (changeNote && !existing.changeNotes.includes(changeNote)) {
            existing.changeNotes.push(changeNote);
          }
        } else {
          map.set(normKey, {
            key: normKey,
            hotelName: effectiveHotel,
            nights: [nNum],
            roomsCount: 1,
            changeNotes: changeNote ? [changeNote] : []
          });
        }
      });
    });

    // Include custom multi-night hotel changes not tied to a single roomKey
    adjustments
      .filter(a => a.nightKey === 'custom' && a.changeType === 'HOTEL_CHANGE' && a.updatedHotel.trim())
      .forEach(adj => {
        const normKey = adj.updatedHotel.trim().toLowerCase();
        const billingLabel =
          adj.billingMode === 'FOC'
            ? 'FOC'
            : `+${adj.customerChargeCurrency} ${Number(adj.customerChargeAmount || 0).toLocaleString()}`;
        const note = `Added / Changed hotel (${billingLabel})`;
        if (!map.has(normKey)) {
          map.set(normKey, {
            key: normKey,
            hotelName: adj.updatedHotel.trim(),
            nights: adj.nightNumber ? [adj.nightNumber] : [],
            roomsCount: 1,
            changeNotes: [note]
          });
        }
      });

    return Array.from(map.values());
  }, [quote, checklist?.hotelAdjustments]);

  if (!isOpen || !quote || !checklist || !financials) return null;

  const {
    breakdown,
    quotedItems,
    computedRows,
    quotedUsdRate,
    activeRate,
    quotedCostSubtotalLkr,
    quotedCostSubtotalUsd,
    quotedMarkupPct,
    quotedMarginLkr,
    quotedDiscountLkr,
    netQuotedMarginLkr,
    netQuotedMarginUsd,
    quotedTotalUsd,
    quotedRevenueAtActiveRateLkr,
    totalCustomerUpgradeLkr,
    totalCustomerUpgradeUsd,
    focAdjustmentCount,
    chargedAdjustmentCount,
    adjustedTotalUsd,
    revenueAtActiveRateLkr,
    advanceLkr,
    advanceUsd,
    balanceLkr,
    balanceUsd,
    isOverpaid,
    totalActualItemCostLkr,
    totalActualItemCostUsd,
    totalCostDiffLkr,
    totalCostDiffUsd,
    totalOtherExpensesLkr,
    totalOtherExpensesUsd,
    actualProfitLkr,
    actualProfitUsd,
    actualProfitPct
  } = financials;

  const toLkr = (amount: number, currency: 'LKR' | 'USD') =>
    currency === 'USD' ? amount * activeRate : amount;
  const toUsd = (amount: number, currency: 'LKR' | 'USD') =>
    currency === 'USD' ? amount : activeRate > 0 ? amount / activeRate : 0;

  // Tour summary helpers
  const totalAdults = quote.pax?.adults || 0;
  const totalChildren = (quote.pax?.child12 || 0) + (quote.pax?.child5 || 0);
  const totalPax = totalAdults + totalChildren;
  const days = quote.pax?.days || 1;
  const nightsCount = Math.max(0, days - 1);

  const arrivalFormatted = quote.customer?.travelDate
    ? new Date(quote.customer.travelDate + 'T00:00:00').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : 'Not specified';

  const handleActualCostChange = (
    key: string,
    amount: number,
    currency: 'LKR' | 'USD'
  ) => {
    setChecklist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        actualCosts: {
          ...prev.actualCosts,
          [key]: { amount: Math.max(0, amount), currency }
        }
      };
    });
  };

  const handlePrefillActualsFromQuoted = () => {
    setChecklist(prev => {
      if (!prev) return prev;
      const nextCosts: Record<string, ChecklistCostEntry> = { ...prev.actualCosts };
      quotedItems.forEach(item => {
        nextCosts[item.key] = {
          amount: Math.round(item.quotedLkr),
          currency: 'LKR'
        };
      });
      return {
        ...prev,
        actualCosts: nextCosts
      };
    });
  };

  const handleAddOtherExpense = () => {
    setChecklist(prev => {
      if (!prev) return prev;
      const newItem: ActualExpenseItem = {
        id: 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        description: '',
        amount: 0,
        currency: 'LKR'
      };
      return {
        ...prev,
        otherExpenses: [...prev.otherExpenses, newItem]
      };
    });
  };

  const handleUpdateOtherExpense = (
    id: string,
    patch: Partial<ActualExpenseItem>
  ) => {
    setChecklist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        otherExpenses: prev.otherExpenses.map(exp =>
          exp.id === id ? { ...exp, ...patch } : exp
        )
      };
    });
  };

  const handleRemoveOtherExpense = (id: string) => {
    setChecklist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        otherExpenses: prev.otherExpenses.filter(exp => exp.id !== id)
      };
    });
  };

  const handleAddHotelAdjustment = () => {
    const firstStay = quotedStayOptions[0];
    setChecklist(prev => {
      if (!prev) return prev;
      const newAdj: ChecklistHotelAdjustment = {
        id: 'hadj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        nightKey: firstStay ? firstStay.key : 'custom',
        nightNumber: firstStay ? firstStay.nightNumber : undefined,
        changeType: 'HOTEL_CHANGE',
        quotedHotel: firstStay ? firstStay.hotelName : '',
        quotedRoomDetails: firstStay ? firstStay.detailsLabel : '',
        updatedHotel: '',
        updatedDetails: '',
        billingMode: 'FOC',
        customerChargeAmount: 0,
        customerChargeCurrency: 'USD',
        notes: ''
      };
      return {
        ...prev,
        hotelAdjustments: [...(prev.hotelAdjustments || []), newAdj]
      };
    });
  };

  const handleUpdateHotelAdjustment = (
    id: string,
    patch: Partial<ChecklistHotelAdjustment>
  ) => {
    setChecklist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        hotelAdjustments: (prev.hotelAdjustments || []).map(adj =>
          adj.id === id ? { ...adj, ...patch } : adj
        )
      };
    });
  };

  const handleRemoveHotelAdjustment = (id: string) => {
    setChecklist(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        hotelAdjustments: (prev.hotelAdjustments || []).filter(adj => adj.id !== id)
      };
    });
  };

  const handleToggleConfirmed = async () => {
    if (!checklist) return;
    const nextConfirmed = !isConfirmed;
    setIsConfirmed(nextConfirmed);
    setIsSaving(true);
    try {
      const updatedQuote: SavedQuotation = {
        ...quote,
        isConfirmed: nextConfirmed,
        confirmedAt: nextConfirmed ? quote.confirmedAt || new Date().toISOString() : undefined,
        checklist: {
          ...checklist,
          updatedAt: new Date().toISOString()
        }
      };
      await onSaveChecklist(updatedQuote);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!checklist) return;
    setIsSaving(true);
    try {
      const updatedQuote: SavedQuotation = {
        ...quote,
        isConfirmed,
        confirmedAt: isConfirmed ? quote.confirmedAt || new Date().toISOString() : undefined,
        checklist: {
          ...checklist,
          updatedAt: new Date().toISOString()
        }
      };
      await onSaveChecklist(updatedQuote);
    } finally {
      setIsSaving(false);
    }
  };

  const vouchersSentCount = hotelStays.filter(
    h => !!checklist.hotelVouchers[h.key]
  ).length;
  const hotelAdjustments = checklist.hotelAdjustments || [];

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  Tour Checklist &amp; Profit Calculation
                </h2>
                <span className="text-xs font-mono text-sky-400 font-semibold">
                  {quote.id}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    isConfirmed ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  · {isConfirmed ? 'Confirmed Tour' : 'Not Confirmed'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {quote.customer?.custName || 'Valued Guest'} · Arrival: {arrivalFormatted} ·{' '}
                {totalAdults} Adults, {totalChildren} Children ({days} Days / {nightsCount} Nights)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleToggleConfirmed}
              disabled={isSaving}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                isConfirmed
                  ? 'bg-emerald-950/60 border-emerald-600 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title={
                isConfirmed
                  ? 'Tour is confirmed and included in Overall Profit. Click to mark unconfirmed.'
                  : 'Click to mark this tour as Confirmed so it is included in Overall Profit.'
              }
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${
                  isConfirmed ? 'text-emerald-400' : 'text-slate-400'
                }`}
              />
              <span>{isConfirmed ? 'Confirmed Tour' : 'Confirm Tour'}</span>
            </button>
            <button
              type="button"
              onClick={() => onLoadQuote(quote)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              Load in Editor
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Checklist & Profit'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close checklist modal"
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* 1. Tour Summary Strip */}
          <section className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Tour Summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Customer Name</span>
                <span className="font-semibold text-slate-100">
                  {quote.customer?.custName || 'Valued Guest'}
                </span>
                {quote.customer?.custCountry && (
                  <span className="block text-[11px] text-slate-400">
                    {quote.customer.custCountry}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Arrival Date</span>
                <span className="font-semibold text-slate-100 tabular-nums">
                  {arrivalFormatted}
                </span>
                <span className="block text-[11px] text-slate-400 tabular-nums">
                  {days} Days / {nightsCount} Nights
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Adults &amp; Children</span>
                <span className="font-semibold text-slate-100 tabular-nums">
                  {totalAdults} Adults · {totalChildren} Children
                </span>
                <span className="block text-[11px] text-slate-400 tabular-nums">
                  {quote.pax?.child12 || 0} (&lt;12 yrs), {quote.pax?.child5 || 0} (&lt;5 yrs) · Total {totalPax} Pax
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">
                  {totalCustomerUpgradeUsd > 0 ? 'Adjusted Customer Total' : 'Quoted Package Total'}
                </span>
                <span className="font-bold text-teal-300 font-mono tabular-nums block">
                  {formatUSD(adjustedTotalUsd)}
                </span>
                <span className="text-[11px] text-slate-300 font-mono tabular-nums">
                  {formatLKR(revenueAtActiveRateLkr)}
                  {totalCustomerUpgradeUsd > 0 ? ` (incl. +${formatUSD(totalCustomerUpgradeUsd)})` : ''}
                </span>
              </div>
            </div>
          </section>

          {/* 2. Documents Checklist & Advance / Balance Payments */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Operations Checklist */}
            <section className="lg:col-span-7 bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Tour Dispatch Checklist
                  </h3>
                </div>
                <span className="text-xs text-slate-400 tabular-nums">
                  {[
                    checklist.itinerarySent ? 1 : 0,
                    checklist.quotationSent ? 1 : 0,
                    vouchersSentCount
                  ].reduce((a, b) => a + b, 0)}{' '}
                  / {2 + hotelStays.length} Completed
                </span>
              </div>

              {/* Itinerary Sent & Quotation Sent */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/70 hover:border-slate-700 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Route className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-100 block">
                        Itinerary Sent
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {checklist.itinerarySent ? 'Sent to guest' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checklist.itinerarySent}
                    onChange={e =>
                      setChecklist(prev =>
                        prev ? { ...prev, itinerarySent: e.target.checked } : prev
                      )
                    }
                    className="w-4 h-4 rounded border-slate-600 text-emerald-500 bg-slate-950 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/70 hover:border-slate-700 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-slate-100 block">
                        Quotation Sent
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {checklist.quotationSent ? 'Sent to guest' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checklist.quotationSent}
                    onChange={e =>
                      setChecklist(prev =>
                        prev ? { ...prev, quotationSent: e.target.checked } : prev
                      )
                    }
                    className="w-4 h-4 rounded border-slate-600 text-emerald-500 bg-slate-950 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Hotel Vouchers Sent (Auto-populated from quotation) */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Hotel className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      Hotel Vouchers Sent ({vouchersSentCount}/{hotelStays.length})
                    </span>
                  </div>
                  {hotelStays.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const allSent = vouchersSentCount === hotelStays.length;
                        setChecklist(prev => {
                          if (!prev) return prev;
                          const nextVouchers: Record<string, boolean> = {
                            ...prev.hotelVouchers
                          };
                          hotelStays.forEach(h => {
                            nextVouchers[h.key] = !allSent;
                          });
                          return { ...prev, hotelVouchers: nextVouchers };
                        });
                      }}
                      className="text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
                    >
                      {vouchersSentCount === hotelStays.length
                        ? 'Unmark All'
                        : 'Mark All Sent'}
                    </button>
                  )}
                </div>

                {hotelStays.length > 0 ? (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/50">
                    {hotelStays.map(hotel => {
                      const isSent = !!checklist.hotelVouchers[hotel.key];
                      return (
                        <label
                          key={hotel.key}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/40 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-slate-100 block truncate">
                              {hotel.hotelName}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {hotel.nights.length > 0
                                ? `Night${hotel.nights.length > 1 ? 's' : ''} ${hotel.nights.join(', ')} · `
                                : ''}
                              {hotel.roomsCount} room entry
                              {hotel.roomsCount > 1 ? ' entries' : ''}
                            </span>
                            {hotel.changeNotes.length > 0 && (
                              <span className="text-[11px] text-amber-300 block truncate">
                                {hotel.changeNotes.join(' · ')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[11px] font-medium ${
                                isSent ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {isSent ? 'Voucher Sent' : 'Pending'}
                            </span>
                            <input
                              type="checkbox"
                              checked={isSent}
                              onChange={e =>
                                setChecklist(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        hotelVouchers: {
                                          ...prev.hotelVouchers,
                                          [hotel.key]: e.target.checked
                                        }
                                      }
                                    : prev
                                )
                              }
                              className="w-4 h-4 rounded border-slate-600 text-emerald-500 bg-slate-950 focus:ring-emerald-500 cursor-pointer"
                            />
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 border border-slate-800 rounded-lg px-3 py-3 bg-slate-900/40">
                    No hotels included in this quotation.
                  </div>
                )}
              </div>
            </section>

            {/* Right: Payment Tracking */}
            <section className="lg:col-span-5 bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    Advance &amp; Balance Payment
                  </h3>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Received Advance Payment
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 shrink-0">
                      {(['USD', 'LKR'] as const).map(curr => (
                        <button
                          key={curr}
                          type="button"
                          onClick={() =>
                            setChecklist(prev =>
                              prev ? { ...prev, advanceCurrency: curr } : prev
                            )
                          }
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                            checklist.advanceCurrency === curr
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {curr}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={checklist.advanceReceived || ''}
                      placeholder="0"
                      onChange={e =>
                        setChecklist(prev =>
                          prev
                            ? {
                                ...prev,
                                advanceReceived: Math.max(0, parseFloat(e.target.value) || 0)
                              }
                            : prev
                        )
                      }
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-emerald-300 tabular-nums focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-1.5">
                    Equivalent: {formatUSD(advanceUsd)} · {formatLKR(advanceLkr)}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Quoted Package Total (at active rate)</span>
                  <span className="font-mono tabular-nums text-slate-200 font-semibold">
                    {formatUSD(quotedTotalUsd)} · {formatLKR(quotedRevenueAtActiveRateLkr)}
                  </span>
                </div>
                {totalCustomerUpgradeLkr > 0 && (
                  <>
                    <div className="flex items-center justify-between text-amber-300">
                      <span>+ Hotel Changes / Upgrades (Charged)</span>
                      <span className="font-mono tabular-nums font-semibold">
                        + {formatUSD(totalCustomerUpgradeUsd)} · {formatLKR(totalCustomerUpgradeLkr)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="font-medium">Adjusted Customer Total</span>
                      <span className="font-mono tabular-nums font-bold">
                        {formatUSD(adjustedTotalUsd)} · {formatLKR(revenueAtActiveRateLkr)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between text-slate-400">
                  <span>Advance Received</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                    - {formatUSD(advanceUsd)} · {formatLKR(advanceLkr)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="font-semibold text-slate-100">
                    To Be Received (Balance Payment)
                  </span>
                  <div className="text-right">
                    {balanceUsd <= 0.01 && !isOverpaid ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                        <Check className="w-3.5 h-3.5" />
                        Paid in Full
                      </span>
                    ) : (
                      <>
                        <span className="block font-mono tabular-nums font-bold text-amber-300 text-sm">
                          {formatUSD(balanceUsd)}
                        </span>
                        <span className="block font-mono tabular-nums text-[11px] text-slate-300">
                          {formatLKR(balanceLkr)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* 2.5 Hotel Changes & Same-Hotel Upgrades (FOC or Charged to Customer) */}
          <section className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <datalist id="checklist-partner-hotels">
              {partnerHotelOptions.map(h => (
                <option key={h} value={h} />
              ))}
            </datalist>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-start gap-2.5">
                <ArrowLeftRight className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Hotel Changes &amp; Same-Hotel Upgrades
                  </h3>
                  <p className="text-xs text-slate-400">
                    Record hotel changes or same-hotel room/meal upgrades — either Free of Charge (FOC) or charged to the customer.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddHotelAdjustment}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add Hotel Change / Upgrade</span>
              </button>
            </div>

            {hotelAdjustments.length > 0 ? (
              <div className="space-y-3">
                {hotelAdjustments.map(adj => {
                  const isChargeCustomer = adj.billingMode === 'CHARGE_CUSTOMER';
                  const chargeLkr = isChargeCustomer
                    ? toLkr(Number(adj.customerChargeAmount) || 0, adj.customerChargeCurrency)
                    : 0;
                  const chargeUsd = isChargeCustomer
                    ? toUsd(Number(adj.customerChargeAmount) || 0, adj.customerChargeCurrency)
                    : 0;

                  return (
                    <div
                      key={adj.id}
                      className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-3"
                    >
                      {/* Top row: Change Type toggle, Affected Stay selector, Billing Mode toggle, Delete */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  changeType: 'HOTEL_CHANGE'
                                })
                              }
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                adj.changeType === 'HOTEL_CHANGE'
                                  ? 'bg-sky-600 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Hotel Change
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  changeType: 'SAME_HOTEL_UPGRADE',
                                  updatedHotel: adj.quotedHotel || adj.updatedHotel
                                })
                              }
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                adj.changeType === 'SAME_HOTEL_UPGRADE'
                                  ? 'bg-teal-600 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Same-Hotel Upgrade
                            </button>
                          </div>

                          <select
                            aria-label="Affected quoted stay"
                            value={adj.nightKey}
                            onChange={e => {
                              const selectedKey = e.target.value;
                              const opt = quotedStayOptions.find(o => o.key === selectedKey);
                              handleUpdateHotelAdjustment(adj.id, {
                                nightKey: selectedKey,
                                nightNumber: opt ? opt.nightNumber : undefined,
                                quotedHotel: opt ? opt.hotelName : '',
                                quotedRoomDetails: opt ? opt.detailsLabel : '',
                                ...(adj.changeType === 'SAME_HOTEL_UPGRADE'
                                  ? { updatedHotel: opt ? opt.hotelName : '' }
                                  : {})
                              });
                            }}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 max-w-xs focus:outline-none focus:border-sky-500 cursor-pointer"
                          >
                            {quotedStayOptions.map(opt => (
                              <option key={opt.key} value={opt.key}>
                                Night {opt.nightNumber}: {opt.hotelName}
                                {opt.detailsLabel ? ` (${opt.detailsLabel})` : ''}
                              </option>
                            ))}
                            <option value="custom">Other / Multiple Nights</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  billingMode: 'FOC',
                                  customerChargeAmount: 0
                                })
                              }
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                adj.billingMode === 'FOC'
                                  ? 'bg-emerald-700 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              FOC (Free of Charge)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  billingMode: 'CHARGE_CUSTOMER'
                                })
                              }
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                                adj.billingMode === 'CHARGE_CUSTOMER'
                                  ? 'bg-amber-600 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Charge Customer
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveHotelAdjustment(adj.id)}
                            aria-label="Remove hotel adjustment"
                            className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Details & Charge Inputs */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-start">
                        {adj.changeType === 'HOTEL_CHANGE' ? (
                          <div className="md:col-span-4">
                            <label className="block text-[11px] text-slate-400 mb-1">
                              New Hotel Name {adj.quotedHotel ? `(Replaces ${adj.quotedHotel})` : ''}
                            </label>
                            <input
                              type="text"
                              list="checklist-partner-hotels"
                              value={adj.updatedHotel}
                              placeholder="Select or enter new hotel name"
                              onChange={e =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  updatedHotel: e.target.value
                                })
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        ) : (
                          <div className="md:col-span-4">
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Hotel (Same-Hotel Upgrade)
                            </label>
                            <input
                              type="text"
                              value={adj.quotedHotel || adj.updatedHotel}
                              placeholder="Same hotel stay"
                              readOnly={Boolean(adj.quotedHotel)}
                              onChange={e =>
                                handleUpdateHotelAdjustment(adj.id, {
                                  updatedHotel: e.target.value
                                })
                              }
                              className="w-full bg-slate-950/70 border border-slate-800 rounded-md px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        )}

                        <div className="md:col-span-4">
                          <label className="block text-[11px] text-slate-400 mb-1">
                            {adj.changeType === 'SAME_HOTEL_UPGRADE'
                              ? 'Upgraded Room / Meal / View'
                              : 'New Room / Meal Details & Note'}
                          </label>
                          <input
                            type="text"
                            value={adj.updatedDetails}
                            placeholder={
                              adj.changeType === 'SAME_HOTEL_UPGRADE'
                                ? 'e.g. Upgraded to Deluxe Sea View · Half-Board'
                                : 'e.g. Deluxe Room · HB (Guest requested change)'
                            }
                            onChange={e =>
                              handleUpdateHotelAdjustment(adj.id, {
                                updatedDetails: e.target.value
                              })
                            }
                            className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="md:col-span-4">
                          {isChargeCustomer ? (
                            <div>
                              <label className="block text-[11px] text-amber-300 font-medium mb-1">
                                Extra Charge Billed to Customer
                              </label>
                              <div className="flex items-center gap-1.5">
                                <select
                                  aria-label="Customer upgrade charge currency"
                                  value={adj.customerChargeCurrency}
                                  onChange={e =>
                                    handleUpdateHotelAdjustment(adj.id, {
                                      customerChargeCurrency: e.target.value as 'LKR' | 'USD'
                                    })
                                  }
                                  className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                                >
                                  <option value="USD">USD</option>
                                  <option value="LKR">LKR</option>
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={adj.customerChargeAmount || ''}
                                  placeholder="0"
                                  onChange={e =>
                                    handleUpdateHotelAdjustment(adj.id, {
                                      customerChargeAmount: Math.max(
                                        0,
                                        parseFloat(e.target.value) || 0
                                      )
                                    })
                                  }
                                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300 text-right tabular-nums focus:outline-none focus:border-sky-500"
                                />
                              </div>
                              <span className="block text-[10px] text-slate-400 font-mono tabular-nums text-right mt-0.5">
                                ≈ {adj.customerChargeCurrency === 'USD' ? formatLKR(chargeLkr) : formatUSD(chargeUsd)} added to customer total
                              </span>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-[11px] text-emerald-400 font-medium mb-1">
                                Customer Billing: Free of Charge (FOC)
                              </label>
                              <input
                                type="text"
                                value={adj.notes || ''}
                                placeholder="Optional reason (e.g. Complimentary upgrade / Hotel relocated FOC)"
                                onChange={e =>
                                  handleUpdateHotelAdjustment(adj.id, {
                                    notes: e.target.value
                                  })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-300">
                  <span>
                    {focAdjustmentCount} FOC · {chargedAdjustmentCount} Charged to Customer
                  </span>
                  <span className="font-mono tabular-nums">
                    Added to Customer Total:{' '}
                    <strong className="text-amber-300">
                      + {formatUSD(totalCustomerUpgradeUsd)}
                    </strong>{' '}
                    (+ {formatLKR(totalCustomerUpgradeLkr)})
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-1.5">
                No hotel changes or upgrades recorded. Use &ldquo;Add Hotel Change / Upgrade&rdquo; if a quoted hotel was swapped or upgraded (FOC or charged extra to the guest).
              </div>
            )}
          </section>

          {/* 3. Quoted vs Actual Cost Comparison & USD Conversion Rate */}
          <section className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            {/* Section Toolbar */}
            <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Quoted Cost vs. Actual Cost Comparison
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compare quoted item prices against actual supplier costs. Quoted rate: 1 USD ={' '}
                  <span className="font-mono tabular-nums text-slate-200">
                    {quotedUsdRate} LKR
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* USD to LKR Conversion Rate Box */}
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                  <label
                    htmlFor="checklist-usd-rate"
                    className="text-xs font-medium text-slate-300 whitespace-nowrap"
                  >
                    USD to LKR Rate:
                  </label>
                  <span className="text-xs text-slate-400 font-mono">1 USD =</span>
                  <input
                    id="checklist-usd-rate"
                    type="number"
                    min="1"
                    step="any"
                    value={checklist.actualUsdRate || ''}
                    onChange={e =>
                      setChecklist(prev =>
                        prev
                          ? {
                              ...prev,
                              actualUsdRate: Math.max(1, parseFloat(e.target.value) || 0)
                            }
                          : prev
                      )
                    }
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-amber-300 text-center tabular-nums focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-400">LKR</span>
                </div>

                <button
                  type="button"
                  onClick={handlePrefillActualsFromQuoted}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  title="Copy all quoted item amounts into Actual Cost inputs as a starting baseline"
                >
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  <span>Fill Actuals from Quoted</span>
                </button>
              </div>
            </div>

            {/* Two-Sided Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Quotation Item</th>
                    <th className="py-2.5 px-3 text-right">Quoted Price (LKR / USD)</th>
                    <th className="py-2.5 px-3 w-64">Actual Cost Spent</th>
                    <th className="py-2.5 px-4 text-right">Difference (Quoted − Actual)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {computedRows.length > 0 ? (
                    computedRows.map(row => {
                      const hasActual = (Number(row.entry.amount) || 0) > 0;
                      const isSavings = row.diffLkr >= 0;
                      const rowAdj = hotelAdjustments.find(a => a.nightKey === row.key);
                      return (
                        <tr
                          key={row.key}
                          className="hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="py-2.5 px-4">
                            <span className="font-medium text-slate-100 block">
                              {row.label}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {row.detail}
                            </span>
                            {rowAdj && (
                              <span className="text-[11px] text-amber-300 block mt-0.5">
                                {rowAdj.changeType === 'HOTEL_CHANGE'
                                  ? `Changed → ${rowAdj.updatedHotel || 'New hotel'}`
                                  : `Same-hotel upgrade → ${rowAdj.updatedDetails || 'Upgraded'}`}{' '}
                                ·{' '}
                                {rowAdj.billingMode === 'FOC'
                                  ? 'FOC to customer'
                                  : `Charged +${rowAdj.customerChargeCurrency} ${Number(rowAdj.customerChargeAmount || 0).toLocaleString()}`}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <span className="font-semibold text-slate-100 block">
                              {formatLKR(row.quotedLkr)}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {formatUSD(row.quotedUsd)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Currency for ${row.label}`}
                                value={row.entry.currency}
                                onChange={e =>
                                  handleActualCostChange(
                                    row.key,
                                    row.entry.amount,
                                    e.target.value as 'LKR' | 'USD'
                                  )
                                }
                                className="bg-slate-950 border border-slate-700 rounded-md px-1.5 py-1.5 text-[11px] font-semibold text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                              >
                                <option value="LKR">LKR</option>
                                <option value="USD">USD</option>
                              </select>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.entry.amount || ''}
                                placeholder="0"
                                onChange={e =>
                                  handleActualCostChange(
                                    row.key,
                                    parseFloat(e.target.value) || 0,
                                    row.entry.currency
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-100 text-right tabular-nums focus:outline-none focus:border-sky-500"
                              />
                            </div>
                            {hasActual && (
                              <span className="block text-[10px] text-slate-400 font-mono tabular-nums text-right mt-0.5">
                                {row.entry.currency === 'LKR'
                                  ? `≈ ${formatUSD(row.actualUsd)}`
                                  : `≈ ${formatLKR(row.actualLkr)}`}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                            <span
                              className={`font-semibold block ${
                                isSavings ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isSavings ? '+' : '-'} {formatLKR(Math.abs(row.diffLkr))}
                            </span>
                            <span className="text-[11px] text-slate-400 block">
                              {isSavings ? '+' : '-'} {formatUSD(Math.abs(row.diffUsd))}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 px-4 text-center text-slate-400">
                        No cost items found in this quotation.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Totals + Separate Profit Margin Rows */}
                <tfoot className="border-t-2 border-slate-800 bg-slate-900/70 text-xs">
                  <tr>
                    <td className="py-3 px-4 font-semibold text-slate-200">
                      Total Items Cost (Quoted Subtotal vs. Actual Cost)
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-100 block">
                        {formatLKR(quotedCostSubtotalLkr)}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {formatUSD(quotedCostSubtotalUsd)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span className="font-bold text-slate-100 block">
                        {formatLKR(totalActualItemCostLkr)}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {formatUSD(totalActualItemCostUsd)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`font-bold block ${
                          totalCostDiffLkr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {totalCostDiffLkr >= 0 ? '+' : '-'}{' '}
                        {formatLKR(Math.abs(totalCostDiffLkr))}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {totalCostDiffUsd >= 0 ? '+' : '-'}{' '}
                        {formatUSD(Math.abs(totalCostDiffUsd))}
                      </span>
                    </td>
                  </tr>

                  {/* Separate Profit Margin Display */}
                  <tr className="border-t border-slate-800 bg-slate-950/60">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-sky-300 block">
                        Quoted Profit Margin (Separate)
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Markup {quotedMarkupPct}% ({formatLKR(quotedMarginLkr)})
                        {quotedDiscountLkr > 0
                          ? ` minus Discount (${formatLKR(quotedDiscountLkr)})`
                          : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <span className="font-bold text-sky-300 block">
                        {formatLKR(netQuotedMarginLkr)}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        {formatUSD(netQuotedMarginUsd)}
                      </span>
                    </td>
                    <td colSpan={2} className="py-3 px-4 text-right text-[11px] text-slate-400">
                      Quoted Selling Price: <strong className="text-slate-200 font-mono tabular-nums">{formatLKR(breakdown.fin)}</strong> ({formatUSD(quotedTotalUsd)})
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* 4. Other Expenses Section */}
          <section className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Other Expenses (Unquoted / Extra Costs)
                </h3>
                <p className="text-xs text-slate-400">
                  Record extra tour costs such as tips, bank fees, complimentary items, or unquoted changes.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddOtherExpense}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                <span>Add Other Expense</span>
              </button>
            </div>

            {checklist.otherExpenses.length > 0 ? (
              <div className="space-y-2">
                {checklist.otherExpenses.map(exp => {
                  const expLkr = toLkr(Number(exp.amount) || 0, exp.currency);
                  const expUsd = toUsd(Number(exp.amount) || 0, exp.currency);
                  return (
                    <div
                      key={exp.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-900/60 border border-slate-800 rounded-lg p-2.5"
                    >
                      <div className="sm:col-span-6">
                        <input
                          type="text"
                          value={exp.description}
                          placeholder="Expense description (e.g. Airport garland, bank charge, driver tip)"
                          onChange={e =>
                            handleUpdateOtherExpense(exp.id, { description: e.target.value })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-1.5">
                        <select
                          aria-label="Expense currency"
                          value={exp.currency}
                          onChange={e =>
                            handleUpdateOtherExpense(exp.id, {
                              currency: e.target.value as 'LKR' | 'USD'
                            })
                          }
                          className="bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                        >
                          <option value="LKR">LKR</option>
                          <option value="USD">USD</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={exp.amount || ''}
                          placeholder="0"
                          onChange={e =>
                            handleUpdateOtherExpense(exp.id, {
                              amount: Math.max(0, parseFloat(e.target.value) || 0)
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-100 text-right tabular-nums focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="sm:col-span-2 text-right font-mono tabular-nums text-[11px] text-slate-300">
                        <span className="block">{formatLKR(expLkr)}</span>
                        <span className="block text-slate-400">{formatUSD(expUsd)}</span>
                      </div>

                      <div className="sm:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveOtherExpense(exp.id)}
                          aria-label="Delete expense"
                          className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-end pt-1 text-xs font-mono tabular-nums text-slate-300">
                  <span>
                    Total Other Expenses:{' '}
                    <strong className="text-rose-300">
                      {formatLKR(totalOtherExpensesLkr)}
                    </strong>{' '}
                    ({formatUSD(totalOtherExpensesUsd)})
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-2">
                No other expenses recorded yet. Click &ldquo;Add Other Expense&rdquo; to log additional costs.
              </div>
            )}
          </section>

          {/* 5. Final Actual Profit Summary */}
          <section className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Final Actual Profit Reconciliation
                </h3>
                <p className="text-xs text-slate-400">
                  Calculated at active rate 1 USD = {activeRate} LKR
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  actualProfitLkr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {actualProfitLkr >= 0 ? 'Net Profit' : 'Net Loss'} ({actualProfitPct.toFixed(1)}% of revenue)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                <span className="text-slate-400 block mb-1">
                  Tour Revenue (Customer Total)
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-100 block">
                  {formatLKR(revenueAtActiveRateLkr)}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 block">
                  {formatUSD(adjustedTotalUsd)}
                </span>
                {totalCustomerUpgradeUsd > 0 && (
                  <span className="text-[10px] font-mono tabular-nums text-amber-300 block mt-0.5">
                    Quoted {formatUSD(quotedTotalUsd)} + Upgrades {formatUSD(totalCustomerUpgradeUsd)}
                  </span>
                )}
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                <span className="text-slate-400 block mb-1">
                  Less: Actual Item Costs
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-slate-100 block">
                  - {formatLKR(totalActualItemCostLkr)}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  - {formatUSD(totalActualItemCostUsd)}
                </span>
              </div>

              <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50">
                <span className="text-slate-400 block mb-1">
                  Less: Other Expenses
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-rose-300 block">
                  - {formatLKR(totalOtherExpensesLkr)}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  - {formatUSD(totalOtherExpensesUsd)}
                </span>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  actualProfitLkr >= 0
                    ? 'border-emerald-700/60 bg-emerald-950/30'
                    : 'border-rose-700/60 bg-rose-950/30'
                }`}
              >
                <span className="text-slate-300 font-medium block mb-1">
                  Actual Net Profit
                </span>
                <span
                  className={`text-lg font-extrabold font-mono tabular-nums block ${
                    actualProfitLkr >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {actualProfitLkr < 0 ? '-' : ''}
                  {formatLKR(Math.abs(actualProfitLkr))}
                </span>
                <span
                  className={`text-xs font-bold font-mono tabular-nums ${
                    actualProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {actualProfitUsd < 0 ? '-' : ''}
                  {formatUSD(Math.abs(actualProfitUsd))}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
