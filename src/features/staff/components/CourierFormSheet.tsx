import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, IconButton, InlineAlert, Input, Select, Sheet, SettingRow, Switch } from '../../../core/ui';
import { cleanPhone, maskPhoneInput } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { couriersApi } from '../services/couriersApi';
import type { CourierModel, UpdateCourierPayload } from '../services/couriersApi';
import type { PartnerFilial } from '../../orders/services/filialApi';

export const TRANSPORT_LABEL: Record<string, string> = {
  car: 'Avtomobil',
  motorcycle: 'Mototsikl',
  bicycle: 'Velosiped',
  on_foot: 'Piyoda',
};

export const CourierFormSheet: React.FC<{
  open: boolean;
  courier: CourierModel | null;
  filials: PartnerFilial[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, courier, filials, onClose, onSaved }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [telegramId, setTelegramId] = useState('');
  const [transport, setTransport] = useState('car');
  const [brand, setBrand] = useState('');
  const [plate, setPlate] = useState('');
  const [filial, setFilial] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirstName(courier?.first_name || '');
    setLastName(courier?.last_name || '');
    // BUGFIX: the old mask wiped numbers stored without a leading "+" (e.g. "998901234567").
    setPhone(maskPhoneInput(courier?.phone || ''));
    setPassword('');
    setShowPassword(false);
    setTelegramId(courier?.telegram_id || '');
    setTransport(courier?.vehicle_info?.transport_type || 'car');
    setBrand(courier?.vehicle_info?.brand || '');
    setPlate(courier?.vehicle_info?.license_plate || '');
    setFilial(courier?.filial_uuid || '');
    setIsActive(courier?.is_active ?? true);
    setErrors({});
    setFormError(null);
  }, [open, courier]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cleanPhone(phone);
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Ismni kiriting';
    if (!lastName.trim()) next.lastName = 'Familiyani kiriting';
    if (raw.length !== 13) next.phone = 'Format: +998 (90) 123-45-67';
    if (!courier && password.length < 4) next.password = 'Kamida 4 ta belgi';
    if (courier && password && password.length < 4) next.password = "Kamida 4 ta belgi yoki bo'sh qoldiring";
    if (telegramId && !/^\d+$/.test(telegramId.trim())) next.telegramId = 'Faqat raqamlar';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload: UpdateCourierPayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: raw,
        telegram_id: telegramId.trim() || undefined,
        // service_types is not editable in the UI; keep the existing value or the backend default.
        service_types: courier?.service_types || 'food_delivery',
        transport_type: transport || undefined,
        vehicle_brand: brand.trim() || undefined,
        license_plate: plate.trim() || undefined,
        filial_uuid: filial || undefined,
        is_active: isActive,
      };
      if (courier) {
        if (password) payload.password = password;
        await couriersApi.updateCourier(courier.uuid, payload);
      } else {
        await couriersApi.createCourier({
          ...payload,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: raw,
          password,
        });
      }
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err, "Saqlab bo'lmadi. Telefon raqami band emasligini tekshiring."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      persistent={saving}
      title={courier ? 'Kuryerni tahrirlash' : 'Yangi kuryer'}
      subtitle="O'z kuryerlaringiz buyurtmalarni to'g'ridan-to'g'ri oladi"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="w-full md:w-auto">Bekor qilish</Button>
          <Button type="submit" form="courier-form" size="lg" loading={saving} className="w-full md:w-auto">Saqlash</Button>
        </>
      }
    >
      <form id="courier-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Ism" required value={firstName} onChange={(e) => setFirstName(e.target.value)} error={errors.firstName} placeholder="Elbek" />
          <Input label="Familiya" required value={lastName} onChange={(e) => setLastName(e.target.value)} error={errors.lastName} placeholder="Narzullayev" />
        </div>
        <Input
          label="Telefon (login)"
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
          placeholder="+998 (90) 123-45-67"
          error={errors.phone}
        />
        <Input
          label="Parol"
          required={!courier}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={courier ? "O'zgartirmaslik uchun bo'sh qoldiring" : 'Kamida 4 ta belgi'}
          error={errors.password}
          autoComplete="new-password"
          rightSlot={
            <IconButton label={showPassword ? 'Yashirish' : "Ko'rsatish"} size="sm" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </IconButton>
          }
        />
        <Input
          label="Telegram ID"
          inputMode="numeric"
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value)}
          placeholder="Masalan: 987654321"
          error={errors.telegramId}
          hint="Bildirishnomalar uchun (ixtiyoriy)"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Transport" value={transport} onChange={(e) => setTransport(e.target.value)}>
            {Object.entries(TRANSPORT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input label="Rusumi" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Chevrolet Spark" />
          <Input label="Davlat raqami" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="01 A 123 BC" />
        </div>
        {filials.length > 0 && (
          <Select label="Filial" value={filial} onChange={(e) => setFilial(e.target.value)}>
            <option value="">Tanlanmagan</option>
            {filials.map((f) => (
              <option key={f.uuid} value={f.uuid}>{f.filial_name}{f.is_main ? ' (Asosiy)' : ''}</option>
            ))}
          </Select>
        )}
        <div className="rounded-2xl bg-field px-4">
          <SettingRow
            title="Faol hisob"
            description={isActive ? 'Kuryer buyurtma qabul qila oladi' : 'Hisob bloklangan'}
            control={<Switch checked={isActive} onChange={setIsActive} label="Faol hisob" />}
          />
        </div>
      </form>
    </Sheet>
  );
};
