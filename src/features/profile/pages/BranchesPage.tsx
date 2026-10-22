import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Clock, Edit2, ExternalLink, MapPin, Phone, Plus, Star, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { filialApi } from '../../orders/services/filialApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { staffApi } from '../../staff/services/staffApi';
import type { StaffMember } from '../../staff/services/staffApi';
import { useToast } from '../../../core/components/ToastProvider';
import { useNavigate } from 'react-router-dom';
import { limitText, useTariff } from '../../../core/lib/tariff';
import { useConfirm } from '../../../core/components/ConfirmProvider';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  Input,
  PageHeader,
  Select,
  Sheet,
  SkeletonList,
  Switch,
} from '../../../core/ui';
import type { BadgeTone } from '../../../core/ui';
import { getErrorMessage } from '../../../core/lib/errors';
import { cleanPhone, formatPhone, maskPhoneInput } from '../../../core/lib/format';
import { openExternal } from '../../../core/platform';
import { YandexLocationPicker } from '../components/YandexLocationPicker';
import { WorkingHoursEditor, hoursToPayload, normalizeHours, summarizeHours } from '../components/WorkingHoursEditor';
import type { WorkingHours } from '../components/WorkingHoursEditor';

type FilialStatus = PartnerFilial['filial_status'];

const STATUS: Record<FilialStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Faol', tone: 'success' },
  INACTIVE: { label: 'Faol emas', tone: 'warning' },
  CLOSED: { label: 'Yopiq', tone: 'danger' },
};

interface BranchForm {
  filialName: string;
  address: string;
  phone: string;
  lat: string;
  lng: string;
  status: FilialStatus;
  isMain: boolean;
  managerUuid: string;
  hours: WorkingHours;
}

const managerUuidOf = (b?: PartnerFilial | null) =>
  b?.manager_info?.uuid || (typeof b?.manager === 'string' ? b.manager : (b?.manager as any)?.uuid) || '';

const toForm = (b?: PartnerFilial | null): BranchForm => ({
  filialName: b?.filial_name || '',
  address: b?.address || '',
  phone: b?.phone ? maskPhoneInput(b.phone) : '+998',
  lat: b?.location_lat != null ? String(b.location_lat) : '',
  lng: b?.location_long != null ? String(b.location_long) : '',
  status: b?.filial_status || 'ACTIVE',
  isMain: !!b?.is_main,
  managerUuid: managerUuidOf(b),
  hours: normalizeHours(b?.opening_hours),
});

