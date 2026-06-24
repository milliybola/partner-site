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
  Radio,
  PlusCircle,
  Settings,
  Users
} from 'lucide-react';
import { STORAGE_KEYS } from '../config/constants';

const Layout: React.FC = () => {
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
  const navigate = useNavigate();
  const location = useLocation();

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
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
      localStorage.setItem('milliygo_theme', 'light');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
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
    { to: '/catalog', label: 'Katalog', icon: Grid },
    ...(partner?.role === 'manager' ? [] : [{ to: '/finance', label: 'Moliya', icon: DollarSign }]),
    { to: '/all-orders', label: 'Barcha buyurtmalar', icon: ShoppingBag },
    { to: '/staff', label: 'Xodimlar', icon: Users },
    { to: '/profile', label: 'Profil', icon: User },
    { to: '/settings', label: 'Sozlamalar', icon: Settings },
  ];

  const desktopNavItems = navItems.filter(item => item.to !== '/new-order');

  return (
    <div className="h-screen overflow-hidden bg-darkBg text-slate-100 flex flex-col md:flex-row font-Outfit">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-darkCard border-b border-white/5 sticky top-0 z-40">
        <div className="flex items-center gap-2 overflow-hidden">
          {partner?.logo ? (
            <img src={partner.logo} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center font-bold text-white">M</div>
          )}
          <span className="font-semibold text-white truncate max-w-[100px]">
            {partner?.role === 'manager' ? partner.partner_name : partner?.name || 'MilliyGo'}
          </span>
          {time && (
            <span className="text-[10px] font-bold text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-lg font-mono">
              {time}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Active status indicator */}
          <button
            onClick={handleToggleOpenStatus}
            disabled={partner?.role === 'manager'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
              partner?.role === 'manager' ? 'cursor-default opacity-80' : 'cursor-pointer'
            } ${
              isOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            <span>{isOpen ? 'Ochiq' : 'Yopiq'}</span>
          </button>
          
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-slate-400 hover:text-white">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex flex-col w-64 bg-darkCard border-r border-white/5 shrink-0 transition-all duration-300`}>
        {/* Profile info in Sidebar */}
        <div className="p-6 border-b border-white/5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {partner?.logo ? (
              <img src={partner.logo} alt="Logo" className="w-12 h-12 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center font-bold text-white text-xl">M</div>
            )}
            <div className="truncate">
              <h3 className="font-semibold text-white truncate">
                {partner?.role === 'manager' ? partner.partner_name : partner?.name || 'Restaurant'}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {partner?.role === 'manager' ? `Menejer: ${partner.name}` : partner?.address || 'Manzil yo\'q'}
              </p>
            </div>
          </div>

          {/* Active switch */}
          <div className="mt-2 flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-white/5">
            <span className="text-xs font-medium text-slate-400">Muassasa holati:</span>
            <button
              onClick={handleToggleOpenStatus}
              disabled={partner?.role === 'manager'}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition ${
                partner?.role === 'manager' ? 'cursor-default opacity-80' : 'cursor-pointer hover:bg-white/5'
              } ${
                isOpen ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isOpen ? 'animate-pulse text-emerald-400' : 'text-rose-400'}`} />
              {isOpen ? "OCHIQ" : "YOPIQ"}
            </button>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-brand text-white shadow-lg shadow-brand/15 font-semibold'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Theme Toggle & Footer logout */}
        <div className="border-t border-white/5 flex flex-col">
          {/* Theme Toggle Switch */}
          <div className="p-4 pb-2">
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200 transition cursor-pointer border border-white/5"
            >
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
              
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                theme === 'light' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'
              }`}>
                {theme === 'light' ? 'LIGHT' : 'DARK'}
              </span>
            </button>
          </div>

          <div className="p-4 pt-0">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-darkBg/95 backdrop-blur-md flex flex-col pt-16 animate-fade-in">
          <nav className="flex-1 px-6 py-8 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-4 px-5 py-4 rounded-xl text-base font-semibold transition ${
                      isActive
                        ? 'bg-brand text-white shadow-lg'
                        : 'text-slate-300 hover:bg-white/5'
                    }`
                  }
                >
                  <Icon className="w-6 h-6" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="p-6 border-t border-white/5 bg-darkCard/50 flex flex-col gap-4">
            {/* Mobile Theme Toggle Button */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-between w-full px-5 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-200 transition cursor-pointer border border-white/5"
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
              
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                theme === 'light' ? 'bg-amber-500/10 text-amber-500' : 'bg-indigo-500/10 text-indigo-400'
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
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-darkCard/30 border-b border-white/5 backdrop-blur-md sticky top-0 z-40 shadow-sm shadow-black/5">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Hamkor paneli
            </span>
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                partner?.role === 'manager' ? 'cursor-default opacity-85' : 'cursor-pointer'
              } ${
                isOpen
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand to-sky-500 text-white font-bold text-sm shadow-lg shadow-brand/10 hover:shadow-brand/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
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
