import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Phone, AlertCircle, Eye, EyeOff } from 'lucide-react';
import apiClient from '../../../core/api/client';
import { ENDPOINTS, STORAGE_KEYS } from '../../../core/config/constants';

const LoginForm: React.FC = () => {
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
      // 1. Authenticate API call
      const loginResponse = await apiClient.post(ENDPOINTS.AUTH.LOGIN, {
        phone: rawPhone,
        password: password,
      });

      const { tokens } = loginResponse.data;
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh);

      // 2. Fetch profile data
      const meResponse = await apiClient.get(ENDPOINTS.AUTH.ME);
      localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(meResponse.data.data));

      setLoading(false);
      navigate('/');
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
      <div className="text-center mb-8">
        <img src="/logo.png" alt="Logo" className="w-24 h-24 mx-auto mb-4" />
        <h2 className="text-3xl font-bold tracking-tight text-white mb-2">MilliyGo</h2>
        <p className="text-slate-400">Hamkorlar boshqaruv paneliga xush kelibsiz</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
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
