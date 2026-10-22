import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button, EmptyState, LoadingState } from '../ui';
import { useTariff } from '../lib/tariff';

const TEXT = {
  pickup: { title: 'Olib ketish', need: 'pickup' },
  dine_in: { title: 'Zal va stollar', need: 'dine_in' },
} as const;

/** Tarifda yo'q bo'limga to'g'ridan-to'g'ri havola bilan kirilsa — ochilmaydi, «Tarif» sahifasiga yo'naltiradi. */
export const FeatureGate: React.FC<{ feature: keyof typeof TEXT; children: React.ReactElement }> = ({ feature, children }) => {
  const { tariff, loading } = useTariff();
  const navigate = useNavigate();
  const allowed = feature === 'pickup' ? tariff.allow_pickup : tariff.allow_dine_in;
  if (loading) return <LoadingState className="min-h-[40vh]" />;
  if (allowed) return children;
  return (
    <EmptyState
      icon={<Lock className="w-7 h-7" />}
      title={`${TEXT[feature].title} tarifingizda yo'q`}
      description={`«${tariff.name}» tarifida bu bo'lim ochiq emas. Tarifni oshirsangiz darhol ishlaydi.`}
      action={<Button onClick={() => navigate(`/plan?need=${TEXT[feature].need}`)}>Tarifni ko'rish</Button>}
      className="min-h-[50vh]"
    />
  );
};
