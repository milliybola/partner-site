import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Camera, Check, Copy, Edit2, ImagePlus, Mail, MapPin, Phone, Star, Store, Truck, Clock, User, X } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { useToast } from '../../../core/components/ToastProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Input,
  LoadingState,
  MobileActionBar,
  PageHeader,
  SettingRow,
  Switch,
  Textarea,
} from '../../../core/ui';
import { getPartner, setPartner, isShop } from '../../../core/lib/session';
import type { PartnerSession } from '../../../core/lib/session';
import { getErrorMessage } from '../../../core/lib/errors';
import { cleanPhone, formatMoney, formatPhone, maskPhoneInput } from '../../../core/lib/format';
import { YandexLocationPicker } from '../components/YandexLocationPicker';
import { WorkingHoursEditor, hoursToPayload, normalizeHours, summarizeHours } from '../components/WorkingHoursEditor';
import type { WorkingHours } from '../components/WorkingHoursEditor';

interface ProfileForm {
  name: string;
  description: string;
  phone: string; // masked
  email: string;
  address: string;
  lat: string;
  lng: string;
  minOrderAmount: string;
  deliveryFee: string;
  freeDeliveryThreshold: string;
  isOpen: boolean;
  hours: WorkingHours;
}

const toForm = (p: any): ProfileForm => ({
  name: p?.name || '',
  description: p?.description || '',
  phone: p?.phone ? maskPhoneInput(p.phone) : '+998',
  email: p?.email || '',
  address: p?.address || '',
  lat: p?.location_lat != null && p?.location_lat !== '' ? String(p.location_lat) : '',
  lng: p?.location_long != null && p?.location_long !== '' ? String(p.location_long) : '',
  minOrderAmount: p?.min_order_amount != null ? String(parseFloat(p.min_order_amount) || 0) : '0',
  deliveryFee: p?.delivery_fee != null ? String(parseFloat(p.delivery_fee) || 0) : '0',
  freeDeliveryThreshold: p?.free_delivery_threshold != null ? String(parseFloat(p.free_delivery_threshold) || 0) : '0',
  isOpen: p?.is_open !== undefined ? !!p.is_open : true,
  hours: normalizeHours(p?.opening_hours, { sat: false, sun: false }),
});

