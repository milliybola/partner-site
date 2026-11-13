import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hourglass, LogOut } from 'lucide-react';
import { Button, EmptyState, InlineAlert, LoadingState } from '../ui';
import { STAGE, usePlatformConfig } from '../lib/platformStage';
import { shiftApi } from '../../features/shifts/services/shiftApi';
import { t } from '../i18n';
import { OfflineSync } from './OfflineSync';

/** «Bu bo'lim keyingi bosqichda» — reklama ham, «tarifni oshiring» ham yo'q (bosqich — platforma qarori) */
export const StageLockedScreen: React.FC<{ account?: boolean; onLogout?: () => void }> = ({ account, onLogout }) => {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={<Hourglass className="w-7 h-7" />}
      title={account ? t('stage.accountTitle') : t('stage.lockedTitle')}
      description={account ? t('stage.accountHint') : t('stage.lockedHint')}
      action={
        account ? (
          <Button size="lg" variant="secondary" icon={<LogOut className="w-4 h-4" />} onClick={onLogout}>
            {t('lay.logout')}
          </Button>
        ) : (
          <Button size="lg" onClick={() => navigate('/orders', { replace: true })}>
            {t('stage.toOrders')}
          </Button>
        )
      }
      className="min-h-[50vh]"
    />
  );
};

/**
 * Kassir hisobi kassa yopiq bosqichda (Q48): hisob ishlamaydi, lekin shu kompyuterdagi oflayn navbat (to'lovlar)
 * baribir serverga yuboriladi va holati tepada ko'rinadi (Q56) — chek taklif qilinmaydi.
 */
export const StageLockedAccountScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <div className="min-h-screen bg-canvas text-ink flex flex-col">
    <OfflineSync receipts={false} />
    <div className="flex-1 flex items-center justify-center px-4">
      <StageLockedScreen account onLogout={onLogout} />
    </div>
  </div>
);

/**
 * Bo'lim platforma bosqichi yetganda ochiladi (to'g'ridan havola, eski bookmark). Tarif darvozasidan (FeatureGate)
 * TASHQARIDA turadi: bosqich yetmasa — «keyingi bosqichda», bosqich yetib tarif yetmasa — tarif xabari (Q52).
 * `openShift` — bosqich pasaytirilgan, lekin ochiq smena qolgan bo'lsa sahifa ochiladi: uni yopish shart (Q56).
 */
export const StageGate: React.FC<{ stage?: number; openShift?: boolean; children: React.ReactElement }> = ({
  stage = STAGE.POS,
  openShift,
  children,
}) => {
  const { stage: current, loaded } = usePlatformConfig();
  const locked = loaded && current < stage;
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!locked || !openShift) return;
    let alive = true;
    shiftApi
      .getCurrentShift()
      .then((s) => alive && setShiftOpen(s?.status === 'OPEN'))
      .catch(() => alive && setShiftOpen(false));
    return () => {
      alive = false;
    };
  }, [locked, openShift]);

  if (!loaded) return <LoadingState className="min-h-[40vh]" />;
  if (!locked) return children;
  if (openShift) {
    if (shiftOpen === null) return <LoadingState className="min-h-[40vh]" />;
    if (shiftOpen)
      return (
        <>
          <InlineAlert tone="warning" className="mt-4">{t('stage.openShiftNote')}</InlineAlert>
          {children}
        </>
      );
  }
  return <StageLockedScreen />;
};
