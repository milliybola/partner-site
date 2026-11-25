import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, Film, Plus, RefreshCw, Trash2, Tv } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Input, Select, Switch } from '../../../core/ui';
import { useToast } from '../../../core/components/ToastProvider';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { getPartner } from '../../../core/lib/session';
import { getWorkingFilial } from '../../../core/lib/workingFilial';
import { timeAgo } from '../../../core/lib/format';
import { catalogApi, type CatalogCategory } from '../../catalog/services/catalogApi';
import { screensApi, tvUrl, type PartnerScreen, type ScreenInput, type ScreenKind } from '../screensApi';
import { MediaPlaylist } from './MediaPlaylist';

const INTERVALS = [5, 8, 10, 15, 20, 30, 45, 60];
/** Brend ranglari: yashil, qizil, to'q sariq, sariq, ko'k, binafsha, jigarrang, qora */
const ACCENTS = ['#1f7a4d', '#c8102e', '#e8590c', '#e0a100', '#1864ab', '#6741d9', '#8b5a2b', '#212529'];

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const ScreenRow: React.FC<{
  screen: PartnerScreen;
  categories: CatalogCategory[];
  onChange: (s: PartnerScreen) => void;
  onRemove: (s: PartnerScreen) => void;
}> = ({ screen, categories, onChange, onRemove }) => {
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(screen.name);
  const [busy, setBusy] = useState(false);
  const isMedia = screen.kind === 'MEDIA';
  // Video ekranda menyu sozlamalari faqat pleylistda «Menyu taxtasi» bo'lsa kerak
  const [hasMenuSlide, setHasMenuSlide] = useState(false);

  const save = async (data: ScreenInput) => {
    setBusy(true);
    try {
      onChange(await screensApi.update(screen.uuid, data));
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    const ok = await confirm("Yangi kod berilsa, shu ekrandagi TV uziladi va unga yangi kodni kiritish kerak bo'ladi.", {
      title: 'Yangi kod',
      confirmText: 'Yangi kod berish',
    });
    if (!ok) return;
    setBusy(true);
    try {
      onChange(await screensApi.newCode(screen.uuid));
    } catch (err) {
      toast.error(getErrorMessage(err, "Bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const selected = new Set(screen.categories);
  const toggleCategory = (uuid: string) => {
    const next = selected.has(uuid) ? screen.categories.filter((u) => u !== uuid) : [...screen.categories, uuid];
    void save({ categories: next });
  };
  const link = tvUrl(screen.code);

  return (
    <div className="rounded-2xl border border-edge p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-field">
          {isMedia ? <Film className="h-5 w-5 text-ink" /> : <Tv className="h-5 w-5 text-ink" />}
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== screen.name && void save({ name: name.trim() })}
            className="w-full bg-transparent text-[15px] font-extrabold text-ink outline-none"
          />
          <div className="text-[12px] text-muted">
            {isMedia ? 'Video ekran · ' : 'Menyu ekrani · '}
            {screen.online ? (
              <span className="font-bold text-emerald-600">● Ulangan</span>
            ) : screen.last_seen_at ? (
              `Oxirgi ulanish: ${timeAgo(screen.last_seen_at)}`
            ) : (
              'Hali ulanmagan'
            )}
            {screen.filial_name ? ` · ${screen.filial_name}` : ''}
          </div>
        </div>
        <div className="rounded-xl bg-field px-3 py-1.5 text-center">
          <div className="text-[10px] font-bold uppercase text-muted">Kod</div>
          <div className="font-mono text-[20px] font-black tracking-[0.2em] text-ink">{screen.code}</div>
        </div>
        <Switch checked={screen.is_active} disabled={busy} onChange={(v) => void save({ is_active: v })} label="Faol" size="sm" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-field px-2.5 py-1.5 text-[12px] text-muted">{link}</code>
        <Button
          variant="outline"
          size="sm"
          icon={<Copy className="h-4 w-4" />}
          onClick={async () => ((await copy(link)) ? toast.success('Havola nusxalandi') : toast.error("Nusxalab bo'lmadi"))}
        >
          Nusxalash
        </Button>
        {link.startsWith('http') && (
          <Button variant="outline" size="sm" icon={<ExternalLink className="h-4 w-4" />} onClick={() => window.open(link, '_blank')}>
            Ko'rish
          </Button>
        )}
      </div>

      {isMedia && (
        <div className="mt-4 space-y-4">
          <Switch checked={screen.sound} disabled={busy} onChange={(v) => void save({ sound: v })} label="Videolar ovozi bilan" size="sm" />
          <MediaPlaylist screen={screen} onItems={(list) => setHasMenuSlide(list.some((m) => m.kind === 'MENU'))} />
        </div>
      )}

      {(!isMedia || hasMenuSlide) && (
      <>
      {isMedia && <div className="mt-5 border-t border-edge pt-4 text-[14px] font-extrabold text-ink">Menyu taxtasi ko'rinishi</div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Select label="Sahifa almashishi" value={screen.interval} disabled={busy} onChange={(e) => void save({ interval: Number(e.target.value) })}>
          {INTERVALS.map((s) => (
            <option key={s} value={s}>
              {s} soniya
            </option>
          ))}
        </Select>
        <Select label="Mavzu" value={screen.theme} disabled={busy} onChange={(e) => void save({ theme: e.target.value as PartnerScreen['theme'] })}>
          <option value="dark">Qorong'i</option>
          <option value="light">Yorug'</option>
        </Select>
        <div>
          <div className="mb-1.5 text-[13px] font-bold text-ink">Ko'rinish</div>
          <div className="flex h-11 items-center">
            <Switch
              checked={screen.show_images}
              disabled={busy}
              onChange={(v) => void save({ show_images: v })}
              label={screen.show_images ? 'Rasmli kartalar' : "Ro'yxat (rasmsiz)"}
              size="sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-bold text-ink">Brend rangi</div>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((col) => (
            <button
              key={col}
              type="button"
              disabled={busy}
              aria-label={col}
              onClick={() => void save({ accent: col })}
              className={`h-8 w-8 rounded-full transition ${screen.accent.toLowerCase() === col ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'}`}
              style={{ background: col }}
            />
          ))}
          <label className="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-edge px-3 text-[12px] font-bold text-muted hover:bg-field">
            <span className="h-4 w-4 rounded-full" style={{ background: screen.accent }} />
            Boshqa
            <input
              type="color"
              defaultValue={screen.accent}
              key={screen.accent}
              disabled={busy}
              // Rang tanlash oynasi yopilganda bir marta saqlanadi (sudrash paytida emas)
              onBlur={(e) => e.target.value.toLowerCase() !== screen.accent.toLowerCase() && void save({ accent: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[13px] font-bold text-ink">
          Kategoriyalar <span className="font-normal text-muted">— {screen.categories.length ? 'tanlanganlari, bosish tartibida' : 'hammasi'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const on = selected.has(c.uuid);
            const n = screen.categories.indexOf(c.uuid) + 1;
            return (
              <button
                key={c.uuid}
                type="button"
                disabled={busy}
                onClick={() => toggleCategory(c.uuid)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
                  on ? 'border-ink bg-ink text-white' : 'border-edge bg-white text-ink hover:bg-field'
                }`}
              >
                {on && <span className="mr-1 tabular-nums opacity-70">{n}.</span>}
                {c.name}
              </button>
            );
          })}
          {screen.categories.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void save({ categories: [] })} className="px-2 text-[13px] font-bold text-muted underline">
              Hammasi
            </button>
          )}
        </div>
      </div>
      </>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-4 w-4" />} disabled={busy} onClick={() => void regenerate()}>
          Yangi kod
        </Button>
        <Button variant="outline" size="sm" icon={<Trash2 className="h-4 w-4" />} disabled={busy} onClick={() => onRemove(screen)}>
          O'chirish
        </Button>
      </div>
    </div>
  );
};

/**
 * Zal TV ekranlari: har TV o'z kodi bilan ulanadi va menyuni aylantiradi.
 * Narx, rasm va stop-list katalogdan — TV daqiqasiga bir marta o'zi yangilanadi.
 */
export const TvScreensCard: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [screens, setScreens] = useState<PartnerScreen[] | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ScreenKind>('MENU');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    screensApi
      .list()
      .then(setScreens)
      .catch((err) => {
        setScreens([]);
        toast.error(getErrorMessage(err, "Ekranlarni yuklab bo'lmadi"));
      });
    const partner = getPartner();
    if (partner?.uuid)
      catalogApi
        .getCategories(partner.uuid)
        .then((c) => setCategories(c.filter((x) => x.is_active && x.products.length > 0)))
        .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    setCreating(true);
    try {
      const s = await screensApi.create({
        name: newName.trim() || `TV ${(screens?.length ?? 0) + 1}`,
        kind: newKind,
        filial_uuid: getWorkingFilial(),
      });
      setScreens((l) => [...(l ?? []), s]);
      setNewName('');
    } catch (err) {
      toast.error(getErrorMessage(err, "Ekran qo'shib bo'lmadi"));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (s: PartnerScreen) => {
    const ok = await confirm(`«${s.name}» ekranini o'chirasizmi? Undagi TV menyuni ko'rsatmay qo'yadi.`, { danger: true, confirmText: "O'chirish" });
    if (!ok) return;
    try {
      await screensApi.remove(s.uuid);
      setScreens((l) => (l ?? []).filter((x) => x.uuid !== s.uuid));
    } catch (err) {
      toast.error(getErrorMessage(err, "O'chirib bo'lmadi"));
    }
  };

  return (
    <Card>
      <CardHeader
        title="TV ekranlar"
        icon={<Tv className="w-[18px] h-[18px]" />}
        action={screens && screens.length > 0 ? <Badge>{screens.length}</Badge> : undefined}
      />
      <p className="text-[13px] text-muted">
        Zaldagi televizorda menyu yoki o'z videolaringiz aylanib turadi. TV brauzerida havolani oching yoki <b>…/#/tv</b> sahifasida kodni kiriting.
        O'zgarishlar TV ga bir daqiqada o'zi tushadi; videolar TV ning o'zida saqlanadi — internet uzilsa ham o'ynayveradi.
      </p>

      <div className="mt-4 space-y-3">
        {screens === null ? (
          <div className="py-6 text-center text-[13px] text-muted">Yuklanmoqda…</div>
        ) : (
          screens.map((s) => (
            <ScreenRow
              key={s.uuid}
              screen={s}
              categories={categories}
              onChange={(n) => setScreens((l) => (l ?? []).map((x) => (x.uuid === n.uuid ? n : x)))}
              onRemove={(x) => void remove(x)}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Input label="Yangi ekran" placeholder={`TV ${(screens?.length ?? 0) + 1}`} maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="w-[190px]">
          <Select label="Turi" value={newKind} onChange={(e) => setNewKind(e.target.value as ScreenKind)}>
            <option value="MENU">Menyu</option>
            <option value="MEDIA">Video / reklama</option>
          </Select>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} loading={creating} onClick={() => void add()}>
          Ekran qo'shish
        </Button>
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Maslahat: oddiy Smart TV brauzeri o'chib qolishi mumkin. Eng ishonchlisi — Android TV-box va kiosk-brauzer (TV yoqilganda menyu o'zi ochiladi).
      </p>
    </Card>
  );
};
