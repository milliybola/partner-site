import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { isCashier, isOwner } from '../../../core/lib/session';
import { useOwnerFilials, useWorkingFilial } from '../../../core/lib/useWorkingFilial';
import { catalogApi } from '../../catalog/services/catalogApi';
import { SearchInput, Segmented, Sheet, Skeleton, Switch } from '../../../core/ui';
import { t } from '../../../core/i18n';

interface Row {
  uuid: string;
  name: string;
  image: string | null;
  price: number;
  is_available: boolean;
}

/**
 * Stop-list (kassadan): tugagan taomni shu filialda bir bosishda sotuvdan olish / qaytarish.
 * Katalogdagi filial menyusi bilan bir xil (`partner/inventory/`): ega — tanlangan filial, menejer — o'z filiali.
 * Kassir ro'yxatni ko'radi, o'zgartira olmaydi (backend ham ruxsat bermaydi).
 */
export const StopListSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const toast = useToast();
  const readOnly = isCashier();
  const [workingFilial] = useWorkingFilial();
  const { filials } = useOwnerFilials();
  const filial =
    isOwner() && workingFilial && filials.some((f) => f.uuid === workingFilial && f.filial_status === 'ACTIVE') ? workingFilial : undefined;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'off'>('all');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out: Row[] = [];
      for (let page = 1; page < 20; page += 1) {
        const res = await apiClient.get('partner/inventory/', { params: { ...(filial ? { filial } : {}), page, page_size: 200, ordering: 'name' } });
        const d = res.data?.data;
        out.push(...((d?.results || []) as Row[]));
        if (!d || out.length >= Number(d.count || 0) || !(d.results || []).length) break;
      }
      setRows(out);
    } catch (err) {
      setError(getErrorMessage(err, t('sl.loadFail')));
    } finally {
      setLoading(false);
    }
  }, [filial]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const stopped = rows.filter((r) => !r.is_available).length;
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => (only === 'off' ? !r.is_available : true))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle));
  }, [rows, q, only]);

  const toggle = async (r: Row) => {
    const next = !r.is_available;
    setBusy(r.uuid);
    setRows((prev) => prev.map((x) => (x.uuid === r.uuid ? { ...x, is_available: next } : x)));
    try {
      await catalogApi.setFilialAvailability(r.uuid, next, filial);
    } catch (err) {
      setRows((prev) => prev.map((x) => (x.uuid === r.uuid ? { ...x, is_available: !next } : x)));
      toast.error(getErrorMessage(err, t('sl.fail')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="lg" title={t('sl.title')} subtitle={readOnly ? t('sl.readOnly') : t('sl.stopped', { n: stopped })}>
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('sl.search')} className="flex-1" autoFocus />
          <Segmented<'all' | 'off'>
            value={only}
            onChange={setOnly}
            options={[
              { value: 'all', label: t('sl.all') },
              { value: 'off', label: t('sl.stopped', { n: stopped }) },
            ]}
          />
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-[14px] font-bold text-danger">{error}</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-[14px] font-bold text-muted">{t('sl.empty')}</p>
        ) : (
          <ul className="divide-y divide-edge rounded-xl border border-edge overflow-hidden">
            {visible.map((r) => (
              <li key={r.uuid} className={`flex items-center gap-3 px-3 min-h-[60px] ${r.is_available ? 'bg-surface' : 'bg-danger-soft'}`}>
                {r.image ? (
                  <img src={r.image} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <span className="w-10 h-10 rounded-lg bg-field shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className={`block truncate text-[15px] font-extrabold ${r.is_available ? 'text-ink' : 'text-danger-ink line-through'}`}>{r.name}</span>
                  <span className="block text-[12px] font-semibold text-muted tabular-nums">{formatMoney(r.price)}</span>
                </span>
                {!r.is_available && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[12px] font-black text-danger-ink">
                    <Ban className="w-3.5 h-3.5" /> {t('sl.off')}
                  </span>
                )}
                <Switch checked={r.is_available} onChange={() => void toggle(r)} disabled={readOnly || busy === r.uuid} label={r.name} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
};
