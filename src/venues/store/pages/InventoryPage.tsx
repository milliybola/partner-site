import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Boxes, PackageX, ScanBarcode } from 'lucide-react';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Select, SearchInput, SkeletonList, StatCard, Tabs } from '../../../core/ui';
import { filialApi } from '../../../features/orders/services/filialApi';
import type { PartnerFilial } from '../../../features/orders/services/filialApi';
import { env } from '../../../core/config/env';
import { formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { isManager } from '../../../core/lib/session';
import { formatQty, inventoryApi, STATE_META } from '../inventoryApi';
import type { InventoryList, InventoryRow, StockState } from '../inventoryApi';
import { StockSheet } from '../components/StockSheet';

const PAGE_SIZE = 30;

type StateFilter = StockState | '';

/** Do'kon: ombor — qoldiqlar, "oz qoldi / tugagan" ogohlantirishlari, kirim-chiqim va shtrix-kod bo'yicha qidirish. */
const InventoryPage: React.FC = () => {
  const manager = isManager();
  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  const [filial, setFilial] = useState('');
  const [state, setState] = useState<StateFilter>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InventoryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const searchBox = useRef<HTMLDivElement>(null);

  // Egasi filial tanlaydi; menejer faqat o'z filialini ko'radi (server o'zi aniqlaydi)
  useEffect(() => {
    if (manager) return;
    filialApi.getFilials().then(setFilials).catch(() => setFilials([]));
  }, [manager]);

  // Skaner klaviatura kabi tez yozadi — 300 ms to'xtagach qidiramiz
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(
        await inventoryApi.list({
          filial: filial || undefined, search: debounced, state, page, page_size: PAGE_SIZE,
          threshold: env.lowStockThreshold,
        }),
      );
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Omborni yuklab bo'lmadi."));
    } finally {
      setLoading(false);
    }
  }, [filial, debounced, state, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (row: InventoryRow) => {
    // Qator holati o'zgargan bo'lishi mumkin (filtr/jami) — ro'yxatni qayta yuklaymiz
    setData((d) => (d ? { ...d, results: d.results.map((r) => (r.uuid === row.uuid ? row : r)) } : d));
    void load();
  };

  // Shtrix-kod aniq bitta mahsulotni topsa va Enter bosilsa — darhol tahrirlash oynasi
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && data?.results.length === 1) setEditing(data.results[0]);
  };

  const summary = data?.summary;
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;
  const tabs: { value: StateFilter; label: string; count?: number }[] = [
    { value: '', label: 'Hammasi', count: summary?.total },
    { value: 'low', label: 'Oz qoldi', count: summary?.low },
    { value: 'out', label: 'Tugagan', count: summary?.out },
    { value: 'ok', label: 'Mavjud' },
  ];

  return (
    <div className="pb-8">
      <PageHeader
        title="Ombor va qoldiq"
        subtitle={data?.filial.name}
        actions={
          !manager && filials.length > 1 ? (
            <Select aria-label="Filial" value={filial} onChange={(e) => { setFilial(e.target.value); setPage(1); }}>
              <option value="">Asosiy filial</option>
              {filials.map((f) => (
                <option key={f.uuid} value={f.uuid}>{f.filial_name}</option>
              ))}
            </Select>
          ) : undefined
        }
      />

      <div className="grid grid-cols-3 gap-3 mt-2">
        <StatCard label="Mahsulotlar" value={summary?.total ?? '—'} icon={<Boxes className="w-4 h-4" />} tone="info" />
        <button type="button" className="text-left cursor-pointer" onClick={() => setState(state === 'low' ? '' : 'low')}>
          <StatCard label="Oz qoldi" value={summary?.low ?? '—'} icon={<AlertTriangle className="w-4 h-4" />} tone="gold" hint={`≤ ${data?.threshold ?? env.lowStockThreshold}`} />
        </button>
        <button type="button" className="text-left cursor-pointer" onClick={() => setState(state === 'out' ? '' : 'out')}>
          <StatCard label="Tugagan" value={summary?.out ?? '—'} icon={<PackageX className="w-4 h-4" />} tone="danger" />
        </button>
      </div>

      <div className="mt-4 space-y-3" ref={searchBox} onKeyDown={onEnter}>
        <SearchInput value={search} onChange={setSearch} placeholder="Nomi, brend yoki shtrix-kod (skanerlang)..." autoFocus />
        <Tabs value={state} onChange={(v) => { setState(v); setPage(1); }} options={tabs} />
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <SkeletonList rows={5} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={load} />
        ) : data && data.results.length === 0 ? (
          <EmptyState
            icon={<ScanBarcode className="w-7 h-7" />}
            title="Mahsulot topilmadi"
            description={debounced || state ? "Qidiruv yoki filtrni o'zgartirib ko'ring." : 'Avval «Mahsulotlar» bo‘limida mahsulot qo‘shing.'}
          />
        ) : (
          <ul className={`space-y-2 ${loading ? 'opacity-60' : ''}`}>
            {data?.results.map((r) => (
              <li key={r.uuid}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="w-full flex items-center gap-3 bg-surface border border-edge rounded-2xl p-3 text-left hover:border-edge-strong transition cursor-pointer"
                >
                  {r.image ? (
                    <img src={r.image} alt="" className="w-14 h-14 rounded-xl object-cover bg-field shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-field shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-ink truncate">{r.name}</div>
                    <div className="text-[12px] text-muted truncate">
                      {[r.brand, r.barcode && `#${r.barcode}`].filter(Boolean).join(' · ') || formatMoney(r.price)}
                    </div>
                    <div className="text-[12px] text-muted">{formatMoney(r.price)}{r.unit === 'KG' ? ' / kg' : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[17px] font-black text-ink tabular-nums">{formatQty(r.quantity, r.unit)}</div>
                    <Badge tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Oldingi</Button>
          <span className="text-[13px] text-muted tabular-nums">{page} / {pages}</span>
          <Button variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Keyingi →</Button>
        </div>
      )}

      {editing && <StockSheet key={editing.uuid} row={editing} filialUuid={data?.filial.uuid} onClose={() => setEditing(null)} onSaved={patchRow} />}
    </div>
  );
};

export default InventoryPage;
