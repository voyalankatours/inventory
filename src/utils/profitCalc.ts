import {
  ChecklistCostEntry,
  PricingBreakdown,
  QuotationChecklistData,
  SavedQuotation
} from '../types';
import { computePricing, formatLKR } from './calc';

export interface QuotedLineItem {
  key: string;
  label: string;
  detail: string;
  quotedLkr: number;
  quotedUsd: number;
}

export interface ComputedCostRow extends QuotedLineItem {
  entry: ChecklistCostEntry;
  actualLkr: number;
  actualUsd: number;
  diffLkr: number;
  diffUsd: number;
}

export interface TourFinancialSummary {
  breakdown: PricingBreakdown;
  quotedItems: QuotedLineItem[];
  computedRows: ComputedCostRow[];
  quotedUsdRate: number;
  activeRate: number;
  quotedCostSubtotalLkr: number;
  quotedCostSubtotalUsd: number;
  quotedMarkupPct: number;
  quotedMarginLkr: number;
  quotedDiscountLkr: number;
  netQuotedMarginLkr: number;
  netQuotedMarginUsd: number;
  quotedPriceLkr: number;
  quotedTotalUsd: number;
  revenueAtActiveRateLkr: number;
  advanceLkr: number;
  advanceUsd: number;
  balanceLkr: number;
  balanceUsd: number;
  isOverpaid: boolean;
  totalActualItemCostLkr: number;
  totalActualItemCostUsd: number;
  totalCostDiffLkr: number;
  totalCostDiffUsd: number;
  totalOtherExpensesLkr: number;
  totalOtherExpensesUsd: number;
  totalActualCostLkr: number;
  totalActualCostUsd: number;
  hasActualsEntered: boolean;
  actualProfitLkr: number;
  actualProfitUsd: number;
  actualProfitPct: number;
}

