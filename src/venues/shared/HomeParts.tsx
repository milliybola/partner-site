import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Card } from '../../core/ui';

/** Bosh sahifadagi "hozirgi holat" katakchasi: raqam + havola */
export const LiveTile: React.FC<{ label: string; value: number | string; to: string; tone?: 'gold' | 'warning' | 'success' | 'info'; pulse?: boolean }> = ({
  label,
  value,
  to,
  tone = 'info',
  pulse,
}) => {
  const bg = { gold: 'bg-gold-soft text-gold-ink', warning: 'bg-warning-soft text-warning-ink', success: 'bg-brand-soft text-brand', info: 'bg-info-soft text-info' }[tone];
  return (
    <Link to={to} className={`rounded-2xl p-4 flex flex-col gap-1 transition hover:brightness-95 ${bg} ${pulse ? 'animate-new-order' : ''}`}>
      <span className="text-[13px] font-bold opacity-80">{label}</span>
      <span className="text-[30px] font-black tracking-tightest leading-none tabular-nums">{value}</span>
    </Link>
  );
};

/** Tez amal tugmasi (katta, barmoq uchun) */
export const QuickAction: React.FC<{ to: string; label: string; hint?: string; icon: LucideIcon }> = ({ to, label, hint, icon: Icon }) => (
  <Link to={to}>
    <Card interactive className="flex items-center gap-3 !p-3.5 h-full">
      <span className="w-11 h-11 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-ink truncate">{label}</span>
        {hint && <span className="block text-[12px] text-muted truncate">{hint}</span>}
      </span>
      <ArrowRight className="w-4 h-4 text-subtle shrink-0" />
    </Card>
  </Link>
);
