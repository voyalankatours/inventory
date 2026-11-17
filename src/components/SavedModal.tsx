import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FolderOpen,
  Search,
  Trash2,
  TrendingUp,
  X
} from 'lucide-react';
import { SavedQuotation, UserProfile } from '../types';

interface SavedModalProps {
  isOpen: boolean;
  savedQuotes: SavedQuotation[];
  currentUser?: UserProfile | null;
  onClose: () => void;
  onOpenChecklist: (quote: SavedQuotation) => void;
  onToggleConfirmed: (quote: SavedQuotation) => void;
  onOpenOverallProfit?: () => void;
  onLoadQuote: (quote: SavedQuotation) => void;
  onDeleteQuote: (id: string) => void;
  onClearAll: () => void;
}

export const SavedModal: React.FC<SavedModalProps> = ({
  isOpen,
  savedQuotes,
  currentUser,
  onClose,
  onOpenChecklist,
  onToggleConfirmed,
  onOpenOverallProfit,
  onLoadQuote,
  onDeleteQuote,
  onClearAll
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'unconfirmed'>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingClearAll, setPendingClearAll] = useState(false);
  const isAdmin = !currentUser || currentUser.role === 'ADMIN';

  if (!isOpen) return null;

  const confirmedCount = savedQuotes.filter(q => q.isConfirmed).length;
  const unconfirmedCount = savedQuotes.length - confirmedCount;

  const filtered = savedQuotes.filter(q => {
    if (statusFilter === 'confirmed' && !q.isConfirmed) return false;
    if (statusFilter === 'unconfirmed' && q.isConfirmed) return false;
    const term = searchTerm.toLowerCase();
    return (
      q.id.toLowerCase().includes(term) ||
      (q.customer.custName || '').toLowerCase().includes(term) ||
      (q.customer.custCountry || '').toLowerCase().includes(term) ||
      (q.customer.custEmail || '').toLowerCase().includes(term)
    );
  });

  const handleDeleteClick = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteQuote(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
      setTimeout(() => setPendingDeleteId(null), 4000);
    }
  };

  const handleClearAllClick = () => {
    if (pendingClearAll) {
      onClearAll();
      setPendingClearAll(false);
    } else {
      setPendingClearAll(true);
      setTimeout(() => setPendingClearAll(false), 4000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
          <div className="flex items-center gap-2.5 flex-wrap">
            <FolderOpen className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-slate-100 text-sm">
              Saved Quotations Repository
            </span>
            <span className="text-xs text-slate-400 tabular-nums">
              · {savedQuotes.length} Total · {confirmedCount} Confirmed
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenOverallProfit && (
              <button
                type="button"
                onClick={onOpenOverallProfit}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-emerald-700/70 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
                title="View overall profit across all confirmed tours"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Overall Profit ({confirmedCount})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search, Filter Tabs, and Clear toolbar */}
        <div className="p-4 flex flex-wrap gap-3 border-b border-slate-800 bg-slate-900/60 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by ID, name, country or email..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({savedQuotes.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('confirmed')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                statusFilter === 'confirmed'
                  ? 'bg-emerald-900/70 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Confirmed ({confirmedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unconfirmed')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                statusFilter === 'unconfirmed'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pending ({unconfirmedCount})
            </button>
          </div>

          {isAdmin && savedQuotes.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllClick}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                pendingClearAll
                  ? 'bg-rose-700 border-rose-600 text-white'
                  : 'border-slate-700 text-rose-300 hover:bg-rose-950/40'
              }`}
            >
              {pendingClearAll ? 'Click again to confirm' : 'Clear History'}
            </button>
          )}
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-2.5">ID</th>
                <th className="p-2.5">Saved</th>
                <th className="p-2.5">Customer</th>
                <th className="p-2.5">Duration</th>
                <th className="p-2.5 text-right">LKR</th>
                <th className="p-2.5 text-right">USD</th>
                <th className="p-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.length > 0 ? (
                filtered.map(q => {
                  const days = q.pax.days || 1;
                  const nights = Math.max(0, days - 1);
                  const isPending = pendingDeleteId === q.id;

                  return (
                    <tr
                      key={q.id}
                      onClick={() => onOpenChecklist(q)}
                      className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                      title="Click to open Tour Checklist & Profit Calculation"
                    >
                      <td className="p-2.5 font-mono text-sky-400 font-bold group-hover:text-sky-300">
                        {q.id}
                      </td>
                      <td className="p-2.5 text-slate-400">
                        {new Date(q.savedAt).toLocaleDateString()}
                      </td>
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-200 block">
                          {q.customer.custName || 'Valued Guest'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {q.customer.custCountry || '-'}
                          {q.isConfirmed ? ' · Confirmed' : ''}
                          {q.checklist?.updatedAt ? ' · Checklist saved' : ''}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-300">
                        {days} Days / {nights} Nights
                      </td>
                      <td className="p-2.5 text-right font-bold text-slate-200 tabular-nums">
                        {q.finLKR}
                      </td>
                      <td className="p-2.5 text-right font-bold text-teal-300 tabular-nums">
                        {q.finUSD}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onToggleConfirmed(q);
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                              q.isConfirmed
                                ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300 hover:bg-emerald-900/70'
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                            title={
                              q.isConfirmed
                                ? 'Tour is Confirmed (included in Overall Profit). Click to unconfirm.'
                                : 'Enable to mark this tour as Confirmed for Overall Profit calculation.'
                            }
                          >
                            <CheckCircle2
                              className={`w-3.5 h-3.5 ${
                                q.isConfirmed ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            />
                            <span>{q.isConfirmed ? 'Confirmed' : 'Confirm Tour'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onOpenChecklist(q);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-teal-700 hover:bg-teal-600 text-white transition-colors cursor-pointer"
                            title="Open Tour Checklist & Profit Calculation"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            <span>Checklist</span>
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onLoadQuote(q);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-sky-700 hover:bg-sky-600 text-white transition-colors cursor-pointer"
                          >
                            Load
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleDeleteClick(q.id);
                              }}
                              className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                isPending
                                  ? 'bg-rose-700 text-white'
                                  : 'text-rose-400 hover:text-rose-300 hover:bg-rose-950/40'
                              }`}
                              title="Delete quotation (Admin only)"
                            >
                              {isPending ? 'Sure?' : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-slate-500 italic text-xs"
                  >
                    {savedQuotes.length
                      ? 'No matching records found for this query.'
                      : 'No saved quotations found yet. Click "Save Quotation Record" to create one.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
