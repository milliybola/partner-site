import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Grid,
  DollarSign,
  User,
  LogOut,
  Menu,
  X,
  PlusCircle,
  Settings,
  Users,
  Clock,
  Table,
  Building2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { STORAGE_KEYS } from '../config/constants';
import { filialApi } from '../../features/orders/services/filialApi';
import type { PartnerFilial } from '../../features/orders/services/filialApi';
import apiClient from '../api/client';
import { useToast } from './ToastProvider';

const Layout: React.FC = () => {
  const toast = useToast();
  const [partner, setPartner] = useState<any>(() => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  });
  const [isOpen, setIsOpen] = useState(() => partner?.is_open ?? false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('milliygo_theme') as 'light' | 'dark') || 'dark');
  const [time, setTime] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const navigate = useNavigate();
  const location = useLocation();

  const toggleSidebar = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem('sidebar_collapsed', String(newVal));
  };

  const [filials, setFilials] = useState<PartnerFilial[]>([]);

  useEffect(() => {
    if (partner?.role === 'manager') {
      filialApi.getFilials()
        .then(data => setFilials(data))
        .catch(err => console.error("Failed to load filials for switcher:", err));
    }
  }, [partner?.role]);

  const handleSwitchFilial = async (filialUuid: string) => {
    const staffUuid = partner?.staff_uuid || partner?.uuid;
    if (!staffUuid) {
      toast.error("Xodim identifikatori topilmadi.");
      return;
    }
    try {
      await filialApi.switchFilial(staffUuid, filialUuid);

      // Re-fetch staff profile to update local storage partner_data
      const profileResponse = await apiClient.get('partner/staff/me/');
      const staff = profileResponse.data?.data || profileResponse.data;
      const updatedPartner = {
        ...staff,
        staff_uuid: staff?.uuid,
        uuid: staff?.partner_uuid,
        is_open: true,
      };
      localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(updatedPartner));
      window.location.reload();
    } catch (err) {
      console.error("Failed to switch branch:", err);
      toast.error("Filialni almashtirishda xatolik yuz berdi.");
    }
  };

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('uz-UZ', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      localStorage.setItem('milliygo_theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('milliygo_theme', 'dark');
    }
  }, [theme]);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      const parsed = JSON.parse(data);
      setPartner(parsed);
      setIsOpen(parsed.is_open ?? false);
    }
  }, []);

  const handleToggleOpenStatus = () => {
    if (partner?.role === 'manager') return; // Managers cannot toggle status
    const updated = { ...partner, is_open: !isOpen };
    setPartner(updated);
    setIsOpen(!isOpen);
    localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(updated));
    // In a real application, you would make an API call here: apiClient.put(ENDPOINTS.PROFILE.ME, { is_open: !isOpen })
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.PARTNER_DATA);
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Dashbord', icon: LayoutDashboard },
    { to: '/orders', label: 'Karban', icon: ShoppingBag },
    { to: '/new-order', label: 'Yangi buyurtma', icon: PlusCircle },
    { to: '/tables', label: 'Stollar', icon: Table },
    { to: '/shift', label: 'Smena', icon: Clock },
    { to: '/catalog', label: 'Katalog', icon: Grid },
    ...(partner?.role === 'manager' ? [] : [{ to: '/branches', label: 'Filiallar', icon: Building2 }]),
    ...(partner?.role === 'manager' ? [] : [{ to: '/finance', label: 'Moliya', icon: DollarSign }]),
    { to: '/all-orders', label: 'Barcha buyurtmalar', icon: ShoppingBag },
    { to: '/staff', label: 'Xodimlar', icon: Users },
    { to: '/profile', label: 'Profil', icon: User },
    { to: '/settings', label: 'Sozlamalar', icon: Settings },
  ];

  const desktopNavItems = navItems.filter(item => item.to !== '/new-order');

  return (
    <div className="h-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col md:flex-row font-Outfit">
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-darkCard border-b border-edge sticky top-0 z-40">
        <div className="flex items-center gap-2 overflow-hidden">
          {partner?.logo ? (
            <img src={partner.logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white">M</div>
          )}
          <span className="font-semibold text-ink truncate max-w-[100px]">
            {partner?.role === 'manager' ? partner.partner_name : partner?.name || 'MilliyGo'}
          </span>
          {time && (
            <span className="text-[10px] font-bold text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-lg font-mono">
              {time}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleOpenStatus}
            disabled={partner?.role === 'manager'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${partner?.role === 'manager' ? 'cursor-default opacity-80' : 'cursor-pointer'
              } ${isOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span>{isOpen ? 'Ochiq' : 'Yopiq'}</span>
          </button>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-400 hover:text-ink">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col h-full bg-darkCard border-r border-edge shrink-0 transition-all duration-300 overflow-y-auto ${isCollapsed ? 'w-20' : 'w-64'}`}>
        {/* Profile info in Sidebar */}
        <div className={`p-4 border-b border-edge flex flex-col gap-3 ${isCollapsed ? 'items-center' : ''}`}>
          <div className="flex items-center justify-between w-full">
            {!isCollapsed && (
              <div className="flex items-center gap-3 truncate">
                {partner?.logo ? (
                  <img src={partner.logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-edge-strong" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white text-sm">M</div>
                )}
                <div className="truncate">
                  <h3 className="font-semibold text-ink text-sm truncate">
                    {partner?.role === 'manager' ? partner.partner_name : partner?.name || 'Restaurant'}
                  </h3>
                </div>
              </div>
            )}
            {/* {isCollapsed && (
              <div className="mx-auto">
                {partner?.logo ? (
                  <img src={partner.logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-edge-strong" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white text-sm">M</div>
                )}
              </div>
            )} */}
            <button
              onClick={toggleSidebar}
              className={`p-1.5 rounded-lg bg-slate-900 border border-edge hover:border-edge-strong text-slate-400 hover:text-ink transition cursor-pointer ${isCollapsed ? 'mt-2' : ''}`}
              title={isCollapsed ? "Yoyish" : "Yig'ish"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* {!isCollapsed && partner?.role === 'manager' && (
            <div className="mt-1 space-y-1.5 text-left border-t border-edge pt-3 w-full">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Joriy filial:</span>
              <div className="relative">
                <select
                  value={partner?.current_filial?.uuid || ''}
                  onChange={(e) => handleSwitchFilial(e.target.value)}
                  className="w-full bg-slate-900 border border-edge hover:border-edge-strong rounded-xl px-3 py-2 text-xs font-bold text-brand focus:outline-none transition cursor-pointer"
                >
                  <option value="" disabled>-- Filial tanlang --</option>
                  {filials.map(filial => (
                    <option key={filial.uuid} value={filial.uuid}>
                      {filial.filial_name} {filial.is_main ? "(Asosiy)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )} */}
        </div>

        {/* Sidebar Nav Items */}
        <nav className={`flex-1 px-4 py-6 space-y-1 ${isCollapsed ? 'flex flex-col items-center px-2' : ''}`}>
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${isCollapsed ? 'p-3 justify-center w-12 h-12' : 'px-4 py-3 w-full'
                  } ${isActive
                    ? 'bg-brand text-white shadow-lg shadow-brand/15 font-semibold'
                    : 'text-slate-400 hover:bg-overlay hover:text-slate-200'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Theme Toggle & Footer logout */}
        <div className="border-t border-edge flex flex-col">
          {/* Theme Toggle Switch */}
          <div className={`p-4 pb-2 ${isCollapsed ? 'flex justify-center px-2' : ''}`}>
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={isCollapsed ? (theme === 'light' ? "Kunduzgi rejim" : "Tungi rejim") : undefined}
              className={`flex items-center transition cursor-pointer ${isCollapsed
                ? 'justify-center w-12 h-12 rounded-xl bg-slate-900 border border-edge text-slate-400 hover:text-ink hover:border-edge-strong'
                : 'justify-between w-full px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-overlay hover:text-slate-200 border border-edge'
                }`}
            >
              {isCollapsed ? (
                theme === 'light' ? (
                  <svg className="w-5 h-5 text-amber-500 animate-spin-slow shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )
              ) : (
                <>
                  <span className="flex items-center gap-2">
                    {theme === 'light' ? (
                      <>
                        <svg className="w-4.5 h-4.5 text-amber-500 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                        </svg>
                        <span>Kunduzgi rejim</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        <span>Tungi rejim</span>
                      </>
                    )}
                  </span>

                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${theme === 'light' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'
                    }`}>
                    {theme === 'light' ? 'LIGHT' : 'DARK'}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className={`p-4 pt-0 ${isCollapsed ? 'flex justify-center px-2' : ''}`}>
            <button
              onClick={handleLogout}
              title={isCollapsed ? "Chiqish" : undefined}
              className={`flex items-center gap-3 transition cursor-pointer ${isCollapsed
                ? 'justify-center w-12 h-12 rounded-xl text-rose-400 hover:bg-rose-500/10'
                : 'w-full px-4 py-3 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
                }`}
            >
              <LogOut className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>Chiqish</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-darkBg/95 backdrop-blur-md flex flex-col pt-16 animate-fade-in overflow-y-auto">
          <nav className="flex-1 px-6 py-8 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-5 py-4 rounded-xl text-base font-semibold transition ${isActive
                      ? 'bg-brand text-white shadow-lg'
                      : 'text-slate-300 hover:bg-overlay'
                    }`
                  }
                >
                  <Icon className="w-6 h-6" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="p-6 border-t border-edge bg-darkCard/50 flex flex-col gap-4">
            {/* Branch Switcher for Staff/Manager (Mobile) */}
            {partner?.role === 'manager' && (
              <div className="space-y-2 text-left">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Joriy filialni o'zgartirish:</span>
                <select
                  value={partner?.current_filial?.uuid || ''}
                  onChange={(e) => handleSwitchFilial(e.target.value)}
                  className="w-full bg-slate-900 border border-edge-strong rounded-xl px-4 py-3 text-sm font-bold text-brand focus:outline-none transition cursor-pointer"
                >
                  <option value="" disabled>-- Filial tanlang --</option>
                  {filials.map(filial => (
                    <option key={filial.uuid} value={filial.uuid}>
                      {filial.filial_name} {filial.is_main ? "(Asosiy)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Mobile Theme Toggle Button */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-between w-full px-5 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:bg-overlay hover:text-slate-200 transition cursor-pointer border border-edge"
            >
              <span className="flex items-center gap-2">
                {theme === 'light' ? (
                  <>
                    <svg className="w-5 h-5 text-amber-500 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 9H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                    <span>Kunduzgi rejim</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span>Tungi rejim</span>
                  </>
                )}
              </span>

              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${theme === 'light' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'
                }`}>
                {theme === 'light' ? 'LIGHT' : 'DARK'}
              </span>
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleLogout();
              }}
              className="flex items-center gap-4 w-full px-5 py-4 rounded-xl text-base font-semibold text-rose-400 hover:bg-rose-500/10 transition"
            >
              <LogOut className="w-6 h-6" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto h-full">
        {/* Desktop Top Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-darkCard/30 border-b border-edge backdrop-blur-md sticky top-0 z-40 shadow-sm shadow-black/5">
          <div className="flex items-center gap-4">
            {isCollapsed && (
              <div className="mx-auto">
                {partner?.logo ? (
                  <div className="flex items-center gap-2">
                    <img src={partner.logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover border border-edge-strong" />
                    <h3 className="font-semibold text-ink text-sm truncate">
                      {partner?.role === 'manager' ? partner.partner_name : partner?.name || 'Restaurant'}
                    </h3>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white text-sm">M</div>
                )}
              </div>
            )}
            {time && (
              <span className="text-xs font-bold text-brand bg-brand/10 border border-brand/20 px-3 py-1 rounded-xl font-mono">
                {time}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Store Status Toggle */}
            <button
              onClick={handleToggleOpenStatus}
              disabled={partner?.role === 'manager'}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition ${partner?.role === 'manager' ? 'cursor-default opacity-85' : 'cursor-pointer'
                } ${isOpen
                  ? `bg-emerald-500/10 text-emerald-400 border-emerald-500/20${partner?.role === 'manager' ? '' : ' hover:bg-emerald-500/20'}`
                  : `bg-rose-500/10 text-rose-400 border-rose-500/20${partner?.role === 'manager' ? '' : ' hover:bg-rose-500/20'}`
                }`}
            >
              <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>Muassasa: {isOpen ? 'OCHIQ' : 'YOPIQ'}</span>
            </button>

            {/* "+ Yangi buyurtma" Button (hidden on /new-order page) */}
            {location.pathname !== '/new-order' && (
              <NavLink
                to="/new-order"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand to-sky-500 text-ink font-bold text-sm shadow-lg shadow-brand/10 hover:shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Yangi buyurtma</span>
              </NavLink>
            )}
          </div>
        </header>

        <div className="flex-1 p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
