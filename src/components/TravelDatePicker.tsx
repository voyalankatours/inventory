import React, { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface TravelDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  if (!iso || typeof iso !== 'string') return null;
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const probe = new Date(year, month, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month ||
    probe.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const TravelDatePicker: React.FC<TravelDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select arrival date'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const todayIso = toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());
  const parsedValue = parseIsoDate(value);

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(
    parsedValue ? parsedValue.year : now.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState<number>(
    parsedValue ? parsedValue.month : now.getMonth()
  );

  // Sync viewed month when opening or when external value changes
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.year);
      setViewMonth(parsedValue.month);
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      if (parsedValue) {
        setViewYear(parsedValue.year);
        setViewMonth(parsedValue.month);
      } else {
        const current = new Date();
        setViewYear(current.getFullYear());
        setViewMonth(current.getMonth());
      }
    }
    setIsOpen(prev => !prev);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    onChange(toIsoDate(viewYear, viewMonth, day));
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const current = new Date();
    const iso = toIsoDate(current.getFullYear(), current.getMonth(), current.getDate());
    setViewYear(current.getFullYear());
    setViewMonth(current.getMonth());
    onChange(iso);
    setIsOpen(false);
  };

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const currentYear = now.getFullYear();
  const minYear = Math.min(currentYear - 2, viewYear, parsedValue?.year ?? currentYear);
  const maxYear = Math.max(currentYear + 5, viewYear, parsedValue?.year ?? currentYear);
  const yearOptions: number[] = [];
  for (let y = minYear; y <= maxYear; y++) {
    yearOptions.push(y);
  }

  const displayLabel = parsedValue
    ? `${String(parsedValue.day).padStart(2, '0')} ${SHORT_MONTH_NAMES[parsedValue.month]} ${parsedValue.year}`
    : '';

  return (
    <div ref={containerRef} className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`w-full bg-slate-950 border rounded-lg px-3 py-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors select-none ${
          isOpen
            ? 'border-sky-500 text-slate-100'
            : 'border-slate-800 hover:border-slate-700 text-slate-100'
        }`}
      >
        <span className={displayLabel ? 'text-slate-100 font-medium' : 'text-slate-500'}>
          {displayLabel || placeholder}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear arrival date"
              className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <Calendar className="w-3.5 h-3.5 text-sky-400" />
        </div>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Travel Arrival Date Calendar"
          className="absolute left-0 top-full mt-1.5 z-50 w-72 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl p-3 text-slate-100"
        >
          {/* Month / Year Navigation */}
          <div className="flex items-center justify-between gap-1.5 mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous month"
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 flex-1 justify-center">
              <select
                aria-label="Select month"
                value={viewMonth}
                onChange={e => setViewMonth(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-xs font-semibold text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select year"
                value={viewYear}
                onChange={e => setViewYear(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-xs font-semibold text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="Next month"
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1.5">
            {WEEKDAYS.map(day => (
              <div
                key={day}
                className="text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid — Strictly only renders dates belonging to the selected month */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`blank-${idx}`} aria-hidden="true" className="h-8" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const iso = toIsoDate(viewYear, viewMonth, day);
              const isSelected = value === iso;
              const isToday = todayIso === iso;

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 w-full rounded-lg text-xs font-medium flex items-center justify-center transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500 text-white font-bold shadow-sm'
                      : isToday
                        ? 'bg-sky-950/70 border border-sky-500/60 text-sky-300 hover:bg-sky-900/70'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={handleClear}
              className="px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Clear
            </button>
            <span className="text-[10px] text-slate-500 font-medium">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleSelectToday}
              className="px-2 py-1 rounded text-sky-400 hover:text-sky-300 hover:bg-sky-950/60 font-semibold transition-colors cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
