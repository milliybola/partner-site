import React from 'react';
import { Input } from '../../../core/ui';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface WorkingHours {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
  from_hour: string; // HH:mm
  to_hour: string; // HH:mm
}

export const DAYS: { key: DayKey; short: string; full: string }[] = [
  { key: 'mon', short: 'Du', full: 'Dushanba' },
  { key: 'tue', short: 'Se', full: 'Seshanba' },
  { key: 'wed', short: 'Ch', full: 'Chorshanba' },
  { key: 'thu', short: 'Pa', full: 'Payshanba' },
  { key: 'fri', short: 'Ju', full: 'Juma' },
  { key: 'sat', short: 'Sh', full: 'Shanba' },
  { key: 'sun', short: 'Ya', full: 'Yakshanba' },
];

/** "08:00:00" -> "08:00" */
export const toHHmm = (h?: string | null, fallback = '') => {
  if (!h) return fallback;
  const p = h.split(':');
  return p.length >= 2 ? `${p[0].padStart(2, '0')}:${p[1]}` : h;
};
/** "08:00" -> "08:00:00" */
export const toHHmmss = (h: string) => (h.length === 5 ? `${h}:00` : h);

export const normalizeHours = (src: any, defaults: Partial<WorkingHours> = {}): WorkingHours => ({
  mon: src ? !!src.mon : defaults.mon ?? true,
  tue: src ? !!src.tue : defaults.tue ?? true,
  wed: src ? !!src.wed : defaults.wed ?? true,
  thu: src ? !!src.thu : defaults.thu ?? true,
  fri: src ? !!src.fri : defaults.fri ?? true,
  sat: src ? !!src.sat : defaults.sat ?? true,
  sun: src ? !!src.sun : defaults.sun ?? true,
  from_hour: toHHmm(src?.from_hour, defaults.from_hour || '08:00'),
  to_hour: toHHmm(src?.to_hour, defaults.to_hour || '22:00'),
});

export const hoursToPayload = (h: WorkingHours) => ({
  ...h,
  from_hour: toHHmmss(h.from_hour),
  to_hour: toHHmmss(h.to_hour),
});

export const summarizeHours = (h?: any) => {
  if (!h) return null;
  const days = DAYS.filter((d) => h[d.key]).map((d) => d.short);
  const all = days.length === 7;
  return `${all ? 'Har kuni' : days.length ? days.join(', ') : 'Dam olish'} · ${toHHmm(h.from_hour, '—')}–${toHHmm(h.to_hour, '—')}`;
};

export const WorkingHoursEditor: React.FC<{
  value: WorkingHours;
  onChange: (v: WorkingHours) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className="space-y-4">
    <div>
      <div className="text-[13px] font-semibold text-ink mb-1.5">Ish kunlari</div>
      <div className="grid grid-cols-7 gap-1.5">
        {DAYS.map((d) => {
          const on = value[d.key];
          return (
            <button
              key={d.key}
              type="button"
              disabled={disabled}
              title={d.full}
              aria-pressed={on}
              onClick={() => onChange({ ...value, [d.key]: !on })}
              className={`h-11 rounded-xl text-[13px] font-bold transition cursor-pointer disabled:cursor-default
                ${on ? 'bg-brand text-white' : 'bg-field text-muted'} ${disabled ? 'opacity-80' : 'hover:brightness-95'}`}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <Input
        label="Ochilish"
        type="time"
        value={value.from_hour}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, from_hour: e.target.value })}
      />
      <Input
        label="Yopilish"
        type="time"
        value={value.to_hour}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, to_hour: e.target.value })}
      />
    </div>
  </div>
);
