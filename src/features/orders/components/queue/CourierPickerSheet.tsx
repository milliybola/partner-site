import React from 'react';
import { Bike } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../../services/ordersApi';
import type { CourierModel } from '../../../staff/services/couriersApi';
import type { PartnerFilial } from '../../services/filialApi';
import { courierServesFilial } from '../../../staff/lib/courierFilial';
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
  /** Buyurtma filialining havzasini bilish uchun (bo'sh bo'lsa faqat filial/filialsiz tekshiriladi) */
  filials?: PartnerFilial[];
  loading: boolean;
  assigningUuid: string | null;
  onClose: () => void;
  onAssign: (courierUuid: string) => void;
}> = ({ order, couriers, filials = [], loading, assigningUuid, onClose, onAssign }) => {
  const navigate = useNavigate();
  if (!order) return null;
  // Shu buyurtma filialiga xizmat qiladiganlar (o'z filiali, filialsiz, umumiy havza) tepada; qolganlari xira va o'chirilgan.
  const serves = (c: CourierModel) => courierServesFilial(c, order.filial_uuid, filials);
  const online = (c: CourierModel) => (c.status === 'online' ? 0 : 1);
  const sorted = [...couriers].sort((a, b) => Number(!serves(a)) - Number(!serves(b)) || online(a) - online(b));
  return (
    <Sheet open persistent={!!assigningUuid} onClose={onClose} title="Kuryer tanlash" subtitle={`${orderNo(order)} buyurtmasi uchun`} size="sm">
      {loading ? (
        <LoadingState label="Kuryerlar yuklanmoqda..." />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<Bike className="w-7 h-7" />}
          title="Kuryerlar topilmadi"
          description="O'z kuryerlaringizni Kuryerlar bo'limida qo'shishingiz mumkin."
          action={
            <Button variant="outline" onClick={() => navigate('/couriers')}>
              Kuryerlarga o'tish
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => {
            const st = courierStatus(c.status);
            const load = c.active_orders ?? 0;
            const limit = c.max_active_orders ?? 1;
            const full = load >= limit;
            const ok = serves(c);
            const reason = ok ? undefined : `Kuryer  filialiga biriktirilgan`;
            return (
              <div key={c.uuid} title={reason} className={`flex items-center justify-between gap-3 p-3 rounded-2xl border border-edge `}>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                    <span className="text-[12px] text-muted">{formatPhone(c.phone)}</span>
                    {!ok && <Badge tone="warning">Boshqa filial{c.filial_name ? `: ` : ''}</Badge>}
                    {ok && order.filial_uuid && c.filial_name && <Badge tone="neutral">{c.filial_name}</Badge>}
                    {load > 0 && (
                      <Badge tone={full ? 'danger' : 'brand'}>
                        Reys {load}/{limit}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button size="md" loading={assigningUuid === c.uuid} disabled={!!assigningUuid || full || !ok} title={reason} onClick={() => onAssign(c.uuid)}>
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