/* ---------------------------------------------------------------- Manager */
const ManagerProfile: React.FC<{ data: PartnerSession }> = ({ data }) => (
  <div className="space-y-4">
    <PageHeader title="Profil" subtitle="Shaxsiy ma'lumotlaringiz" />
    <Card>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-soft text-brand flex items-center justify-center text-[26px] font-black shrink-0">
          {(data.name || 'M').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="text-[20px] font-extrabold tracking-tightest truncate">{data.name || '—'}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <Badge tone="success">Menejer</Badge>
            {data.partner_name && <span className="text-[13px] text-muted truncate">{data.partner_name}</span>}
          </div>
        </div>
      </div>
    </Card>
    <Card>
      <CardHeader title="Ma'lumotlar" icon={<User className="w-[18px] h-[18px]" />} />
      <dl className="divide-y divide-edge">
        {[
          ['Telefon', formatPhone(data.phone)],
          ['Hamkor', data.partner_name || '—'],
          ['Joriy filial', data.current_filial?.filial_name || data.filial_name || '—'],
          ['Asosiy filial', data.home_filial?.filial_name || '—'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[14px] text-muted">{k}</dt>
            <dd className="text-[14px] font-semibold text-right break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-muted mt-3">Ma'lumotlarni o'zgartirish uchun muassasa egasiga murojaat qiling.</p>
    </Card>
  </div>
);

/* ------------------------------------------------------------------ Page */
const ProfilePage: React.FC = () => {
  const toast = useToast();
  const manager = getPartner()?.role === 'manager';

  const [profile, setProfile] = useState<any>(null);
  const [managerData, setManagerData] = useState<PartnerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileForm>(() => toForm(getPartner()));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const existing = getPartner() || {};
    try {
      if (manager) {
        const res = await apiClient.get('partner/staff/me/');
        const staff = res.data?.data || res.data;
        // BUGFIX: previously overwrote session with the raw staff object, dropping
        // role/staff_uuid — a manager then looked like an owner everywhere else.
        const merged: PartnerSession = {
          ...existing,
          ...staff,
          role: 'manager',
          staff_uuid: staff?.uuid || existing.staff_uuid,
          uuid: staff?.partner_uuid || existing.uuid,
          current_filial:
            staff?.current_filial ||
            (staff?.filial_uuid ? { uuid: staff.filial_uuid, filial_name: staff.filial_name } : existing.current_filial),
        };
        setPartner(merged);
        setManagerData(merged);
      } else {
        const res = await apiClient.get('partner/me/');
        const data = res.data?.data || res.data;
        // BUGFIX: keep role and other session-only fields when refreshing.
        setPartner({ ...existing, ...data, role: 'superadmin' });
        setProfile(data);
        setForm(toForm(data));
      }
    } catch (err) {
      if (manager && existing?.name) {
        setManagerData(existing as PartnerSession);
      } else if (!manager && existing?.uuid) {
        setProfile(existing);
        setForm(toForm(existing));
        toast.error(getErrorMessage(err, "Yangi ma'lumotlarni yuklab bo'lmadi — saqlangan nusxa ko'rsatilmoqda."));
      } else {
        setLoadError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [manager, toast]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke object URLs for picked images
  useEffect(() => () => {
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
  }, [logoPreview]);
  useEffect(() => () => {
    if (bannerPreview?.startsWith('blob:')) URL.revokeObjectURL(bannerPreview);
  }, [bannerPreview]);

  const pickImage = (kind: 'logo' | 'banner') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Faqat rasm fayllarini yuklash mumkin.');
    if (file.size > 5 * 1024 * 1024) return toast.error("Rasm hajmi 5 MB dan oshmasligi kerak.");
    const url = URL.createObjectURL(file);
    if (kind === 'logo') {
      setLogoFile(file);
      setLogoPreview(url);
    } else {
      setBannerFile(file);
      setBannerPreview(url);
    }
  };

  const cancel = () => {
    setForm(toForm(profile));
    setLogoFile(null);
    setBannerFile(null);
    setLogoPreview(null);
    setBannerPreview(null);
    setErrors({});
    setEditing(false);
  };

  const validate = () => {
    const e: Partial<Record<keyof ProfileForm, string>> = {};
    if (!form.name.trim()) e.name = 'Nomini kiriting';
    const ph = cleanPhone(form.phone);
    if (ph.length > 4 && ph.length !== 13) e.phone = "Telefon raqami to'liq emas";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = "Email noto'g'ri";
    if (form.hours.from_hour && form.hours.to_hour && form.hours.from_hour === form.hours.to_hour) {
      e.hours = 'Ochilish va yopilish vaqti bir xil bo‘lmasin';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!validate()) {
      toast.error("Formadagi xatolarni to'g'rilang.");
      return;
    }
    setSaving(true);
    try {
      const hours = hoursToPayload(form.hours);
      const fd = new FormData();
      const ph = cleanPhone(form.phone);
      fd.append('name', form.name.trim());
      fd.append('address', form.address);
      fd.append('phone', ph.length === 13 ? ph : '');
      fd.append('email', form.email);
      fd.append('description', form.description);
      fd.append('min_order_amount', form.minOrderAmount || '0');
      fd.append('delivery_fee', form.deliveryFee || '0');
      fd.append('free_delivery_threshold', form.freeDeliveryThreshold || '0');
      fd.append('partner_type', profile?.partner_type || getPartner()?.partner_type || 'RESTAURANT');
      fd.append('is_open', form.isOpen ? 'true' : 'false');
      if (form.lat) fd.append('location_lat', form.lat);
      if (form.lng) fd.append('location_long', form.lng);
      if (logoFile) fd.append('logo', logoFile);
      if (bannerFile) fd.append('banner', bannerFile);
      fd.append('opening_hours', JSON.stringify(hours));

      const res = await apiClient.put('partner/me/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updated = res.data?.data || res.data || {};
      const merged = { ...profile, ...updated, opening_hours: updated.opening_hours || hours };
      setPartner({ ...(getPartner() || {}), ...merged, role: 'superadmin' });
      setProfile(merged);
      setForm(toForm(merged));
      setLogoFile(null);
      setBannerFile(null);
      setLogoPreview(null);
      setBannerPreview(null);
      setEditing(false);
      toast.success("Profil saqlandi");
    } catch (err) {
      toast.error(getErrorMessage(err, "Profilni saqlashda xatolik yuz berdi."));
    } finally {
      setSaving(false);
    }
  };

  const shop = isShop(profile);
  const typeLabel = useMemo(() => (shop ? "Do'kon" : 'Restoran'), [shop]);
  const logo = logoPreview || profile?.logo || null;
  const banner = bannerPreview || profile?.banner || null;
  const rating = profile?.rating != null && profile?.rating !== '' ? Number(profile.rating) : null;

  if (loading) return <LoadingState label="Profil yuklanmoqda..." />;
  if (manager) {
    return managerData ? <ManagerProfile data={managerData} /> : <ErrorState message={loadError || undefined} onRetry={load} />;
  }
  if (loadError && !profile) return <ErrorState message={loadError} onRetry={load} />;

  const ro = !editing;

  const copyUuid = async () => {
    if (!profile?.uuid) return;
    try {
      await navigator.clipboard.writeText(profile.uuid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const actions = editing ? (
    <div className="hidden md:flex gap-2">
      <Button variant="outline" onClick={cancel} disabled={saving} icon={<X className="w-4 h-4" />}>
        Bekor qilish
      </Button>
      <Button onClick={() => save()} loading={saving} icon={<Check className="w-4 h-4" />}>
        Saqlash
      </Button>
    </div>
  ) : (
    <Button variant="outline" onClick={() => setEditing(true)} icon={<Edit2 className="w-4 h-4" />}>
      <span className="hidden xs:inline">Tahrirlash</span>
    </Button>
  );

  return (
    <form onSubmit={save} className="space-y-4">
      <PageHeader title="Profil" subtitle={`${typeLabel} ma'lumotlari`} actions={actions} />

      {/* Hero */}
      <Card padded={false} className="overflow-hidden">
        <div className="relative h-32 md:h-44 bg-brand-soft">
          {banner ? (
            <img src={banner} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-brand/40">
              <ImagePlus className="w-8 h-8" />
            </div>
          )}
          {editing && (
            <label className="absolute right-3 bottom-3 inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-surface/95 text-[13px] font-bold shadow-card cursor-pointer">
              <Camera className="w-4 h-4" /> Bannerni almashtirish
              <input type="file" accept="image/*" className="hidden" onChange={pickImage('banner')} />
            </label>
          )}
        </div>
        <div className="px-4 md:px-5 pb-4 flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
          <div className="relative -mt-10 w-20 h-20 md:w-24 md:h-24 rounded-2xl border-4 border-surface bg-field overflow-hidden shrink-0">
            {logo ? (
              <img src={logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[28px] font-black text-muted">
                {(form.name || 'M').charAt(0).toUpperCase()}
              </div>
            )}
            {editing && (
              <label className="absolute inset-x-0 bottom-0 h-8 bg-ink/70 text-white flex items-center justify-center cursor-pointer" title="Logoni almashtirish">
                <Camera className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={pickImage('logo')} />
              </label>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] md:text-[22px] font-black tracking-tightest truncate">{form.name || 'Muassasa nomi'}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge tone="neutral">
                <Store className="w-3.5 h-3.5" /> {typeLabel}
              </Badge>
              {rating !== null && Number.isFinite(rating) && (
                <Badge tone="gold">
                  <Star className="w-3.5 h-3.5 fill-current" /> {rating.toFixed(1)}
                </Badge>
              )}
              <Badge tone={profile?.is_open ? 'success' : 'danger'} dot>
                {profile?.is_open ? 'Ochiq' : 'Yopiq'}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="Asosiy ma'lumotlar" icon={<Building2 className="w-[18px] h-[18px]" />} />
            <div className="space-y-4">
              <Input label="Nomi" required value={form.name} readOnly={ro} disabled={ro} error={errors.name} onChange={(e) => set('name', e.target.value)} placeholder="Muassasa nomi" />
              <Textarea
                label="Tavsif"
                rows={3}
                value={form.description}
                disabled={ro}
                onChange={(e) => set('description', e.target.value)}
                placeholder={shop ? "Do'koningiz haqida qisqacha" : 'Restoraningiz haqida qisqacha'}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Telefon"
                  type="tel"
                  inputMode="tel"
                  leftIcon={<Phone className="w-4 h-4" />}
                  value={form.phone}
                  disabled={ro}
                  error={errors.phone}
                  onChange={(e) => set('phone', maskPhoneInput(e.target.value))}
                  placeholder="+998 (90) 123-45-67"
                />
                <Input
                  label="Email"
                  type="email"
                  inputMode="email"
                  leftIcon={<Mail className="w-4 h-4" />}
                  value={form.email}
                  disabled={ro}
                  error={errors.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="info@example.uz"
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Manzil va joylashuv" subtitle="Kuryerlar va mijozlar shu nuqtani ko'radi" icon={<MapPin className="w-[18px] h-[18px]" />} />
            <div className="space-y-4">
              <Input label="Manzil" value={form.address} disabled={ro} onChange={(e) => set('address', e.target.value)} placeholder="Shahar, ko'cha, uy" />
              <YandexLocationPicker
                lat={form.lat}
                lng={form.lng}
                editable={editing}
                onChange={(la, lo) => setForm((f) => ({ ...f, lat: String(la), lng: String(lo) }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Kenglik" inputMode="decimal" value={form.lat} disabled={ro} onChange={(e) => set('lat', e.target.value)} placeholder="41.311081" />
                <Input label="Uzunlik" inputMode="decimal" value={form.lng} disabled={ro} onChange={(e) => set('lng', e.target.value)} placeholder="69.240562" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Yetkazib berish sozlamalari" icon={<Truck className="w-[18px] h-[18px]" />} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Minimal buyurtma"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.minOrderAmount}
                disabled={ro}
                onChange={(e) => set('minOrderAmount', e.target.value)}
                hint={ro ? undefined : "so'm"}
              />
              <Input
                label="Yetkazish narxi"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.deliveryFee}
                disabled={ro}
                onChange={(e) => set('deliveryFee', e.target.value)}
                hint={ro ? undefined : "so'm"}
              />
              <Input
                label="Tekin yetkazish chegarasi"
                type="number"
                inputMode="numeric"
                min={0}
                value={form.freeDeliveryThreshold}
                disabled={ro}
                onChange={(e) => set('freeDeliveryThreshold', e.target.value)}
                hint={ro ? undefined : "0 — o'chirilgan"}
              />
            </div>
            {ro && (
              <p className="text-[13px] text-muted mt-3">
                {Number(form.freeDeliveryThreshold) > 0
                  ? `${formatMoney(form.freeDeliveryThreshold)} dan yuqori buyurtmalar uchun yetkazish bepul.`
                  : 'Tekin yetkazish yoqilmagan.'}
              </p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Ish vaqti"
              subtitle={ro ? summarizeHours(form.hours) || undefined : undefined}
              icon={<Clock className="w-[18px] h-[18px]" />}
            />
            <WorkingHoursEditor value={form.hours} onChange={(h) => set('hours', h)} disabled={ro} />
            {errors.hours && <p className="mt-2 text-[12px] font-medium text-danger-ink">{errors.hours}</p>}
          </Card>

          <Card>
            <SettingRow
              className="py-0"
              title="Buyurtma qabul qilish"
              description={form.isOpen ? 'Muassasa ochiq — mijozlar buyurtma bera oladi' : 'Muassasa yopiq'}
              control={<Switch checked={form.isOpen} disabled={ro} onChange={(v) => set('isOpen', v)} label="Muassasa holati" />}
            />
          </Card>

          <Card>
            <CardHeader title="Hisob" />
            <dl className="divide-y divide-edge text-[14px]">
              <div className="flex justify-between gap-3 py-2.5">
                <dt className="text-muted">Turi</dt>
                <dd className="font-semibold">{typeLabel}</dd>
              </div>
              {profile?.id != null && (
                <div className="flex justify-between gap-3 py-2.5">
                  <dt className="text-muted">ID</dt>
                  <dd className="font-semibold tabular-nums">{profile.id}</dd>
                </div>
              )}
              {profile?.uuid && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <dt className="text-muted shrink-0">UUID</dt>
                  <dd className="flex items-center gap-1 min-w-0">
                    <span className="font-mono text-[12px] truncate">{profile.uuid}</span>
                    <button
                      type="button"
                      onClick={copyUuid}
                      aria-label="Nusxalash"
                      className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-muted hover:bg-field cursor-pointer"
                    >
                      {copied ? <Check className="w-4 h-4 text-brand" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>

      {editing && (
        <MobileActionBar className="md:hidden">
          <Button variant="secondary" size="lg" onClick={cancel} disabled={saving} className="flex-1">
            Bekor qilish
          </Button>
          <Button type="submit" size="lg" loading={saving} className="flex-[2]">
            Saqlash
          </Button>
        </MobileActionBar>
      )}
    </form>
  );
};

export default ProfilePage;
