import React, { useState } from 'react';
import { MapPin, TriangleAlert } from 'lucide-react';
import { ordersApi } from '../../services/ordersApi';
import type { Order } from '../../services/ordersApi';
import { Badge, Button, Textarea } from '../../../../core/ui';
import { useToast } from '../../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../../core/lib/errors';

export const hasDeliveryPoint = (o: Pick<Order, 'latitude' | 'longitude'>) =>
  o.latitude != null && o.longitude != null && o.latitude !== '' && o.longitude !== '';

/** Yetkazish manzili yo'qligini bildiradi (kuryer qayerga borishini bilmaydi). */
export const missingAddress = (o: Order) =>
  o.delivery_type === 'DELIVERY' && !(o.address || '').trim() && !hasDeliveryPoint(o);

export const LocationBadge: React.FC<{ order: Order }> = ({ order }) => {
  if (order.delivery_type !== 'DELIVERY') return null;
  return missingAddress(order) ? <Badge tone="warning">Manzil yo‘q</Badge> : null;
};

interface Props {
  order: Order;
  onPatched: (uuid: string, patch: Partial<Order>) => void;
}

/**
 * Faol yetkazib berish buyurtmasi uchun manzil (matn) kiritish.
 * Mijoz telefon orqali aytgan manzilni hamkor matn sifatida yozadi — kuryer shu matn va telefon bilan boradi.
 * (Loyihada SMS yuborilmaydi va kuryerga xarita nuqtasi ko'rsatilmaydi — faqat matnli ma'lumot.)
 */
export const DeliveryAddressSection: React.FC<Props> = ({ order, onPatched }) => {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(order.address || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!address.trim()) return toast.error('Manzilni yozing.');
    setSaving(true);
    try {
      const updated = await ordersApi.updateDeliveryInfo(order.uuid, { address: address.trim() });
      onPatched(order.uuid, { address: updated?.address ?? address.trim() });
      setEditing(false);
      toast.success('Manzil saqlandi.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Manzilni saqlab bo‘lmadi.'));
    } finally {
      setSaving(false);
    }
  };

  const missing = missingAddress(order);
  return (
    <section className={`rounded-2xl px-4 py-3 space-y-3 ${missing ? 'bg-gold-soft' : 'border border-edge'}`}>
      {missing && (
        <div className="flex gap-2.5 text-gold-ink">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-[14px] font-semibold">Manzil yo‘q — kuryer qayerga borishini bilmaydi. Mijoz aytgan manzilni yozib qo‘ying.</p>
        </div>
      )}
      {editing ? (
        <div className="space-y-2">
          <Textarea rows={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ko‘cha, uy, xonadon, mo‘ljal" maxLength={500} autoFocus />
          <div className="flex gap-2">
            <Button size="lg" block loading={saving} onClick={save}>Saqlash</Button>
            <Button size="lg" variant="outline" block disabled={saving} onClick={() => setEditing(false)}>Bekor</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="lg" block icon={<MapPin className="w-4 h-4" />} onClick={() => { setAddress(order.address || ''); setEditing(true); }}>
          {order.address ? 'Manzilni o‘zgartirish' : 'Manzilni kiritish'}
        </Button>
      )}
    </section>
  );
};
