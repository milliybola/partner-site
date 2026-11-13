import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from './ConfirmProvider';
import { isShiftNotOpen } from '../lib/errors';
import { t } from '../i18n';

type ConfirmFn = ReturnType<typeof useConfirm>;

/**
 * D36 (A31): kassa to'lovi (naqd/karta/o'tkazma) — buyurtma filialida smena ochilmagan bo'lsa server 409
 * SHIFT_NOT_OPEN qaytaradi va hech narsa yozmaydi. Kassir aniq xabarni va bitta bosishda smena sahifasini ko'radi;
 * buyurtma holati o'zgarmaydi (chaqiruvchi optimistik o'zgarish qilmaydi, pul olingan deb ko'rsatmaydi).
 * Qaytaradi: xato shu bo'lsa — true (ko'rsatildi), aks holda false (chaqiruvchi o'zi ko'rsatadi).
 */
export const promptShiftNotOpen = (err: unknown, confirm: ConfirmFn, goShift: () => void): boolean => {
  if (!isShiftNotOpen(err)) return false;
  void confirm(t('shiftGate.msg'), {
    title: t('shiftGate.title'),
    confirmText: t('shiftGate.open'),
    cancelText: t('shiftGate.later'),
  }).then((ok) => {
    if (ok) goShift();
  });
  return true;
};

export const useShiftNotOpenPrompt = () => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  return useCallback((err: unknown): boolean => promptShiftNotOpen(err, confirm, () => navigate('/shift')), [confirm, navigate]);
};
