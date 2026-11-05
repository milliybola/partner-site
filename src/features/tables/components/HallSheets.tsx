import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, IconButton, InlineAlert, Input, Sheet, Switch } from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { formatMoney } from '../../../core/lib/format';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { useToast } from '../../../core/components/ToastProvider';
import { tablesApi } from '../services/tablesApi';
import type { Hall, TableModel } from '../services/tablesApi';

/* ------------------------------------------------------------ Transfer */
/**
 * Stol hisobini boshqa stolga o'tkazish: bo'sh stol — ko'chirish, band stol — birlashtirish.
 * Stollar zal bo'yicha guruhlangan; band stollarda joriy summa ko'rinadi.
 */
export const TransferSheet: React.FC<{
  from: TableModel | null;
  tables: TableModel[];
  onClose: () => void;
  onDone: () => void;
}> = ({ from, tables, onClose, onDone }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const candidates = tables.filter((t) => t.uuid !== from?.uuid && t.is_active !== false);
    const map = new Map<string, { name: string; items: TableModel[] }>();
    for (const t of candidates) {
      const key = t.hall || '';
      if (!map.has(key)) map.set(key, { name: t.hall_name || 'Zalsiz', items: [] });
      map.get(key)!.items.push(t);
    }
    return [...map.values()];
  }, [tables, from]);

  const pick = async (to: TableModel) => {
    if (!from) return;
    const busy = !!to.current_order || to.status === 'OCCUPIED';
    if (busy) {
      const ok = await confirm(`${from.table_number}-stol hisobi ${to.table_number}-stol hisobiga qo'shiladi. Davom etasizmi?`, {
        title: 'Stollarni birlashtirish',
        confirmText: 'Birlashtirish',
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await tablesApi.transferTable(from.uuid, to.uuid);
      toast.success(res.message || (busy ? 'Stollar birlashtirildi' : "Hisob ko'chirildi"));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, "Stolni o'tkazib bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={!!from}
      onClose={onClose}
      persistent={saving}
      title={from ? `${from.table_number}-stolni o'tkazish` : ''}
      subtitle="Bo'sh stol — hisob ko'chadi, band stol — hisoblar birlashadi"
    >
      {error && <InlineAlert className="mb-3">{error}</InlineAlert>}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.name}>
            {groups.length > 1 && <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-subtle">{g.name}</div>}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {g.items.map((t) => {
                const busy = !!t.current_order || t.status === 'OCCUPIED';
                return (
                  <button
                    key={t.uuid}
                    type="button"
                    disabled={saving}
                    onClick={() => pick(t)}
                    className={`min-h-[76px] rounded-2xl border-2 p-2 flex flex-col items-center justify-center gap-1 cursor-pointer transition disabled:opacity-50 ${
                      busy ? 'border-gold/50 bg-gold-soft hover:border-gold' : 'border-brand/20 bg-brand-soft hover:border-brand'
                    }`}
                  >
                    <span className="text-[20px] font-black text-ink leading-none">{t.table_number}</span>
                    <span className="text-[11px] font-bold text-muted">
                      {busy ? (t.current_order ? formatMoney(t.current_order.total_price) : 'Band') : "Bo'sh"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-[14px] text-muted">O'tkazish uchun boshqa faol stol yo'q.</p>}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted">
        <ArrowRightLeft className="w-3.5 h-3.5" /> To'langan buyurtmalar eski stolda qoladi.
      </p>
    </Sheet>
  );
};

/* --------------------------------------------------------------- Halls */
/** Zallar ro'yxati: qo'shish, nomini o'zgartirish, o'chirish (stollar zalsiz qoladi). Manager va egasi uchun. */
export const HallsSheet: React.FC<{ open: boolean; halls: Hall[]; onClose: () => void; onChanged: () => void }> = ({
  open,
  halls,
  onClose,
  onChanged,
}) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ uuid: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, 'Saqlab bo‘lmadi.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (await run(() => tablesApi.createHall({ name: n, display_order: halls.length + 1 }), "Zal qo'shildi")) setName('');
  };

  const rename = async () => {
    if (!editing?.name.trim()) return;
    if (await run(() => tablesApi.updateHall(editing.uuid, { name: editing.name.trim() }), 'Zal nomi saqlandi')) setEditing(null);
  };

  const toggleSelfService = (h: Hall, on: boolean) =>
    run(
      () => tablesApi.updateHall(h.uuid, { self_service: on }),
      on ? `«${h.name}» — o'z-o'ziga xizmat: buyurtma kassada stolsiz olinadi` : `«${h.name}» — ofitsiantli zal`,
    );

  const remove = async (h: Hall) => {
    const ok = await confirm(`«${h.name}» zalini o'chirasizmi? Undagi stollar o'chmaydi — zalsiz qoladi.`, {
      title: "Zalni o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (ok) await run(() => tablesApi.deleteHall(h.uuid), "Zal o'chirildi");
  };

  return (
    <Sheet open={open} onClose={onClose} persistent={busy} size="sm" title="Zallar" subtitle="Stollarni zallar bo'yicha guruhlash (asosiy zal, terassa, VIP …)">
      <form onSubmit={add} className="flex gap-2 items-end">
        <Input label="Yangi zal" placeholder="Masalan: Terassa" value={name} onChange={(e) => setName(e.target.value)} containerClassName="flex-1" />
        <Button type="submit" icon={<Plus className="w-4 h-4" />} disabled={!name.trim()} loading={busy && !editing}>
          Qo'shish
        </Button>
      </form>
      <div className="mt-4 space-y-2">
        {halls.map((h) =>
          editing?.uuid === h.uuid ? (
            <div key={h.uuid} className="flex gap-2 items-center">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} containerClassName="flex-1" autoFocus />
              <IconButton label="Saqlash" variant="secondary" onClick={rename}>
                <Check className="w-5 h-5" />
              </IconButton>
              <IconButton label="Bekor qilish" onClick={() => setEditing(null)}>
                <X className="w-5 h-5" />
              </IconButton>
            </div>
          ) : (
            <div key={h.uuid} className="flex items-center gap-2 min-h-14 py-2 pl-4 pr-1 rounded-2xl bg-field">
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-bold truncate">{h.name}</span>
                <span className="block text-[12px] text-muted">
                  {h.self_service ? "O'z-o'ziga xizmat · stolsiz, xizmat haqisiz, QR yo'q" : `Ofitsiantli · ${h.tables_count ?? 0} ta stol`}
                </span>
              </span>
              <label className="flex items-center gap-1.5 text-[12px] font-bold text-muted shrink-0" title="O'z-o'ziga xizmat">
                <span className="hidden sm:inline">O'z-o'ziga xizmat</span>
                <Switch size="sm" checked={!!h.self_service} disabled={busy} onChange={(v) => toggleSelfService(h, v)} />
              </label>
              <IconButton label="Nomini o'zgartirish" onClick={() => setEditing({ uuid: h.uuid, name: h.name })}>
                <Pencil className="w-[18px] h-[18px]" />
              </IconButton>
              <IconButton label="O'chirish" onClick={() => remove(h)}>
                <Trash2 className="w-[18px] h-[18px] text-danger-ink" />
              </IconButton>
            </div>
          ),
        )}
        {halls.length === 0 && <p className="text-[14px] text-muted">Hali zal yo'q. Zallarsiz ham ishlash mumkin — barcha stollar bitta ro'yxatda turadi.</p>}
      </div>
    </Sheet>
  );
};
