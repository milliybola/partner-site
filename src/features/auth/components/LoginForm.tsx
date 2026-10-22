import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Phone } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS, STORAGE_KEYS } from '../../../core/config/constants';
import { Button, InlineAlert, Input } from '../../../core/ui';
import { cleanPhone, maskPhoneInput } from '../../../core/lib/format';
import { getErrorMessage } from '../../../core/lib/errors';
import { clearSession, setPartner } from '../../../core/lib/session';
import type { PartnerSession } from '../../../core/lib/session';
import { clearTariffCache } from '../../../core/lib/tariff';

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ phone?: string; password?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rawPhone = cleanPhone(phone);
    const fe: typeof fieldErr = {};
    if (rawPhone.length !== 13) fe.phone = "Telefon raqamini to'liq kiriting: +998 (90) 123-45-67";
    if (password.length < 4) fe.password = "Parol kamida 4 ta belgidan iborat bo'lishi kerak";
    setFieldErr(fe);
    if (Object.keys(fe).length) return;

    setLoading(true);
    try {
      // Unified login: backend detects owner (partner) vs staff (manager/waiter).
      const res = await apiClient.post(ENDPOINTS.AUTH.LOGIN, { phone: rawPhone, password });
      const data = res.data?.data || res.data || {};
      const { user_type, dashboard, tokens, profile } = data;

      if (!tokens?.access) throw new Error("Server javobida token yo'q. Qaytadan urinib ko'ring.");

      if (dashboard === 'waiter') {
        setError('Ofitsiantlar bu panelga kira olmaydi. Iltimos, ofitsiant ilovasidan foydalaning.');
        return;
      }

      clearSession();
      clearTariffCache(); // boshqa hamkor kirgan bo'lishi mumkin — tarif qayta yuklanadi
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access);
      if (tokens.refresh) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh);

      const partnerData: PartnerSession =
        user_type === 'partner'
          ? { ...profile, role: 'superadmin' }
          : {
              ...profile,
              role: 'manager',
              staff_uuid: profile?.uuid,
              uuid: profile?.partner_uuid,
              current_filial: profile?.filial_uuid ? { uuid: profile.filial_uuid, filial_name: profile.filial_name } : profile?.current_filial,
            };
      // NOTE: `is_open` used to be forced to true for managers here, so the
      // header always said "Ochiq" regardless of the real state. We now keep
      // whatever the backend sent (undefined => shown as unknown/closed).
      setPartner(partnerData);

      navigate(dashboard === 'superadmin' || user_type === 'partner' ? '/' : '/orders', { replace: true });
    } catch (err: any) {
      const status = err?.response?.status;
      setError(
        status === 401 || status === 400
          ? getErrorMessage(err, "Telefon raqami yoki parol noto'g'ri.")
          : getErrorMessage(err, "Tizimga kirishda xatolik yuz berdi."),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      <div className="text-center mb-8">
        <img src="./logo.png" alt="MilliyGo" className="w-20 h-20 mx-auto mb-4 rounded-2xl" />
        <h1 className="text-[28px] font-black tracking-tightest text-ink">MilliyGo Hamkor</h1>
        <p className="text-[15px] text-muted mt-1">Restoran va do'konlar uchun boshqaruv paneli</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="bg-surface border border-edge rounded-3xl p-5 sm:p-6 space-y-4 shadow-card">
        {error && <InlineAlert>{error}</InlineAlert>}

        <Input
          label="Telefon raqam"
          type="tel"
          inputMode="tel"
          autoComplete="username"
          leftIcon={<Phone className="w-4 h-4" />}
          value={phone}
          onChange={(e) => {
            setPhone(maskPhoneInput(e.target.value));
            if (fieldErr.phone) setFieldErr((f) => ({ ...f, phone: undefined }));
          }}
          placeholder="+998 (90) 123-45-67"
          disabled={loading}
          error={fieldErr.phone}
          autoFocus
        />

        <Input
          label="Parol"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          leftIcon={<Lock className="w-4 h-4" />}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErr.password) setFieldErr((f) => ({ ...f, password: undefined }));
          }}
          placeholder="Parolingiz"
          disabled={loading}
          error={fieldErr.password}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Parolni yashirish' : "Parolni ko'rsatish"}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted hover:text-ink cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          }
        />

        <Button type="submit" block loading={loading} className="h-[52px] rounded-2xl text-[16px]">
          Kirish
        </Button>
      </form>

      <p className="text-center text-[13px] text-muted mt-6">
        Kirish ma'lumotlarini unutdingizmi? MilliyGo hamkorlar bo'limiga murojaat qiling.
      </p>
    </div>
  );
};

export default LoginForm;
