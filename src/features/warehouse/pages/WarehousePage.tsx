import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownToLine, BookOpenCheck, ClipboardList, History, PackageMinus, PackageX, Plus, Wallet, Wheat } from 'lucide-react';
import {
  Badge, Button, EmptyState, ErrorState, InlineAlert, PageHeader, SearchInput, Segmented, Select, SkeletonList, StatCard, Tabs,
} from '../../../core/ui';
import { formatDateTime, formatMoney } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { useWorkingFilial } from '../../../core/lib/useWorkingFilial';
import { formatQty, KIND_META, STATE_META, UNIT_LABEL, warehouseApi } from '../warehouseApi';
import type { Ingredient, IngredientList, ManualKind, Movement, MovementKind, RecipeSummary, StockState } from '../warehouseApi';
import { IngredientSheet } from '../components/IngredientSheet';
import { MovementSheet } from '../components/MovementSheet';
import { RecipeSheet } from '../components/RecipeSheet';

type Tab = 'stock' | 'recipes' | 'history';

/** Restoran: xom ashyo qoldig'i, texkartalar (tannarx/foyda) va ombor harakatlari jurnali. */
const WarehousePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'recipes' ? 'recipes' : params.get('tab') === 'history' ? 'history' : 'stock';
  const [workingFilial] = useWorkingFilial();

  const [list, setList] = useState<IngredientList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ingredient | null | 'new'>(null);
  const [movement, setMovement] = useState<{ kind: ManualKind; preselect?: Ingredient | null } | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const loadIngredients = useCallback(async () => {
    try {
      setList(await warehouseApi.ingredients());
      setListError(null);
    } catch (err) {
      setListError(getErrorMessage(err, "Omborni yuklab bo'lmadi."));
    }
  }, []);

  useEffect(() => {
    void loadIngredients();
  }, [loadIngredients, version, workingFilial]);

  const ingredients = list?.results || [];
  const summary = list?.summary;

  return (
    <div className="pb-8">
      <PageHeader
        title="Ombor va texkarta"
        subtitle={list?.filial.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={<PackageMinus className="w-4 h-4" />} disabled={!ingredients.length} onClick={() => setMovement({ kind: 'WRITE_OFF' })}>
              <span className="hidden sm:inline">Hisobdan chiqarish</span>
            </Button>
            <Button variant="outline" icon={<ClipboardList className="w-4 h-4" />} disabled={!ingredients.length} onClick={() => setMovement({ kind: 'COUNT' })}>
              <span className="hidden sm:inline">Inventarizatsiya</span>
            </Button>
            <Button icon={<ArrowDownToLine className="w-4 h-4" />} disabled={!ingredients.length} onClick={() => setMovement({ kind: 'PURCHASE' })}>
              Kirim
            </Button>
          </div>
        }
      />

      {!workingFilial && list && (
        <InlineAlert tone="info">
          Ko'rsatilmoqda: <b>{list.filial.name}</b>. Boshqa filial omborini ko'rish uchun yuqoridan filialni tanlang.
        </InlineAlert>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <StatCard label="Xom ashyo" value={summary?.total ?? '—'} icon={<Wheat className="w-4 h-4" />} tone="info" />
        <StatCard label="Ombor qiymati" value={summary ? formatMoney(summary.stock_value) : '—'} icon={<Wallet className="w-4 h-4" />} tone="brand" />
        <StatCard label="Kam qoldi" value={summary?.low ?? '—'} icon={<AlertTriangle className="w-4 h-4" />} tone="gold" />
        <StatCard label="Tugagan" value={summary?.out ?? '—'} icon={<PackageX className="w-4 h-4" />} tone="danger" />
      </div>

      <div className="mt-4">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => setParams(v === 'stock' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'stock', label: 'Xom ashyo', icon: <Wheat className="w-4 h-4" /> },
            { value: 'recipes', label: 'Texkartalar', icon: <BookOpenCheck className="w-4 h-4" /> },
            { value: 'history', label: 'Harakatlar', icon: <History className="w-4 h-4" /> },
          ]}
        />
      </div>

      <div className="mt-4">
        {tab === 'stock' && (
          <StockTab
            list={list}
            error={listError}
            onRetry={loadIngredients}
            onAdd={() => setEditing('new')}
            onEdit={setEditing}
            onPurchase={(i) => setMovement({ kind: 'PURCHASE', preselect: i })}
          />
        )}
        {tab === 'recipes' && <RecipesTab ingredients={ingredients} version={version} onChanged={refresh} onAddIngredient={() => setEditing('new')} />}
        {tab === 'history' && <HistoryTab ingredients={ingredients} version={version} workingFilial={workingFilial} />}
      </div>

      {editing && (
        <IngredientSheet ingredient={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
      {movement && (
        <MovementSheet
          kind={movement.kind}
          preselect={movement.preselect}
          ingredients={ingredients}
          onClose={() => setMovement(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
};

// ── Xom ashyo ──

const StockTab: React.FC<{
  list: IngredientList | null;
  error: string | null;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (i: Ingredient) => void;
  onPurchase: (i: Ingredient) => void;
}> = ({ list, error, onRetry, onAdd, onEdit, onPurchase }) => {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<StockState | ''>('');

  if (!list) return error ? <ErrorState message={error} onRetry={onRetry} /> : <SkeletonList rows={5} />;

  const q = search.trim().toLowerCase();
  const rows = list.results.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!state || r.state === state));
  const s = list.summary;

  if (!s.total) {
    return (
      <EmptyState
        icon={<Wheat className="w-7 h-7" />}
        title="Xom ashyo hali yo'q"
        description="Go'sht, guruch, yog' kabi xom ashyolarni qo'shing, so'ng taomlarga texkarta tuzing — sotilganda ombordan o'zi ayiriladi."
        action={<Button icon={<Plus className="w-4 h-4" />} onClick={onAdd}>Xom ashyo qo'shish</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px]">
          <SearchInput value={search} onChange={setSearch} placeholder="Xom ashyo nomi..." />
        </div>
        <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={onAdd}>Xom ashyo</Button>
      </div>
      <Tabs
        value={state}
        onChange={setState}
        options={[
          { value: '', label: 'Hammasi', count: s.total },
          { value: 'low', label: 'Kam qoldi', count: s.low },
          { value: 'out', label: 'Tugagan', count: s.out },
          { value: 'ok', label: 'Yetarli' },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="Topilmadi" description="Qidiruv yoki filtrni o'zgartirib ko'ring." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.uuid} className="flex items-center gap-3 bg-surface border border-edge rounded-2xl p-3">
              <button type="button" onClick={() => onEdit(r)} className="min-w-0 flex-1 text-left cursor-pointer">
                <div className="text-[15px] font-bold text-ink truncate">{r.name}</div>
                <div className="text-[12px] text-muted truncate">
                  {r.cost_price > 0 ? `${formatMoney(r.cost_price)} / ${UNIT_LABEL[r.unit]}` : 'Tannarx kiritilmagan'}
                  {r.recipes_count ? ` · ${r.recipes_count} ta texkartada` : ''}
                  {r.min_stock > 0 ? ` · chegara ${formatQty(r.min_stock, r.unit)}` : ''}
                </div>
              </button>
              <div className="text-right shrink-0">
                <div className={`text-[17px] font-black tabular-nums ${r.quantity < 0 ? 'text-danger-ink' : 'text-ink'}`}>{formatQty(r.quantity, r.unit)}</div>
                <div className="flex items-center justify-end gap-2">
                  {r.stock_value > 0 && <span className="text-[12px] text-muted tabular-nums">{formatMoney(r.stock_value)}</span>}
                  <Badge tone={STATE_META[r.state].tone}>{STATE_META[r.state].label}</Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" icon={<ArrowDownToLine className="w-4 h-4" />} onClick={() => onPurchase(r)} aria-label="Kirim">
                <span className="hidden md:inline">Kirim</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {list.results.some((r) => r.quantity < 0) && (
        <p className="text-[12px] text-muted">
          Minus qoldiq — kirim kiritilmasdan sotilgan. Kirim yoki inventarizatsiya bilan to'g'rilang.
        </p>
      )}
    </div>
  );
};

// ── Texkartalar ──

const RecipesTab: React.FC<{ ingredients: Ingredient[]; version: number; onChanged: () => void; onAddIngredient: () => void }> = ({
  ingredients, version, onChanged, onAddIngredient,
}) => {
  const [rows, setRows] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState<'' | 'with' | 'without'>('');
  const [open, setOpen] = useState<RecipeSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await warehouseApi.recipes());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Texkartalarni yuklab bo'lmadi."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  if (!rows) return error ? <ErrorState message={error} onRetry={load} /> : <SkeletonList rows={5} />;

  const q = search.trim().toLowerCase();
  const withCount = rows.filter((r) => r.has_recipe).length;
  const shown = rows.filter(
    (r) => (!q || r.name.toLowerCase().includes(q)) && (!state || (state === 'with' ? r.has_recipe : !r.has_recipe)),
  );

  return (
    <div className="space-y-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Taom nomi..." />
      <Tabs
        value={state}
        onChange={setState}
        options={[
          { value: '', label: 'Hammasi', count: rows.length },
          { value: 'with', label: 'Texkartali', count: withCount },
          { value: 'without', label: 'Texkartasiz', count: rows.length - withCount },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState title="Taom topilmadi" description={rows.length ? "Qidiruvni o'zgartirib ko'ring." : "Avval «Menyu» bo'limida taom qo'shing."} />
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.uuid}>
              <button
                type="button"
                onClick={() => setOpen(r)}
                className="w-full flex items-center gap-3 bg-surface border border-edge rounded-2xl p-3 text-left hover:border-edge-strong transition cursor-pointer"
              >
                {r.image ? (
                  <img src={r.image} alt="" className="w-12 h-12 rounded-xl object-cover bg-field shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-field shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-ink truncate">{r.name}</div>
                  <div className="text-[12px] text-muted truncate">
                    Narx {formatMoney(r.price)}
                    {r.has_recipe ? ` · tannarx ${formatMoney(r.cost)} · ${r.items_count} xil` : ''}
                    {r.from_set ? ' (tarkibdan)' : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {r.has_recipe && r.margin !== null ? (
                    <>
                      <div className={`text-[17px] font-black tabular-nums ${r.margin < 50 ? 'text-warning-ink' : 'text-brand-dark'}`}>{r.margin}%</div>
                      <div className="text-[11px] text-muted">foyda</div>
                    </>
                  ) : (
                    <Badge tone="neutral">Texkarta yo'q</Badge>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <RecipeSheet
          product={open}
          ingredients={ingredients}
          onClose={() => setOpen(null)}
          onSaved={() => {
            void load();
            onChanged();
          }}
          onAddIngredient={() => {
            setOpen(null);
            onAddIngredient();
          }}
        />
      )}
    </div>
  );
};

// ── Harakatlar ──

const PAGE = 50;

const HistoryTab: React.FC<{ ingredients: Ingredient[]; version: number; workingFilial: string | null }> = ({ ingredients, version, workingFilial }) => {
  const [kind, setKind] = useState<MovementKind | ''>('');
  const [ingredient, setIngredient] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ count: number; results: Movement[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await warehouseApi.movements({ kind, ingredient: ingredient || undefined, page }));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Harakatlarni yuklab bo'lmadi."));
    } finally {
      setLoading(false);
    }
  }, [kind, ingredient, page]);

  useEffect(() => {
    void load();
  }, [load, version, workingFilial]);

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Turi" containerClassName="flex-1 min-w-[160px]" value={kind} onChange={(e) => { setKind(e.target.value as MovementKind | ''); setPage(1); }}>
          <option value="">Barcha harakatlar</option>
          {(Object.keys(KIND_META) as MovementKind[]).filter((k) => k !== 'ADJUST').map((k) => (
            <option key={k} value={k}>{KIND_META[k].label}</option>
          ))}
        </Select>
        <Select aria-label="Xom ashyo" containerClassName="flex-1 min-w-[160px]" value={ingredient} onChange={(e) => { setIngredient(e.target.value); setPage(1); }}>
          <option value="">Barcha xom ashyo</option>
          {ingredients.map((i) => (
            <option key={i.uuid} value={i.uuid}>{i.name}</option>
          ))}
        </Select>
      </div>

      {loading && !data ? (
        <SkeletonList rows={6} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data?.results.length ? (
        <EmptyState icon={<History className="w-7 h-7" />} title="Harakat yo'q" description="Kirim, sotuv va hisobdan chiqarishlar shu yerda ko'rinadi." />
      ) : (
        <ul className={`divide-y divide-edge bg-surface border border-edge rounded-2xl ${loading ? 'opacity-60' : ''}`}>
          {data.results.map((m) => (
            <li key={m.uuid} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-bold text-ink truncate">{m.ingredient.name}</span>
                  <Badge tone={KIND_META[m.kind].tone}>{KIND_META[m.kind].label}</Badge>
                </div>
                <div className="text-[12px] text-muted truncate">
                  {formatDateTime(m.created_at)}
                  {m.note ? ` · ${m.note}` : ''}
                  {m.created_by ? ` · ${m.created_by}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[15px] font-black tabular-nums ${m.quantity < 0 ? 'text-danger-ink' : 'text-brand-dark'}`}>
                  {m.quantity > 0 ? '+' : ''}{formatQty(m.quantity, m.ingredient.unit)}
                </div>
                <div className="text-[12px] text-muted tabular-nums">
                  {m.amount > 0 ? `${formatMoney(m.amount)} · ` : ''}qoldiq {formatQty(m.balance_after, m.ingredient.unit)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>← Oldingi</Button>
          <span className="text-[13px] text-muted tabular-nums">{page} / {pages}</span>
          <Button variant="outline" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Keyingi →</Button>
        </div>
      )}
    </div>
  );
};

export default WarehousePage;
