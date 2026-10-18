import React from 'react';
import { Bike } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../../services/ordersApi';
import type { CourierModel } from '../../../staff/services/couriersApi';
import { Badge, Button, EmptyState, LoadingState, Sheet } from '../../../../core/ui';
import { formatPhone } from '../../../../core/lib/format';
import { orderNo } from './actions';

const courierStatus = (s?: string) => {
  if (s === 'online') return { label: 'Onlayn', tone: 'success' as const };
  if (s === 'busy') return { label: 'Band', tone: 'warning' as const };
  if (s === 'offline') return { label: 'Oflayn', tone: 'neutral' as const };
  return { label: s || "Noma'lum", tone: 'neutral' as const };
};

export const CourierPickerSheet: React.FC<{
  order: Order | null;
  couriers: CourierModel[];
  loading: boolean;
  assigningUuid: string | null;
  onClose: () => void;
  onAssign: (courierUuid: string) => void;
}> = ({ order, couriers, loading, assigningUuid, onClose, onAssign }) => {
  const navigate = useNavigate();
  if (!order) return null;
  const sorted = [...couriers].sort((a, b) => (a.status === 'online' ? -1 : 0) - (b.status === 'online' ? -1 : 0));
  return (
    <Sheet open persistent={!!assigningUuid} onClose={onClose} title="Kuryer tanlash" subtitle={`${orderNo(order)} buyurtmasi uchun`} size="sm">
      {loading ? (
        <LoadingState label="Kuryerlar yuklanmoqda..." />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Bike className="w-7 h-7" />}
          title="Kuryerlar topilmadi"
          description="O'z kuryerlaringizni Xodimlar bo'limida qo'shishingiz mumkin."
          action={
            <Button variant="outline" onClick={() => navigate('/staff')}>
              Xodimlarga o'tish
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const st = courierStatus(c.status);
            return (
              <div key={c.uuid} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-edge">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                    <span className="text-[12px] text-muted">{formatPhone(c.phone)}</span>
                  </div>
                </div>
                <Button size="md" loading={assigningUuid === c.uuid} disabled={!!assigningUuid} onClick={() => onAssign(c.uuid)}>
                  Biriktirish
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
};
