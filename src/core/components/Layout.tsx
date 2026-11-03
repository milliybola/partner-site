import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Lock, LogOut, PlusCircle, Receipt, Settings2, Store, Wifi, WifiOff } from 'lucide-react';
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
  isCashier,
  isManager,
  isOwner,
  setPartner as savePartner,
  wording,
} from '../lib/session';
import type { PartnerSession } from '../lib/session';
import { getErrorMessage } from '../lib/errors';
import { clearOwnerFilialsCache, useOwnerFilials, useWorkingFilial } from '../lib/useWorkingFilial';
import { ensureNotificationPermission } from '../platform';
import { ApiGap, Sheet } from '../ui';
import { FilialSwitch } from './FilialSwitch';
import { venueOf } from '../../venues';
import { clearTariffCache, useTariff } from '../lib/tariff';
import { clearPaymentMethodsCache } from '../lib/payments';
import { CallAlerts } from '../../features/calls/CallAlerts';
import { TableCallAlerts } from '../../features/tables/TableCallAlerts';
import { KitchenPrintAgent } from '../../features/orders/KitchenPrintAgent';
import { OfflineSync } from './OfflineSync';
import { PosLockScreen } from './PosLockScreen';
import { lockPos, unlockPos, useAutoLock, usePosHasPins, usePosLocked } from '../lib/posLock';
import { buildNav, buildTabs } from '../../venues/nav';
import { posHome, setWorkMode, useWorkMode } from '../lib/workMode';
import type { WorkMode } from '../lib/workMode';

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
  const manager = isManager(partner);

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