export function buildQuotedLineItems(
  quote: SavedQuotation,
  breakdown: PricingBreakdown
): QuotedLineItem[] {
  const items: QuotedLineItem[] = [];
  const days = Math.max(0, quote.pax?.days || 0);
  const nightCount = Math.max(0, days > 0 ? days - 1 : 0);
  const qRate = quote.pricing?.usdRate > 0 ? quote.pricing.usdRate : 305;

  for (let i = 0; i < nightCount; i++) {
    const night = quote.nights?.[i];
    if (!night || !night.rooms) continue;
    night.rooms.forEach((room, rIdx) => {
      const costLkr = Number(room.cost) || 0;
      const hotelLabel = (room.hotel || '').trim() || `Night ${i + 1} Hotel`;
      const details = [room.roomCategory, room.bedType, room.meal, room.roomView]
        .filter(Boolean)
        .join(' · ');
      if (costLkr > 0 || room.hotel) {
        items.push({
          key: `night_${i}_room_${rIdx}_${room.id || rIdx}`,
          label: `Night ${night.nightNumber || i + 1}: ${hotelLabel}`,
          detail: details || 'Accommodation stay',
          quotedLkr: costLkr,
          quotedUsd: qRate > 0 ? costLkr / qRate : 0
        });
      }
    });
  }

  if (breakdown.veh > 0 || quote.transport?.vehicleType) {
    items.push({
      key: 'veh',
      label: `Vehicle: ${quote.transport?.vehicleType || 'Tour Transport'}`,
      detail: `${days} day(s) × ${formatLKR(Number(quote.transport?.vRate) || 0)}`,
      quotedLkr: breakdown.veh,
      quotedUsd: qRate > 0 ? breakdown.veh / qRate : 0
    });
  }

  if (breakdown.fuel > 0) {
    items.push({
      key: 'fuel',
      label: 'Fuel Cost',
      detail: `${quote.transport?.fuelKm || 0} km (${breakdown.fuelLit.toFixed(1)} L @ ${formatLKR(Number(quote.transport?.fuelPrice) || 370)})`,
      quotedLkr: breakdown.fuel,
      quotedUsd: qRate > 0 ? breakdown.fuel / qRate : 0
    });
  }

  if (breakdown.drv > 0) {
    items.push({
      key: 'drv',
      label: 'Driver Allowance',
      detail: `${days} day(s) × ${formatLKR(Number(quote.transport?.drvDay) || 0)}`,
      quotedLkr: breakdown.drv,
      quotedUsd: qRate > 0 ? breakdown.drv / qRate : 0
    });
  }

  if (breakdown.guide > 0 || quote.guide?.guideType) {
    items.push({
      key: 'guide',
      label: `Guide: ${quote.guide?.guideType || 'Chauffeur Guide'}`,
      detail: `${days} day(s) × ${formatLKR(Number(quote.guide?.guideFee) || 0)}`,
      quotedLkr: breakdown.guide,
      quotedUsd: qRate > 0 ? breakdown.guide / qRate : 0
    });
  }

  if (breakdown.crew > 0) {
    items.push({
      key: 'crew',
      label: 'Crew / Driver Room',
      detail: `${nightCount} night(s) × ${formatLKR(Number(quote.guide?.crewRoom) || 0)}`,
      quotedLkr: breakdown.crew,
      quotedUsd: qRate > 0 ? breakdown.crew / qRate : 0
    });
  }

  if (breakdown.toll > 0) {
    items.push({
      key: 'toll',
      label: 'Highway Tolls & Parking',
      detail: 'Route tolls and parking allowance',
      quotedLkr: breakdown.toll,
      quotedUsd: qRate > 0 ? breakdown.toll / qRate : 0
    });
  }

  (quote.others || []).forEach((o, idx) => {
    const q = o.qty || 1;
    const itemLkr =
      o.unitPriceUsd !== undefined && o.unitPriceUsd > 0
        ? Math.round(o.unitPriceUsd * qRate * q)
        : Number(o.cost) || 0;
    items.push({
      key: `other_${o.id || idx}`,
      label: o.name || `Additional Item ${idx + 1}`,
      detail: q > 1 ? `Qty: ${q}` : o.isTicket ? 'Entrance ticket / activity' : 'Additional charge',
      quotedLkr: itemLkr,
      quotedUsd: qRate > 0 ? itemLkr / qRate : 0
    });
  });

  return items;
}

