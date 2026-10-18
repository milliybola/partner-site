import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, IconButton, InlineAlert, Input, Select, Sheet, SettingRow, Switch } from '../../../core/ui';
import { cleanPhone, maskPhoneInput } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { staffApi } from '../services/staffApi';
import type { StaffMember, UpdateStaffPayload } from '../services/staffApi';
import type { PartnerFilial } from '../../orders/services/filialApi';

export const ROLE_LABEL: Record<string, string> = { manager: 'Menejer', waiter: 'Ofitsant' };

export const StaffFormSheet: React.FC<{
  open: boolean;
  staff: StaffMember | null;
  filials: PartnerFilial[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, staff, filials, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'manager' | 'waiter'>('waiter');
  const [isActive, setIsActive] = useState(true);
  const [homeFilial, setHomeFilial] = useState('');
  const [currentFilial, setCurrentFilial] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(staff?.name || '');
    setPhone(maskPhoneInput(staff?.phone || ''));
    setPassword('');
    setShowPassword(false);
    setRole(staff?.role || 'waiter');
    setIsActive(staff?.is_active ?? true);
    setHomeFilial(staff?.home_filial?.uuid || '');
    setCurrentFilial(staff?.current_filial?.uuid || '');
    setErrors({});
    setFormError(null);
  }, [open, staff]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = cleanPhone(phone);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Ismni kiriting';
    if (raw.length !== 13) next.phone = "Format: +998 (90) 123-45-67";
    if (!staff && password.length < 4) next.password = "Kamida 4 ta belgi";
    if (staff && password && password.length < 4) next.password = "Kamida 4 ta belgi yoki bo'sh qoldiring";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    setFormError(null);
    try {
      const payload: UpdateStaffPayload = {
        name: name.trim(),
        phone: raw,
        role,
        is_active: isActive,
        home_filial_uuid: homeFilial || undefined,
        current_filial_uuid: currentFilial || undefined,
      };
      if (staff) {
        if (password) payload.password = password;
        await staffApi.updateStaff(staff.uuid, payload);
      } else {
        await staffApi.createStaff({ ...payload, name: name.trim(), phone: raw, role, password });
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
      title={staff ? 'Xodimni tahrirlash' : "Yangi xodim"}
      subtitle="Menejer va ofitsantlar telefon raqami va parol bilan kiradi"
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving} className="w-full md:w-auto">Bekor qilish</Button>
          <Button type="submit" form="staff-form" size="lg" loading={saving} className="w-full md:w-auto">Saqlash</Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <Input label="Ism" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Bobur Karimov" error={errors.name} autoComplete="off" />
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
          required={!staff}
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={staff ? "O'zgartirmaslik uchun bo'sh qoldiring" : 'Kamida 4 ta belgi'}
          error={errors.password}
          autoComplete="new-password"
          rightSlot={
            <IconButton label={showPassword ? 'Yashirish' : "Ko'rsatish"} size="sm" onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </IconButton>
          }
        />
        <Select label="Rol" value={role} onChange={(e) => setRole(e.target.value as 'manager' | 'waiter')}>
          <option value="waiter">Ofitsant</option>
          <option value="manager">Menejer</option>
        </Select>
        {filials.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Asosiy filial" value={homeFilial} onChange={(e) => setHomeFilial(e.target.value)}>
              <option value="">Tanlanmagan</option>
              {filials.map((f) => (
                <option key={f.uuid} value={f.uuid}>{f.filial_name}{f.is_main ? ' (Asosiy)' : ''}</option>
              ))}
            </Select>
            <Select label="Hozirgi filial" value={currentFilial} onChange={(e) => setCurrentFilial(e.target.value)}>
              <option value="">Tanlanmagan</option>
              {filials.map((f) => (
                <option key={f.uuid} value={f.uuid}>{f.filial_name}{f.is_main ? ' (Asosiy)' : ''}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="rounded-2xl bg-field px-4">
          <SettingRow
            title="Faol hisob"
            description={isActive ? 'Xodim tizimga kira oladi' : 'Hisob bloklangan'}
            control={<Switch checked={isActive} onChange={setIsActive} label="Faol hisob" />}
          />
        </div>
      </form>
    </Sheet>
  );
};
