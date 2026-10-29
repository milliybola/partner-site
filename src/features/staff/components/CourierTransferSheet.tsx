import React, { useState } from 'react';
import { Building2, Check } from 'lucide-react';
import { Button, InlineAlert, Sheet } from '../../../core/ui';
import { couriersApi } from '../services/couriersApi';
import type { CourierModel } from '../services/couriersApi';
import type { PartnerFilial } from '../../orders/services/filialApi';
import { getErrorMessage } from '../../../core/lib/errors';
import { useToast } from '../../../core/components/ToastProvider';

const NONE = '__none__';

interface Props {
  courier: CourierModel | null;
  filials: PartnerFilial[];
  onClose: () => void;
  onDone: (updated: CourierModel | null, uuid: string) => void;
}

/** Kuryerni boshqa filialga ko'chirish (faqat hamkor egasi chaqiradi). Har kuryer uchun yangi holat bilan ochiladi. */
export const CourierTransferSheet: React.FC<Props> = (props) =>
  props.courier ? <TransferBody key={props.courier.uuid} {...props} courier={props.courier} /> : null;

const TransferBody: React.FC<Props & { courier: CourierModel }> = ({ courier, filials, onClose, onDone }) => {
  const toast = useToast();
  const [value, setValue] = useState<string>(courier.filial_uuid || NONE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = courier.filial_uuid || NONE;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await couriersApi.transferCourier(courier.uuid, value === NONE ? null : value);
      toast.success(res?.message || "Kuryer ko'chirildi");
      onDone(res?.data ?? null, courier.uuid);
    } catch (err) {
      // 409 HAS_ACTIVE_ORDER: kuryer buyurtmani qo'lida olib yurgan — server xabarini ko'rsatamiz
      setError(getErrorMessage(err, "Kuryerni ko'chirib bo'lmadi."));
    } finally {
      setSaving(false);
    }
  };

  const options = [
    { id: NONE, title: 'Filialsiz (butun hamkor)', hint: 'Kuryer barcha filiallar buyurtmalarini oladi' },
    ...filials.map((f) => ({ id: f.uuid, title: f.filial_name, hint: f.courier_pool ? 'Umumiy kuryerlar havzasi' : f.address || '' })),
  ];

  return (
    <Sheet
      open
      persistent={saving}
      onClose={() => !saving && onClose()}
      size="sm"
      title="Boshqa filialga ko'chirish"
      subtitle={`${courier.first_name} ${courier.last_name}`.trim()}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>
            Bekor qilish
          </Button>
          <Button size="lg" onClick={submit} loading={saving} disabled={value === current}>
            Ko'chirish
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <InlineAlert>{error}</InlineAlert>}
        <InlineAlert tone="info">Olib ketilmagan buyurtmalari hamkorga qaytariladi. Buyurtmani qo'lida olib yurgan kuryerni ko'chirib bo'lmaydi.</InlineAlert>
        <div className="space-y-2" role="radiogroup">
          {options.map((o) => {
            const on = value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setValue(o.id)}
                className={`w-full flex items-center gap-3 p-3 min-h-[56px] rounded-2xl border text-left cursor-pointer transition
                  ${on ? 'border-brand bg-brand-soft' : 'border-edge hover:bg-field'}`}
              >
                <span className="w-10 h-10 rounded-xl bg-field flex items-center justify-center text-muted shrink-0">
                  <Building2 className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold truncate">{o.title}</span>
                  {o.hint && <span className="block text-[13px] text-muted truncate">{o.hint}</span>}
                </span>
                {on && <Check className="w-5 h-5 text-brand shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
};
