import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Cloud,
  Database,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  KeyRound,
  MessageCircle,
  Plane,
  Printer,
  RotateCcw,
  Route,
  Share2,
  ShieldCheck,
  Sparkles,
  History,
  Trash2,
  TrendingUp,
  User,
  Users,
  LogIn,
  LogOut
} from 'lucide-react';
import { CloudSyncStatus, LogoData, UserProfile } from '../types';

interface HeaderProps {
  logo: LogoData | null;
  savedCount: number;
  confirmedCount?: number;
  customerCount: number;
  currentUser: UserProfile | null;
  syncStatus: CloudSyncStatus;
  hotelRatesCount?: number;
  onOpenHotelRates?: () => void;
  onOpenOverallProfit?: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenChangePassword: () => void;
  onOpenUserManagement: () => void;
  onOpenActivityLogs: () => void;
  onOpenItinerary: () => void;
  onOpenSaved: () => void;
  onOpenCustomers: () => void;
  onOpenBackup: () => void;
  onOpenWhatsAppShare: () => void;
  onPreviewOnlineProposal: () => void;
  onLoadDemo: () => void;
  onReset: () => void;
  onOpenCompany: () => void;
  onDownloadPDF: () => void;
  onExportExcel: () => void;
  onPrint: () => void;
  onLogoUpload: (logo: LogoData) => void;
  onLogoRemove: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  logo,
  savedCount,
  confirmedCount = 0,
  customerCount,
  currentUser,
  syncStatus,
  hotelRatesCount = 0,
  onOpenHotelRates,
  onOpenOverallProfit,
  onOpenAuth,
  onSignOut,
  onOpenChangePassword,
  onOpenUserManagement,
  onOpenActivityLogs,
  onOpenItinerary,
  onOpenSaved,
  onOpenCustomers,
  onOpenBackup,
  onOpenWhatsAppShare,
  onPreviewOnlineProposal,
  onLoadDemo,
  onReset,
  onOpenCompany,
  onDownloadPDF,
  onExportExcel,
  onPrint,
  onLogoUpload,
  onLogoRemove
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    setLogoLoadError(false);
  }, [logo?.data]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const iw = img.naturalWidth || 320;
        const ih = img.naturalHeight || 160;
        const scale = Math.min(1, 320 / iw, 160 / ih);
        const w = Math.max(1, Math.round(iw * scale));
        const h = Math.max(1, Math.round(ih * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl = canvas.toDataURL('image/png');
          if (dataUrl.length > 60000) {
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, w, h);
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
          onLogoUpload({ data: dataUrl, w, h });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-40 py-1.5">
      <div className="max-w-7xl mx-auto px-4 flex flex-col lg:flex-row lg:items-start justify-between gap-2">
        {/* Brand Zone */}
        <div className="flex items-start justify-between md:justify-start gap-3 w-full lg:w-auto shrink-0 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2.5 shrink-0">
            {logo && logo.data && !logoLoadError ? (
              <img
                src={logo.data}
                alt="Voya Lanka Tours (Pvt) Ltd."
                onError={() => setLogoLoadError(true)}
                className="h-9 sm:h-10 w-auto max-w-[140px] object-contain rounded-lg bg-white p-0.5 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-700 to-teal-600 flex items-center justify-center text-white shadow-md shadow-sky-900/40 shrink-0">
                <Plane className="w-4 h-4 -rotate-45" />
              </div>
            )}
            <div className="flex flex-col shrink-0">
              <h1 className="text-sm font-bold leading-tight tracking-tight text-slate-100 whitespace-nowrap">
                Voya Lanka Tours (Pvt) Ltd.
              </h1>
              <p className="text-[9.5px] font-medium italic tracking-wider text-amber-400 uppercase leading-tight whitespace-nowrap">
                MORE THAN A DESTINATION
              </p>
            </div>
          </div>

          {/* User Account & Cloud Sync Status Badge */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {currentUser ? (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 shadow-sm">
                <div
                  className={`w-2 h-2 rounded-full ${
                    syncStatus === 'syncing'
                      ? 'bg-amber-400 animate-ping'
                      : syncStatus === 'connected'
                      ? 'bg-emerald-400'
                      : 'bg-slate-500'
                  }`}
                  title={syncStatus === 'connected' ? 'Cloud Database Synced' : 'Syncing...'}
                />
                <div className="flex flex-col text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-200 max-w-[115px] truncate">
                      {currentUser.fullName || currentUser.email}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full border ${
                        currentUser.role === 'ADMIN'
                          ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                          : 'bg-sky-950/80 border-sky-700 text-sky-300'
                      }`}
                    >
                      {currentUser.role}
                    </span>
                  </div>
                </div>

                {currentUser.role === 'ADMIN' && (
                  <button
                    onClick={onOpenUserManagement}
                    className="p-0.5 hover:bg-slate-800 rounded-md text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    title="Manage Staff Users & Roles"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={onOpenChangePassword}
                  className="flex items-center gap-1 px-1 py-0.5 hover:bg-slate-800 rounded-md text-sky-400 hover:text-sky-300 transition-colors cursor-pointer text-[11px] font-medium"
                  title="Change Account Password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Password</span>
                </button>

                <button
                  onClick={onSignOut}
                  className="p-0.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-900/30 transition-colors cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Controls - Compact Two Rows */}
        <div className="flex flex-col items-start lg:items-end gap-1.5">
          {/* Top Row: Itinerary, Saved, Overall Profit, Customers, Hotel Rates, Share Proposal, Backup & Restore */}
          <div className="flex items-center gap-1.5 flex-wrap lg:justify-end">
            <button
              onClick={onOpenItinerary}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
              title="Tour itinerary schedule"
            >
              <Route className="w-3 h-3" />
              <span>Itinerary</span>
            </button>

            <button
              onClick={onOpenSaved}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-amber-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Saved quotations"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Saved</span>
              <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 rounded-full leading-tight">
                {savedCount}
              </span>
            </button>

            {onOpenOverallProfit && (
              <button
                onClick={onOpenOverallProfit}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-emerald-700/80 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Check overall quoted price and actual profit for confirmed tours"
              >
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                <span>Overall Profit</span>
                <span className="text-[10px] font-mono tabular-nums text-emerald-200">
                  · {confirmedCount}
                </span>
              </button>
            )}

            <button
              onClick={onOpenCustomers}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-purple-800/80 bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 transition-colors cursor-pointer whitespace-nowrap"
              title="Customer database and directory"
            >
              <Users className="w-3 h-3 text-purple-400" />
              <span>Customers</span>
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 rounded-full leading-tight">
                {customerCount}
              </span>
            </button>

            {onOpenHotelRates && (
              <button
                onClick={onOpenHotelRates}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-teal-800/80 bg-teal-950/40 hover:bg-teal-900/60 text-teal-300 transition-colors cursor-pointer whitespace-nowrap"
                title="Hotel contract rates and Excel auto-pricing"
              >
                <FileSpreadsheet className="w-3 h-3 text-teal-400" />
                <span>Hotel Rates</span>
                {hotelRatesCount > 0 && (
                  <span className="bg-teal-600 text-white text-[10px] font-bold px-1.5 rounded-full leading-tight">
                    {hotelRatesCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onPreviewOnlineProposal}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-emerald-500/80 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 transition-colors cursor-pointer whitespace-nowrap"
              title="Create shareable web link and preview proposal"
            >
              <Share2 className="w-3 h-3 text-emerald-400" />
              <span>Share Proposal</span>
            </button>

            <button
              onClick={onOpenBackup}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-sky-500/80 bg-sky-950/40 hover:bg-sky-900/60 text-sky-300 transition-colors cursor-pointer whitespace-nowrap"
              title="Database Backup & Restore"
            >
              <Database className="w-3 h-3 text-sky-400" />
              <span>Backup &amp; Restore</span>
            </button>
          </div>

          {/* Second Row: Audit Logs, Demo, Reset, Logo, Company, PDF, Excel, Print */}
          <div className="flex items-center gap-1.5 flex-wrap lg:justify-end">
            <button
              onClick={onOpenActivityLogs}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-amber-500/80 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
              title="User Activity & Audit Logs"
            >
              <History className="w-3 h-3 text-amber-400" />
              <span>Audit Logs</span>
            </button>

            <button
              onClick={onLoadDemo}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Load sample tour configuration"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Demo</span>
            </button>

            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Reset form to defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>

            {(!currentUser || currentUser.role === 'ADMIN') && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-sky-400 transition-colors cursor-pointer whitespace-nowrap"
                  title="Upload official company logo (synced for all users & PDFs)"
                >
                  <ImageIcon className="w-3 h-3" />
                  <span>Logo</span>
                </button>

                {logo && (
                  <button
                    onClick={onLogoRemove}
                    className="p-1 text-[11px] font-semibold rounded-md border border-rose-900/60 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 transition-colors cursor-pointer"
                    title="Remove company logo for all users"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </>
            )}

            <button
              onClick={onOpenCompany}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-sky-400 transition-colors cursor-pointer whitespace-nowrap"
              title="Edit company profile and contact details"
            >
              <Building2 className="w-3 h-3" />
              <span>Company</span>
            </button>

            <button
              onClick={onDownloadPDF}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-md bg-sky-600 hover:bg-sky-500 text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
              title="Download PDF Quotation"
            >
              <FileText className="w-3 h-3 text-white" />
              <span>PDF</span>
            </button>

            <button
              onClick={onExportExcel}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-emerald-400 transition-colors cursor-pointer whitespace-nowrap"
              title="Export everything to multi-sheet Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Excel</span>
            </button>

            <button
              onClick={onPrint}
              className="p-1 text-[11px] font-semibold rounded-md border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              title="Print quotation"
            >
              <Printer className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
