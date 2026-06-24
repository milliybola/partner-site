import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, AlertCircle, Eye, EyeOff } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS, STORAGE_KEYS } from '../../../core/config/constants';

const LoginForm: React.FC = () => {
  const [loginType, setLoginType] = useState<'partner' | 'staff'>('partner');
  const [phone, setPhone] = useState('+998');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  // Simple formatting for Uzbek phone numbers: +998 (XX) XXX-XX-XX
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('+998')) {
      val = '+998';
    }
    // Limit length to +998 followed by 9 digits
    const numbersOnly = val.substring(4).replace(/\D/g, '');
    const truncated = numbersOnly.substring(0, 9);
    
    // Format presentation
    let formatted = '+998';
    if (truncated.length > 0) {
      formatted += ' (' + truncated.substring(0, 2);
    }
    if (truncated.length > 2) {
      formatted += ') ' + truncated.substring(2, 5);
    }
    if (truncated.length > 5) {
      formatted += '-' + truncated.substring(5, 7);
    }
    if (truncated.length > 7) {
      formatted += '-' + truncated.substring(7, 9);
    }
    
    setPhone(formatted);
  };

  const cleanPhoneNumber = (formattedPhone: string) => {
    return formattedPhone.replace(/[^\d+]/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const rawPhone = cleanPhoneNumber(phone);
    if (rawPhone.length !== 13) {
      setError("Telefon raqami noto'g'ri shakllantirilgan. Misol: +998 (90) 123-45-67");
      setLoading(false);
      return;
    }

    if (password.length < 4) {
      setError("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
      setLoading(false);
      return;
    }

    try {
      if (loginType === 'partner') {
        // 1. Authenticate API call
        const loginResponse = await apiClient.post(ENDPOINTS.AUTH.LOGIN, {
          phone: rawPhone,
          password: password,
        });

        console.log("Partner Login Response Raw:", loginResponse.data);

        const tokens = loginResponse.data?.tokens || loginResponse.data?.data?.tokens;

        if (!tokens || !tokens.access) {
          throw new Error("Tokenlar topilmadi. Login javobini tekshiring.");
        }

        console.log("Setting localStorage milliygo_access_token to:", tokens.access);
        console.log("Setting localStorage milliygo_refresh_token to:", tokens.refresh);
        
        localStorage.setItem('milliygo_access_token', tokens.access);
        localStorage.setItem('milliygo_refresh_token', tokens.refresh);

        // 2. Fetch profile data
        const meResponse = await apiClient.get(ENDPOINTS.AUTH.ME);
        const profileData = meResponse.data?.data || meResponse.data;
        console.log("Partner Profile Data:", profileData);
        localStorage.setItem('milliygo_partner_data', JSON.stringify(profileData));
      } else {
        // 1. Authenticate Staff API call
        const loginResponse = await apiClient.post(ENDPOINTS.STAFF.LOGIN, {
          phone: rawPhone,
          password: password,
        });

        console.log("Staff Login Response Raw:", loginResponse.data);

        const tokens = loginResponse.data?.tokens || loginResponse.data?.data?.tokens;
        const staff = loginResponse.data?.staff || loginResponse.data?.data?.staff;

        if (!tokens || !tokens.access) {
          throw new Error("Xodim tokenlari topilmadi. Login javobini tekshiring.");
        }

        // Check if role is waiter - waiters are restricted
        if (staff && staff.role === 'waiter') {
          setError("Ofitsiantlar ushbu tizimga kira olmaydi. Iltimos, ofitsant ilovasidan foydalaning.");
          setLoading(false);
          return;
        }

        console.log("Setting localStorage milliygo_access_token (Staff) to:", tokens.access);
        console.log("Setting localStorage milliygo_refresh_token (Staff) to:", tokens.refresh);

        localStorage.setItem('milliygo_access_token', tokens.access);
        localStorage.setItem('milliygo_refresh_token', tokens.refresh);

        // Map staff data directly from login response to expected partner data fields
        const partnerData = {
          ...staff,
          uuid: staff?.partner_uuid, // Ensure partner uuid is set correctly
          is_open: true, // Default to true
        };
        
        console.log("Setting localStorage milliygo_partner_data (Staff) to:", partnerData);
        localStorage.setItem('milliygo_partner_data', JSON.stringify(partnerData));
      }

      setLoading(false);
      if (loginType === 'staff') {
        navigate('/orders');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.message || 
        err.response?.data?.detail || 
        "Tizimga kirishda xatolik yuz berdi. Iltimos parolni yoki telefon raqamini tekshiring."
      );
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl bg-darkCard backdrop-blur-xl border border-white/10 shadow-2xl transition-all duration-300">
      <div className="text-center mb-6">
        <img src="/logo.png" alt="Logo" className="w-24 h-24 mx-auto mb-4" />
        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">MilliyGo</h2>
        <p className="text-slate-400">Hamkorlar boshqaruv paneliga xush kelibsiz</p>
      </div>

      {/* Login Type Switch */}
      <div className="flex bg-slate-950/60 p-1.5 rounded-xl border border-white/5 mb-6">
        <button
          type="button"
          onClick={() => {
            setLoginType('partner');
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
            loginType === 'partner'
              ? 'bg-brand text-white shadow-md shadow-brand/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Restoran (Superadmin)
        </button>
        <button
          type="button"
          onClick={() => {
            setLoginType('staff');
            setError(null);
          }}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
            loginType === 'staff'
              ? 'bg-brand text-white shadow-md shadow-brand/10'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Xodim (Menejer)
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Telefon raqam</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
              <Phone className="w-5 h-5" />
            </span>
            <input
              type="text"
              value={phone}
              onChange={handlePhoneChange}
              className="block w-full pl-11 pr-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              placeholder="+998 (90) 123-45-67"
              disabled={loading}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 font-Outfit">Parol</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
              <Lock className="w-5 h-5" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full pl-11 pr-12 py-3 rounded-xl bg-slate-900 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
              placeholder="••••••••"
              disabled={loading}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition"
              disabled={loading}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>



        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium shadow-lg hover:shadow-brand/20 transition duration-150 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            "Kirish"
          )}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