export function computeTourFinancials(
  quote: SavedQuotation,
  overrideChecklist?: QuotationChecklistData | null
): TourFinancialSummary {
  const breakdown = computePricing(
    quote.pax,
    quote.nights || [],
    quote.transport,
    quote.guide,
    quote.pricing,
    quote.others || []
  );

  const checklist = overrideChecklist || quote.checklist;
  const quotedUsdRate = quote.pricing?.usdRate > 0 ? quote.pricing.usdRate : 305;
  const activeRate =
    checklist?.actualUsdRate && checklist.actualUsdRate > 0
      ? checklist.actualUsdRate
      : quotedUsdRate;

  const toLkr = (amount: number, currency: 'LKR' | 'USD') =>
    currency === 'USD' ? amount * activeRate : amount;
  const toUsd = (amount: number, currency: 'LKR' | 'USD') =>
    currency === 'USD' ? amount : activeRate > 0 ? amount / activeRate : 0;

  const quotedItems = buildQuotedLineItems(quote, breakdown);

  const quotedCostSubtotalLkr = breakdown.sub;
  const quotedCostSubtotalUsd = quotedUsdRate > 0 ? quotedCostSubtotalLkr / quotedUsdRate : 0;
  const quotedMarkupPct = Number(quote.pricing?.markup) || 0;
  const quotedMarginLkr = breakdown.mk;
  const quotedDiscountLkr = breakdown.dAmt;
  const netQuotedMarginLkr = quotedMarginLkr - quotedDiscountLkr;
  const netQuotedMarginUsd = quotedUsdRate > 0 ? netQuotedMarginLkr / quotedUsdRate : 0;

  const quotedTotalUsd = breakdown.usd;
  const quotedPriceLkr = breakdown.fin;
  const revenueAtActiveRateLkr = quotedTotalUsd * activeRate;

  const advanceAmt = Number(checklist?.advanceReceived) || 0;
  const advanceCurr = checklist?.advanceCurrency || 'USD';
  const advanceLkr = toLkr(advanceAmt, advanceCurr);
  const advanceUsd = toUsd(advanceAmt, advanceCurr);
  const balanceLkr = Math.max(0, revenueAtActiveRateLkr - advanceLkr);
  const balanceUsd = Math.max(0, quotedTotalUsd - advanceUsd);
  const isOverpaid = advanceLkr > revenueAtActiveRateLkr + 1;

  let totalActualItemCostLkr = 0;
  let totalActualItemCostUsd = 0;
  let hasAnyActualItemCost = false;

  const actualCostsMap = checklist?.actualCosts || {};
  const computedRows: ComputedCostRow[] = quotedItems.map(item => {
    const entry: ChecklistCostEntry = actualCostsMap[item.key] || {
      amount: 0,
      currency: 'LKR'
    };
    const numericAmt = Number(entry.amount) || 0;
    if (numericAmt > 0) hasAnyActualItemCost = true;
    const actualLkr = toLkr(numericAmt, entry.currency);
    const actualUsd = toUsd(numericAmt, entry.currency);
    totalActualItemCostLkr += actualLkr;
    totalActualItemCostUsd += actualUsd;

    return {
      ...item,
      entry,
      actualLkr,
      actualUsd,
      diffLkr: item.quotedLkr - actualLkr,
      diffUsd: item.quotedUsd - actualUsd
    };
  });

  // Also check if any keys exist in actualCostsMap that weren't in quotedItems (edge safety)
  const quotedKeys = new Set(quotedItems.map(i => i.key));
  Object.entries(actualCostsMap).forEach(([key, entry]) => {
    if (!quotedKeys.has(key) && entry && (Number(entry.amount) || 0) > 0) {
      hasAnyActualItemCost = true;
      totalActualItemCostLkr += toLkr(Number(entry.amount) || 0, entry.currency);
      totalActualItemCostUsd += toUsd(Number(entry.amount) || 0, entry.currency);
    }
  });

  const totalCostDiffLkr = quotedCostSubtotalLkr - totalActualItemCostLkr;
  const totalCostDiffUsd = quotedCostSubtotalUsd - totalActualItemCostUsd;

  let totalOtherExpensesLkr = 0;
  let totalOtherExpensesUsd = 0;
  let hasAnyOtherExpense = false;
  (checklist?.otherExpenses || []).forEach(exp => {
    const numericAmt = Number(exp.amount) || 0;
    if (numericAmt > 0) hasAnyOtherExpense = true;
    totalOtherExpensesLkr += toLkr(numericAmt, exp.currency);
    totalOtherExpensesUsd += toUsd(numericAmt, exp.currency);
  });

  const totalActualCostLkr = totalActualItemCostLkr + totalOtherExpensesLkr;
  const totalActualCostUsd = totalActualItemCostUsd + totalOtherExpensesUsd;
  const hasActualsEntered = hasAnyActualItemCost || hasAnyOtherExpense;

  const actualProfitLkr = revenueAtActiveRateLkr - totalActualCostLkr;
  const actualProfitUsd = quotedTotalUsd - totalActualCostUsd;
  const actualProfitPct =
    revenueAtActiveRateLkr > 0 ? (actualProfitLkr / revenueAtActiveRateLkr) * 100 : 0;

  return {
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
    quotedPriceLkr,
    quotedTotalUsd,
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
    totalActualCostLkr,
    totalActualCostUsd,
    hasActualsEntered,
    actualProfitLkr,
    actualProfitUsd,
    actualProfitPct
  };
}
