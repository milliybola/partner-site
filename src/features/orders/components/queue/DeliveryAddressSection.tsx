import React, { useState } from 'react';
import { Copy, MapPin, Send, TriangleAlert } from 'lucide-react';
import { ordersApi } from '../../services/ordersApi';
import type { Order } from '../../services/ordersApi';
import { Badge, Button, Input, Textarea } from '../../../../core/ui';
import { useToast } from '../../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../../core/lib/errors';

export const hasDeliveryPoint = (o: Pick<Order, 'latitude' | 'longitude'>) =>
  o.latitude != null && o.longitude != null && o.latitude !== '' && o.longitude !== '';

/** Yetkazish manzili yo'qligini bildiradi (kuryer qayerga borishini bilmaydi). */
export const missingAddress = (o: Order) =>
  o.delivery_type === 'DELIVERY' && !(o.address || '').trim() && !hasDeliveryPoint(o);

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'info' }> = {
  REQUESTED: { label: 'Joylashuv so‘ralgan', tone: 'info' },
  RECEIVED: { label: 'Mijoz joylashuvni yubordi', tone: 'success' },
  HAS_POINT: { label: 'Xaritada belgilangan', tone: 'success' },
};

export const LocationBadge: React.FC<{ order: Order }> = ({ order }) => {
  if (order.delivery_type !== 'DELIVERY') return null;
  const s = order.location_status && STATUS[order.location_status];
  if (s) return <Badge tone={s.tone}>{s.label}</Badge>;
  return missingAddress(order) ? <Badge tone="warning">Manzil yo‘q</Badge> : null;
};

interface Props {
  order: Order;
  onPatched: (uuid: string, patch: Partial<Order>) => void;
}

/** Faol yetkazib berish buyurtmasi uchun: manzilni kiritish va mijozdan joylashuv so'rash. */
export const DeliveryAddressSection: React.FC<Props> = ({ order, onPatched }) => {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(order.address || '');
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const save = async () => {
    if (!address.trim()) return toast.error('Manzilni yozing.');
    setSaving(true);
    try {
      const updated = await ordersApi.updateDeliveryInfo(order.uuid, { address: address.trim() });
      onPatched(order.uuid, { address: updated?.address ?? address.trim(), location_status: updated?.location_status ?? order.location_status });
      setEditing(false);
      toast.success('Manzil saqlandi.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Manzilni saqlab bo‘lmadi.'));
    } finally {
      setSaving(false);
    }
  };

  const request = async () => {
    setRequesting(true);
    try {
      const r = await ordersApi.requestLocation(order.uuid);
      onPatched(order.uuid, { location_status: r.location_status });
      if (r.sms_sent) {
        setLink(null);
        toast.success('Mijozga SMS yuborildi.');
      } else {
        setLink(r.link);
        toast.info('SMS yuborilmadi — havolani mijozga o‘zingiz jo‘nating.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Joylashuvni so‘rab bo‘lmadi.'));
    } finally {
      setRequesting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link || '');
      toast.success('Havola nusxalandi.');
    } catch {
      toast.error('Nusxalab bo‘lmadi.');
    }
  };

  const missing = missingAddress(order);
  return (
    <section className={`rounded-2xl px-4 py-3 space-y-3 ${missing ? 'bg-gold-soft' : 'border border-edge'}`}>
      {missing && (
        <div className="flex gap-2.5 text-gold-ink">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-[14px] font-semibold">Manzil yo‘q — kuryer qayerga borishini bilmaydi. Manzilni kiriting yoki mijozdan joylashuv so‘rang.</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" icon={<MapPin className="w-4 h-4" />} onClick={() => { setAddress(order.address || ''); setEditing(true); }}>
            {order.address ? 'Manzilni o‘zgartirish' : 'Manzilni kiritish'}
          </Button>
          <Button variant="secondary" size="lg" loading={requesting} icon={<Send className="w-4 h-4" />} onClick={request}>
            Mijozdan joylashuv so‘rash
          </Button>
        </div>
      )}
      {link && (
        <div className="flex items-center gap-2">
          <Input readOnly value={link} containerClassName="flex-1" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="secondary" size="lg" icon={<Copy className="w-4 h-4" />} onClick={copy}>Nusxa</Button>
        </div>
      )}
    </section>
  );
};
