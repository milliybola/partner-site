import React, { useState } from 'react';
import { deliveryZonesApi } from '../services/deliveryZonesApi';
import type { PartnerDeliveryZone } from '../services/deliveryZonesApi';
import { useToast } from '../../../core/components/ToastProvider';
import { getErrorMessage } from '../../../core/lib/errors';
import { Button, InlineAlert, Input, SettingRow, Sheet, Switch } from '../../../core/ui';

interface EditZoneModalProps {
  zone: PartnerDeliveryZone;
  onClose: (refresh: boolean) => void;
}

export const EditZoneModal: React.FC<EditZoneModalProps> = ({ zone, onClose }) => {
  const toast = useToast();
  const [deliveryFee, setDeliveryFee] = useState(zone.delivery_fee ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    zone.estimated_minutes !== null && zone.estimated_minutes !== undefined ? String(zone.estimated_minutes) : '',
  );
  const [isActive, setIsActive] = useState(zone.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const feeInvalid = deliveryFee.trim() !== '' && (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0);
  const minInvalid = estimatedMinutes.trim() !== '' && (!Number.isInteger(Number(estimatedMinutes)) || Number(estimatedMinutes) < 0);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (feeInvalid || minInvalid) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await deliveryZonesApi.updateZone(zone.uuid, {
        delivery_fee: deliveryFee.trim() ? deliveryFee.trim() : null,
        estimated_minutes: estimatedMinutes.trim() ? Number(estimatedMinutes) : null,
        is_active: isActive,
      });
      toast.success('Hudud sozlamalari yangilandi.');
      onClose(true);
    } catch (err) {
      setFormError(getErrorMessage(err, 'Hududni yangilashda xatolik yuz berdi.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => onClose(false)}
      persistent={submitting}
      size="sm"
      title="Hudud sozlamalari"
      subtitle={`${zone.neighborhood.name} · ${zone.neighborhood.district}`}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => onClose(false)} disabled={submitting} className="md:min-w-[120px]">
            Bekor qilish
          </Button>
          <Button size="lg" onClick={() => handleSubmit()} loading={submitting} disabled={feeInvalid || minInvalid} className="md:min-w-[120px]">
            Saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && <InlineAlert>{formError}</InlineAlert>}
        <Input
          label="Yetkazib berish narxi (so'm)"
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Bo'sh — standart narx"
          value={deliveryFee}
          onChange={(e) => setDeliveryFee(e.target.value)}
          error={feeInvalid ? "Narx 0 yoki undan katta son bo'lishi kerak" : null}
          hint="Bo'sh qoldirilsa, muassasaning standart yetkazish narxi qo'llanadi"
        />
        <Input
          label="Taxminiy yetkazish vaqti (daqiqa)"
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Masalan, 40"
          value={estimatedMinutes}
          onChange={(e) => setEstimatedMinutes(e.target.value)}
          error={minInvalid ? "Butun son kiriting" : null}
        />
        <SettingRow
          className="border-t border-edge"
          title="Faol holatda"
          description="Nofaol hududdan buyurtma qabul qilinmaydi"
          control={<Switch checked={isActive} onChange={setIsActive} label="Faol holatda" />}
        />
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
};
