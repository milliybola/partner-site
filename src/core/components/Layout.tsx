import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, LogOut, PlusCircle, Receipt, Wifi, WifiOff } from 'lucide-react';
import { filialApi } from '../../features/orders/services/filialApi';
import type { PartnerFilial } from '../../features/orders/services/filialApi';
import apiClient from '../api/client';
import { useToast } from './ToastProvider';
import { RealtimeProvider, useRealtime } from '../realtime/RealtimeProvider';
import {
  PARTNER_UPDATED_EVENT,
  clearSession,
  getDisplayName,
  getPartner,
  setPartner as savePartner,
  wording,
} from '../lib/session';
import type { PartnerSession } from '../lib/session';
import { getErrorMessage } from '../lib/errors';
import { ensureNotificationPermission } from '../platform';
import { ApiGap, Sheet, Select } from '../ui';
import { venueOf } from '../../venues';
import { clearTariffCache, useTariff } from '../lib/tariff';
import { clearPaymentMethodsCache } from '../lib/payments';
import { CallAlerts } from '../../features/calls/CallAlerts';
import { buildNav, buildTabs } from '../../venues/nav';

const Logo: React.FC<{ partner: PartnerSession | null; size?: number }> = ({ partner, size = 36 }) =>
  partner?.logo ? (
    <img src={partner.logo} alt="" style={{ width: size, height: size }} className="rounded-xl object-cover border border-edge shrink-0" />
  ) : (
    <img src="./logo.png" alt="" style={{ width: size, height: size }} className="rounded-xl object-cover shrink-0" />
  );

