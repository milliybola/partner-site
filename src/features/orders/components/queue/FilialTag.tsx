import React from 'react';
import { Building2 } from 'lucide-react';
import type { Order } from '../../services/ordersApi';
import { Badge } from '../../../../core/ui';
import { useOwnerFilials } from '../../../../core/lib/useWorkingFilial';

/** Buyurtma filiali nishoni — faqat 2+ filialli hamkor egasiga ko'rinadi (qolganlarga keraksiz). */
export const FilialTag: React.FC<{ order: Pick<Order, 'filial_name'> }> = ({ order }) => {
  const { filials } = useOwnerFilials();
  if (filials.length < 2 || !order.filial_name) return null;
  return (
    <Badge tone="neutral" title="Buyurtma filiali">
      <Building2 className="w-3 h-3" /> {order.filial_name}
    </Badge>
  );
};