/* ------------------------------------------------------- Work mode switch */
/** Kassa ↔ Boshqaruv. Kassirga ko'rsatilmaydi (u doim kassada). */
const ModeSwitch: React.FC<{ mode: WorkMode; onChange: (m: WorkMode) => void; wide?: boolean }> = ({ mode, onChange, wide }) => (
  <div className={`inline-flex p-1 rounded-xl bg-field ${wide ? 'w-full' : ''}`} role="tablist" aria-label="Ish rejimi">
    {([
      ['pos', 'Kassa', Store],
      ['manage', 'Boshqaruv', Settings2],
    ] as const).map(([m, label, Icon]) => (
      <button
        key={m}
        type="button"
        role="tab"
        aria-selected={mode === m}
        onClick={() => mode !== m && onChange(m)}
        className={`inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-bold cursor-pointer transition ${
          wide ? 'flex-1 h-10' : ''
        } ${mode === m ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-ink'}`}
      >
        <Icon className="w-4 h-4" /> {label}
      </button>
    ))}
  </div>
);

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
    if (partner?.role !== 'manager' && partner?.role !== 'cashier') return;
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
        role: partner?.role ?? 'manager',
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
  const owner = isOwner(partner);
  const [workingFilial, setWorkingFilial] = useWorkingFilial();
  const { filials: ownerFilials } = useOwnerFilials();

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
    unlockPos(); // keyingi kirishda qulf ekrani chiqib qolmasin
    clearSession();
    clearOwnerFilialsCache();
    clearTariffCache();
    clearPaymentMethodsCache();
    navigate('/login', { replace: true });
    window.location.reload();
  }, [navigate]);

  const { tariff } = useTariff();
  const mode = useWorkMode();
  const cashier = isCashier(partner);
  const groups = useMemo(() => buildNav(partner, tariff, mode), [partner, tariff, mode]);
  const manager = isManager(partner);
  const pos = mode === 'pos';
  const locked = usePosLocked();
  const hasPins = usePosHasPins(pos, locked);
  // Avtomatik qulf faqat PIN o'rnatilgan xodim bo'lsa (aks holda kassa hech kim ocholmaydigan bo'lib qoladi)
  useAutoLock(pos && hasPins === true);
  const staffName = partner?.user_type === 'staff' ? partner?.name : undefined;
  const changeMode = (m: WorkMode) => {
    setWorkMode(m);
    navigate(m === 'pos' ? posHome(partner, tariff.allow_dine_in) : owner ? '/' : '/orders');
  };
  const w = wording(partner);
  const ownerMulti = owner && ownerFilials.length > 1;
  const filialName = ownerMulti
    ? ownerFilials.find((f) => f.uuid === workingFilial)?.filial_name || 'Barcha filiallar'
    : partner?.current_filial?.filial_name || partner?.filial_name;

  const kind = venueOf(partner);
  const tabs = useMemo(() => buildTabs(kind, tariff, mode), [kind, tariff, mode]);
  const newOrderLabel = kind === 'store' ? 'Kassa' : 'Yangi buyurtma';

  // Do'kon va restoran ranglari: index.css dagi `[data-venue]` o'zgaruvchilari
  useEffect(() => {
    document.documentElement.dataset.venue = kind;
  }, [kind]);

  const tabPaths = tabs.map((t) => t.to);
  const moreActive = !tabPaths.includes(location.pathname);

  // Filial tanlagich sarlavhada: rahbar — «Barcha filiallar» + filiallar; menejer — faqat o'z filiallari
  const filialSwitch = ownerMulti ? (
    <FilialSwitch
      value={workingFilial || ''}
      subtitle={getDisplayName(partner)}
      onChange={(v) => setWorkingFilial(v || null)}
      options={[
        { value: '', label: 'Barcha filiallar', hint: 'Hamma filiallar jami' },
        ...ownerFilials.map((f) => ({ value: f.uuid, label: f.filial_name, hint: f.is_main ? 'Asosiy filial' : undefined })),
      ]}
    />
  ) : manager && filials.length > 1 ? (
    <FilialSwitch
      value={partner?.current_filial?.uuid || ''}
      subtitle={getDisplayName(partner)}
      onChange={(v) => v && switchTo(v)}
      options={filials.map((f) => ({ value: f.uuid, label: f.filial_name, hint: f.is_main ? 'Asosiy filial' : undefined }))}
    />
  ) : null;

  return (
    <div className="min-h-screen bg-canvas text-ink md:flex" style={{ ['--appbar-h' as any]: '56px' }}>
      <CallAlerts />
      <TableCallAlerts />
      <KitchenPrintAgent />
      {pos && locked && <PosLockScreen onLogout={logout} hasPins={hasPins} />}
      {/* ---------------- Desktop sidebar (kassa rejimida yo'q — butun ekran) ---------------- */}
      <aside
        className={`hidden ${pos ? '' : 'md:flex'} flex-col sticky top-0 h-screen shrink-0 bg-surface border-r border-edge transition-[width] duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[248px]'
        }`}
      >
        <div className={`h-14 flex items-center gap-2.5 px-4 border-b border-edge ${collapsed ? 'justify-center px-2' : ''}`}>
          <Logo partner={partner} size={32} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold text-ink truncate tracking-tightest">{getDisplayName(partner)}</div>
              <div className="text-[11px] text-muted truncate">{filialName || (cashier ? 'Kassir' : manager ? 'Menejer' : 'Hamkor paneli')}</div>
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
              {filialSwitch ? (
                filialSwitch
              ) : (
                <div className="min-w-0">
                  <div className="text-[15px] font-extrabold text-ink truncate tracking-tightest max-w-[46vw]">{getDisplayName(partner)}</div>
                  {filialName && <div className="text-[11px] text-muted truncate max-w-[46vw]">{filialName}</div>}
                </div>
              )}
            </div>
            {pos ? (
              /* Kassa: logotip + bo'limlar tablari (monoblok uchun katta tugmalar) */
              <div className="hidden md:flex items-center gap-3 min-w-0 flex-1">
                <Logo partner={partner} size={34} />
                <nav className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar" aria-label="Kassa bo'limlari">
                  {groups.flatMap((g) => g.items).map((item) => {
                    const Icon = item.icon;
                    const badge = item.to === '/orders' && unseenNewOrders > 0;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `relative shrink-0 inline-flex items-center gap-2 h-11 px-4 rounded-xl text-[15px] font-bold transition-colors ${
                            isActive ? 'bg-brand text-white' : 'text-muted hover:bg-field hover:text-ink'
                          }`
                        }
                      >
                        <Icon className="w-[18px] h-[18px]" />
                        {item.label}
                        {badge && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-extrabold flex items-center justify-center">
                            {unseenNewOrders}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </nav>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-3 text-[13px] text-muted min-w-0">
                {!cashier && <ModeSwitch mode={mode} onChange={changeMode} />}
                <span className="truncate">{`${w.venue} boshqaruv paneli`}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {filialSwitch && <div className="hidden md:block mr-1">{filialSwitch}</div>}
              {pos && !cashier && (
                <div className="hidden lg:block mr-1">
                  <ModeSwitch mode={mode} onChange={changeMode} />
                </div>
              )}
              <ConnectionDot />
              {pos && staffName && (
                <span className="hidden md:inline-flex items-center h-9 px-3 rounded-full bg-field text-[13px] font-bold text-ink max-w-[160px] truncate">
                  {staffName}
                </span>
              )}
              {pos && (
                <button
                  type="button"
                  onClick={lockPos}
                  title="Kassani qulflash"
                  className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-ink text-white text-[14px] font-bold cursor-pointer hover:opacity-90"
                >
                  <Lock className="w-4 h-4" />
                  <span className="hidden md:inline">Qulflash</span>
                </button>
              )}
              {!pos && location.pathname !== '/new-order' && (
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
        <OfflineSync />

        <main className="flex-1 px-4 md:px-8 pb-[calc(var(--tabbar-h)+var(--safe-bottom)+16px)] md:pb-10">
          {/* Rahbar ishlayotgan filialni almashtirsa sahifa qayta yuklanadi (ma'lumotlar shu filial bo'yicha) */}
          <Outlet key={workingFilial ?? 'all'} />
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
          {!cashier && <ModeSwitch mode={mode} onChange={changeMode} wide />}
          {pos && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                lockPos();
              }}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-ink text-white font-bold cursor-pointer"
            >
              <Lock className="w-5 h-5" /> Kassani qulflash
            </button>
          )}
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-field">
            <div className="text-[14px] font-semibold">Muassasa holati</div>
            <OpenStatus partner={partner} />
          </div>
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