const BranchesPage: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { tariff, refresh: refreshTariffUsage } = useTariff();
  const confirm = useConfirm();
  const [branches, setBranches] = useState<PartnerFilial[]>([]);
  useEffect(() => {
    void refreshTariffUsage();
  }, [branches.length, refreshTariffUsage]);
  const [managers, setManagers] = useState<StaffMember[]>([]);
  const [managersError, setManagersError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerFilial | null>(null);
  const [form, setForm] = useState<BranchForm>(() => toForm(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assignFor, setAssignFor] = useState<PartnerFilial | null>(null);
  const [assignUuid, setAssignUuid] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Branches are required; managers are optional (page still works without them).
      const [branchRes, staffRes] = await Promise.allSettled([filialApi.getFilials(), staffApi.getStaff()]);
      if (branchRes.status === 'rejected') throw branchRes.reason;
      setBranches(branchRes.value);
      if (staffRes.status === 'fulfilled') {
        setManagers(staffRes.value.filter((s) => s.role === 'manager' && s.is_active));
        setManagersError(false);
      } else {
        setManagers([]);
        setManagersError(true);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Filiallar ro'yxatini yuklab bo'lmadi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const set = <K extends keyof BranchForm>(k: K, v: BranchForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => {
    if (!tariff.can_add_filial) {
      toast.error(`Filial limiti to'lgan (${tariff.usage.filials} / ${limitText(tariff.max_filials)}). Tarifni oshiring.`);
      navigate('/plan?need=filials');
      return;
    }
    setEditing(null);
    setForm(toForm(null));
    setFormError(null);
    setEditOpen(true);
  };

  const openEdit = (b: PartnerFilial) => {
    setEditing(b);
    setForm(toForm(b));
    setFormError(null);
    setEditOpen(true);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    if (!form.filialName.trim()) return setFormError("Filial nomini kiriting.");
    const ph = cleanPhone(form.phone);
    if (ph.length > 4 && ph.length !== 13) return setFormError("Telefon raqami to'liq emas.");
    const lat = form.lat ? parseFloat(form.lat) : undefined;
    const lng = form.lng ? parseFloat(form.lng) : undefined;
    if ((form.lat && !Number.isFinite(lat)) || (form.lng && !Number.isFinite(lng))) return setFormError("Koordinatalar noto'g'ri.");

    const payload: any = {
      filial_name: form.filialName.trim(),
      address: form.address || undefined,
      phone: ph.length === 13 ? ph : undefined,
      location_lat: lat,
      location_long: lng,
      filial_status: form.status,
      is_main: form.isMain,
      manager: form.managerUuid || null,
      opening_hours: hoursToPayload(form.hours),
    };

    setSubmitting(true);
    try {
      if (editing) {
        await filialApi.updateFilial(editing.uuid, payload);
        toast.success('Filial saqlandi');
      } else {
        await filialApi.createFilial(payload);
        toast.success("Yangi filial qo'shildi");
      }
      setEditOpen(false);
      fetchData();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Filialni saqlashda xatolik yuz berdi.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openAssign = (b: PartnerFilial) => {
    setAssignFor(b);
    setAssignUuid(managerUuidOf(b));
    setAssignError(null);
  };

  const submitAssign = async () => {
    if (!assignFor) return;
    if (!assignUuid) return setAssignError('Menejerni tanlang.');
    setAssigning(true);
    setAssignError(null);
    try {
      await filialApi.assignManager(assignFor.uuid, assignUuid);
      toast.success('Menejer biriktirildi');
      setAssignFor(null);
      fetchData();
    } catch (err) {
      setAssignError(getErrorMessage(err, 'Menejerni biriktirishda xatolik yuz berdi.'));
    } finally {
      setAssigning(false);
    }
  };

  const remove = async (b: PartnerFilial) => {
    const ok = await confirm(`"${b.filial_name}" filiali o'chiriladi. Bu amalni qaytarib bo'lmaydi.`, {
      title: "Filialni o'chirish",
      danger: true,
      confirmText: "O'chirish",
    });
    if (!ok) return;
    try {
      await filialApi.deleteFilial(b.uuid);
      toast.success("Filial o'chirildi");
      fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, "Filialni o'chirishda xatolik yuz berdi."));
    }
  };

  const managerOptions = managers.map((m) => (
    <option key={m.uuid} value={m.uuid}>
      {m.name} · {formatPhone(m.phone)}
    </option>
  ));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Filiallar"
        subtitle={!loading && !error ? `${branches.length} ta filial` : 'Manzil, ish vaqti va menejerlar'}
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            <span className="hidden xs:inline">Filial qo'shish</span>
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={fetchData} />
        </Card>
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="w-7 h-7" />}
            title="Hali filial yo'q"
            description="Birinchi filialingizni qo'shing — buyurtmalar, stollar va xodimlar filialga bog'lanadi."
            action={
              <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
                Filial qo'shish
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {branches.map((b) => {
            const st = STATUS[b.filial_status] || { label: b.filial_status, tone: 'neutral' as BadgeTone };
            const hasCoords = b.location_lat != null && b.location_long != null;
            const managerName = b.manager_info?.name || (b.manager as any)?.name;
            const hoursText = summarizeHours(b.opening_hours);
            return (
              <Card key={b.uuid} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[16px] font-extrabold tracking-tightest truncate">{b.filial_name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                      {b.is_main && (
                        <Badge tone="gold">
                          <Star className="w-3 h-3 fill-current" /> Asosiy
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex -mr-2 -mt-1">
                    <IconButton label="Tahrirlash" onClick={() => openEdit(b)}>
                      <Edit2 className="w-[18px] h-[18px]" />
                    </IconButton>
                    <IconButton label="O'chirish" variant="danger-soft" onClick={() => remove(b)}>
                      <Trash2 className="w-[18px] h-[18px]" />
                    </IconButton>
                  </div>
                </div>

                <ul className="mt-3 space-y-2 text-[14px] flex-1">
                  <li className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-subtle mt-0.5 shrink-0" />
                    <span className={b.address ? 'text-ink' : 'text-muted'}>{b.address || 'Manzil kiritilmagan'}</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-subtle shrink-0" />
                    {b.phone ? (
                      <a href={`tel:${b.phone}`} className="text-ink hover:text-brand">
                        {formatPhone(b.phone)}
                      </a>
                    ) : (
                      <span className="text-muted">Telefon kiritilmagan</span>
                    )}
                  </li>
                  {hoursText && (
                    <li className="flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-subtle shrink-0" />
                      <span>{hoursText}</span>
                    </li>
                  )}
                  <li className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4 text-subtle shrink-0" />
                    <span className={managerName ? 'text-ink font-semibold' : 'text-muted'}>{managerName || 'Menejer biriktirilmagan'}</span>
                  </li>
                </ul>

                <div className="mt-4 pt-3 border-t border-edge grid grid-cols-2 gap-2">
                  <Button variant="secondary" icon={<UserPlus className="w-4 h-4" />} onClick={() => openAssign(b)}>
                    Menejer
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!hasCoords}
                    icon={<ExternalLink className="w-4 h-4" />}
                    onClick={() => openExternal(`https://yandex.uz/maps/?pt=${b.location_long},${b.location_lat}&z=16&l=map`)}
                  >
                    Xaritada
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Sheet
        open={editOpen}
        onClose={() => !submitting && setEditOpen(false)}
        persistent={submitting}
        size="lg"
        title={editing ? 'Filialni tahrirlash' : 'Yangi filial'}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setEditOpen(false)} disabled={submitting} className="md:w-auto">
              Bekor qilish
            </Button>
            <Button size="lg" onClick={() => submit()} loading={submitting}>
              {editing ? 'Saqlash' : "Qo'shish"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {formError && <InlineAlert>{formError}</InlineAlert>}
          <Input label="Filial nomi" required value={form.filialName} onChange={(e) => set('filialName', e.target.value)} placeholder="Masalan: Chilonzor filiali" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Telefon"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone', maskPhoneInput(e.target.value))}
              placeholder="+998 (90) 123-45-67"
            />
            <Select label="Holati" value={form.status} onChange={(e) => set('status', e.target.value as FilialStatus)}>
              <option value="ACTIVE">Faol</option>
              <option value="INACTIVE">Faol emas</option>
              <option value="CLOSED">Yopiq</option>
            </Select>
          </div>
          <Input label="Manzil" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Shahar, ko'cha, uy" />
          <YandexLocationPicker
            lat={form.lat}
            lng={form.lng}
            editable
            height={220}
            onChange={(la, lo) => setForm((f) => ({ ...f, lat: String(la), lng: String(lo) }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Kenglik" inputMode="decimal" value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder="41.311081" />
            <Input label="Uzunlik" inputMode="decimal" value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder="69.240562" />
          </div>
          <Select
            label="Menejer"
            value={form.managerUuid}
            onChange={(e) => set('managerUuid', e.target.value)}
            hint={managersError ? "Menejerlar ro'yxatini yuklab bo'lmadi" : managers.length === 0 ? "Faol menejer yo'q — Xodimlar bo'limida qo'shing" : undefined}
          >
            <option value="">Biriktirilmagan</option>
            {managerOptions}
          </Select>
          <div className="pt-1">
            <div className="text-[15px] font-extrabold tracking-tightest mb-3">Ish vaqti</div>
            <WorkingHoursEditor value={form.hours} onChange={(h) => set('hours', h)} />
          </div>
          <div className="flex items-center justify-between gap-4 p-3 rounded-2xl bg-field">
            <div>
              <div className="text-[14px] font-semibold">Asosiy filial</div>
              <div className="text-[12px] text-muted">Hisobotlar va sukut bo'yicha tanlovda birinchi turadi</div>
            </div>
            <Switch checked={form.isMain} onChange={(v) => set('isMain', v)} label="Asosiy filial" />
          </div>
          <button type="submit" className="hidden" />
        </form>
      </Sheet>

      {/* Assign manager */}
      <Sheet
        open={!!assignFor}
        onClose={() => !assigning && setAssignFor(null)}
        persistent={assigning}
        size="sm"
        title="Menejer biriktirish"
        subtitle={assignFor?.filial_name}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setAssignFor(null)} disabled={assigning}>
              Bekor qilish
            </Button>
            <Button size="lg" onClick={submitAssign} loading={assigning} disabled={!assignUuid}>
              Biriktirish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {assignError && <InlineAlert>{assignError}</InlineAlert>}
          {managers.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="w-7 h-7" />}
              title="Faol menejer yo'q"
              description={managersError ? "Xodimlar ro'yxatini yuklab bo'lmadi." : "Avval Xodimlar bo'limida menejer qo'shing."}
              className="py-6"
            />
          ) : (
            <div className="space-y-2" role="radiogroup">
              {managers.map((m) => {
                const on = assignUuid === m.uuid;
                return (
                  <button
                    key={m.uuid}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAssignUuid(m.uuid)}
                    className={`w-full flex items-center gap-3 p-3 min-h-[56px] rounded-2xl border text-left cursor-pointer transition
                      ${on ? 'border-brand bg-brand-soft' : 'border-edge hover:bg-field'}`}
                  >
                    <span className="w-10 h-10 rounded-xl bg-field flex items-center justify-center font-black text-muted shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold truncate">{m.name}</span>
                      <span className="block text-[13px] text-muted">
                        {formatPhone(m.phone)}
                        {m.current_filial?.filial_name ? ` · ${m.current_filial.filial_name}` : ''}
                      </span>
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 shrink-0 ${on ? 'border-brand bg-brand shadow-[inset_0_0_0_3px_white]' : 'border-edge-strong'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
};

export default BranchesPage;