/* ----------------------------------------------------------- Open toggle */
const OpenStatus: React.FC<{ partner: PartnerSession | null; compact?: boolean }> = ({ partner, compact }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const known = typeof partner?.is_open === 'boolean';
  const isOpen = partner?.is_open === true;
  const manager = partner?.role === 'manager';

  // Managers' login payload may not include is_open: show a neutral state, never a guess.
  if (!known && manager) {
    return (
      <span title="Muassasa holati noma'lum (login javobida is_open yo'q)" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-bold bg-field text-muted">
        <span className="w-2 h-2 rounded-full bg-subtle" />
        Holat
      </span>
    );
  }

  // BUGFIX: the old toggle only flipped a localStorage flag — customers never
  // saw the change. It now calls the profile endpoint. PATCH support for
  // `is_open` alone is not confirmed by the backend (see API_GAPS.md #1).
  const toggle = async () => {
    if (manager || saving || !partner) return;
    const next = !isOpen;
    setSaving(true);
    try {
      await apiClient.patch('partner/me/', { is_open: next });
      savePartner({ ...partner, is_open: next });
      toast.success(next ? 'Muassasa ochildi — buyurtmalar qabul qilinadi' : 'Muassasa yopildi — yangi buyurtmalar kelmaydi');
    } catch (err) {
      toast.error(getErrorMessage(err, "Holatni o'zgartirib bo'lmadi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={manager || saving}
        title={manager ? 'Faqat egasi o‘zgartira oladi' : isOpen ? 'Yopish uchun bosing' : 'Ochish uchun bosing'}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-bold transition cursor-pointer disabled:cursor-default
          ${isOpen ? 'bg-brand-soft text-brand' : 'bg-danger-soft text-danger-ink'} ${saving ? 'opacity-60' : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-brand-bright animate-pulse' : 'bg-danger'}`} />
        {compact ? (isOpen ? 'Ochiq' : 'Yopiq') : isOpen ? 'Ochiq' : 'Yopiq'}
      </button>
      {!manager && !compact && <ApiGap title="PATCH partner/me/ {is_open} — backend tomonidan tasdiqlanmagan (API_GAPS.md #1)" />}
    </span>
  );
};

const ConnectionDot: React.FC = () => {
  const { isConnected } = useRealtime();
  return (
    <span
      title={isConnected ? 'Real-vaqt aloqa: ulangan' : 'Real-vaqt aloqa: uzilgan — qayta ulanmoqda'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${isConnected ? 'text-brand' : 'text-warning-ink bg-warning-soft'}`}
    >
      {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
    </span>
  );
};

/* -------------------------------------------------------- Filial switch */
const useFilialSwitcher = (partner: PartnerSession | null) => {
  const toast = useToast();
  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  useEffect(() => {
    if (partner?.role !== 'manager') return;
    filialApi
      .getFilials()
      .then(setFilials)
      .catch(() => setFilials([]));
  }, [partner?.role]);

  const switchTo = async (filialUuid: string) => {
    const staffUuid = partner?.staff_uuid || partner?.uuid;
    if (!staffUuid) return toast.error('Xodim identifikatori topilmadi.');
    try {
      await filialApi.switchFilial(staffUuid, filialUuid);
      const res = await apiClient.get('partner/staff/me/');
      const staff = res.data?.data || res.data;
      savePartner({
        ...partner,
        ...staff,
        role: 'manager',
        staff_uuid: staff?.uuid,
        uuid: staff?.partner_uuid,
      });
      window.location.reload();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Filialni almashtirishda xatolik yuz berdi.'));
    }
  };
  return { filials, switchTo };
};

/* ---------------------------------------------------------------- Shell */
const Shell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [partner, setPartnerState] = useState<PartnerSession | null>(() => getPartner());
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const { unseenNewOrders, markOrdersSeen } = useRealtime();
  const { filials, switchTo } = useFilialSwitcher(partner);

  useEffect(() => {
    const sync = () => setPartnerState(getPartner());
    window.addEventListener(PARTNER_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PARTNER_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Clear the "new orders" badge whenever the user is looking at the queue.
  useEffect(() => {
    if (location.pathname === '/orders') markOrdersSeen();
  }, [location.pathname, unseenNewOrders, markOrdersSeen]);

  // Close the "more" sheet on navigation.
  useEffect(() => setMoreOpen(false), [location.pathname]);

  // Ask for OS notification permission on first interaction (browsers require a gesture).
  useEffect(() => {
    const once = () => {
      ensureNotificationPermission();
      window.removeEventListener('pointerdown', once);
    };
    window.addEventListener('pointerdown', once);
    return () => window.removeEventListener('pointerdown', once);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar_collapsed', String(!c));
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const logout = useCallback(() => {
    clearSession();
    clearTariffCache();
    clearPaymentMethodsCache();
    navigate('/login', { replace: true });
    window.location.reload();
  }, [navigate]);

  const { tariff } = useTariff();
  const groups = useMemo(() => buildNav(partner, tariff), [partner, tariff]);
  const manager = partner?.role === 'manager';
  const w = wording(partner);
  const filialName = partner?.current_filial?.filial_name || partner?.filial_name;

  const kind = venueOf(partner);
  const tabs = useMemo(() => buildTabs(kind, tariff), [kind, tariff]);
  const newOrderLabel = kind === 'store' ? 'Kassa' : 'Yangi buyurtma';

  // Do'kon va restoran ranglari: index.css dagi `[data-venue]` o'zgaruvchilari
  useEffect(() => {
    document.documentElement.dataset.venue = kind;
  }, [kind]);

  const tabPaths = tabs.map((t) => t.to);
  const moreActive = !tabPaths.includes(location.pathname);

  const filialSelect =
    manager && filials.length > 1 ? (
      <Select
        label="Joriy filial"
        value={partner?.current_filial?.uuid || ''}
        onChange={(e) => switchTo(e.target.value)}
      >
        <option value="" disabled>
          Filial tanlang
        </option>
        {filials.map((f) => (
          <option key={f.uuid} value={f.uuid}>
            {f.filial_name} {f.is_main ? '(Asosiy)' : ''}
          </option>
        ))}
      </Select>
    ) : null;

  return (
    <div className="min-h-screen bg-canvas text-ink md:flex" style={{ ['--appbar-h' as any]: '56px' }}>
      <CallAlerts />
      {/* ---------------- Desktop sidebar ---------------- */}
      <aside
        className={`hidden md:flex flex-col sticky top-0 h-screen shrink-0 bg-surface border-r border-edge transition-[width] duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[248px]'
        }`}
      >
        <div className={`h-14 flex items-center gap-2.5 px-4 border-b border-edge ${collapsed ? 'justify-center px-2' : ''}`}>
          <Logo partner={partner} size={32} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold text-ink truncate tracking-tightest">{getDisplayName(partner)}</div>
              <div className="text-[11px] text-muted truncate">{filialName || (manager ? 'Menejer' : 'Hamkor paneli')}</div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-3 space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              {!collapsed && <div className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-subtle">{g.title}</div>}
              <div className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon;
                  const showBadge = item.to === '/orders' && unseenNewOrders > 0;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 h-10 rounded-xl text-[14px] font-semibold transition-colors ${
                          collapsed ? 'justify-center w-12 mx-auto' : 'px-3'
                        } ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-field hover:text-ink'}`
                      }
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {showBadge && (
                        <span
                          className={`${collapsed ? 'absolute top-1 right-1' : 'ml-auto'} min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-extrabold flex items-center justify-center`}
                        >
                          {unseenNewOrders}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-edge p-3 space-y-2">
          {!collapsed && filialSelect}
          <button
            type="button"
            onClick={logout}
            title="Chiqish"
            className={`flex items-center gap-3 h-10 rounded-xl text-[14px] font-semibold text-danger-ink hover:bg-danger-soft w-full cursor-pointer ${
              collapsed ? 'justify-center' : 'px-3'
            }`}
          >
            <LogOut className="w-[18px] h-[18px]" />
            {!collapsed && 'Chiqish'}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Yoyish' : "Yig'ish"}
            className={`flex items-center gap-3 h-9 rounded-xl text-[13px] font-semibold text-muted hover:bg-field w-full cursor-pointer ${
              collapsed ? 'justify-center' : 'px-3'
            }`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && "Menyuni yig'ish"}
          </button>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (mobile + desktop) */}
        <header className="sticky top-0 z-30 h-14 bg-surface/95 backdrop-blur border-b border-edge pt-[var(--safe-top)] box-content">
          <div className="h-14 flex items-center justify-between gap-2 px-4 md:px-8">
            <div className="flex items-center gap-2.5 min-w-0 md:hidden">
              <Logo partner={partner} size={32} />
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold text-ink truncate tracking-tightest max-w-[46vw]">{getDisplayName(partner)}</div>
                {filialName && <div className="text-[11px] text-muted truncate max-w-[46vw]">{filialName}</div>}
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-[13px] text-muted min-w-0">
              <span className="truncate">{w.venue} boshqaruv paneli</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <ConnectionDot />
              <OpenStatus partner={partner} compact />
              {location.pathname !== '/new-order' && (
                <NavLink
                  to="/new-order"
                  className="hidden md:inline-flex items-center gap-2 h-10 px-4 ml-1 rounded-xl bg-brand text-white text-[14px] font-bold hover:bg-brand-dark"
                >
                  <PlusCircle className="w-4 h-4" /> {newOrderLabel}
                </NavLink>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 pb-[calc(var(--tabbar-h)+var(--safe-bottom)+16px)] md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* ---------------- Mobile bottom tab bar ---------------- */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-edge pb-[var(--safe-bottom)]"
        aria-label="Asosiy navigatsiya"
      >
        <div className="h-16 grid grid-cols-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            const badge = t.to === '/orders' && unseenNewOrders > 0;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${isActive ? 'text-brand' : 'text-muted'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`relative flex items-center justify-center w-12 h-7 rounded-full ${isActive ? 'bg-brand-soft' : ''}`}>
                      <Icon className="w-[22px] h-[22px]" />
                      {badge && (
                        <span className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-extrabold flex items-center justify-center animate-new-order">
                          {unseenNewOrders}
                        </span>
                      )}
                    </span>
                    <span className="truncate max-w-full px-1">{t.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold cursor-pointer ${moreActive ? 'text-brand' : 'text-muted'}`}
          >
            <span className={`flex items-center justify-center w-12 h-7 rounded-full ${moreActive ? 'bg-brand-soft' : ''}`}>
              <LayoutGrid className="w-[22px] h-[22px]" />
            </span>
            Ko'proq
          </button>
        </div>
      </nav>

      {/* ---------------- "Ko'proq" sheet ---------------- */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Ko'proq" subtitle={getDisplayName(partner)}>
        <div className="space-y-5">
          <NavLink
            to="/new-order"
            className="flex items-center justify-center gap-2 h-14 rounded-2xl bg-brand text-white text-[16px] font-extrabold"
          >
            <PlusCircle className="w-5 h-5" /> {newOrderLabel}
          </NavLink>
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-field">
            <div className="text-[14px] font-semibold">Muassasa holati</div>
            <OpenStatus partner={partner} />
          </div>
          {filialSelect}
          {groups.map((g) => {
            const items = g.items.filter((i) => !tabPaths.includes(i.to) && i.to !== '/new-order');
            if (!items.length) return null;
            return (
              <div key={g.title}>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-subtle">{g.title}</div>
                <div className="grid grid-cols-3 gap-2">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex flex-col items-center justify-center text-center gap-2 min-h-[88px] p-2 rounded-2xl border text-[12px] font-bold leading-tight ${
                            isActive ? 'border-brand/30 bg-brand-soft text-brand' : 'border-edge bg-surface text-ink'
                          }`
                        }
                      >
                        <Icon className="w-6 h-6" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-danger-soft text-danger-ink font-bold cursor-pointer"
          >
            <LogOut className="w-5 h-5" /> Chiqish
          </button>
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-subtle">
            <Receipt className="w-3.5 h-3.5" /> MilliyGo Hamkor
          </div>
        </div>
      </Sheet>
    </div>
  );
};

const Layout: React.FC = () => (
  <RealtimeProvider>
    <Shell />
  </RealtimeProvider>
);

export default Layout;
