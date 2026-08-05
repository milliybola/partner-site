import React, { useState } from 'react';
import { X, Loader2, ShieldAlert } from 'lucide-react';
import { deliveryZonesApi } from '../services/deliveryZonesApi';
import type { PartnerDeliveryZone } from '../services/deliveryZonesApi';
import { useToast } from '../../../core/components/ToastProvider';

interface EditZoneModalProps {
  zone: PartnerDeliveryZone;
  onClose: (refresh: boolean) => void;
}

export const EditZoneModal: React.FC<EditZoneModalProps> = ({ zone, onClose }) => {
  const toast = useToast();
  const [deliveryFee, setDeliveryFee] = useState(zone.delivery_fee ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    zone.estimated_minutes !== null && zone.estimated_minutes !== undefined ? String(zone.estimated_minutes) : ''
  );
  const [isActive, setIsActive] = useState(zone.is_active);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err: any) {
      console.error('Failed to update delivery zone:', err);
      setFormError(err.response?.data?.message || err.message || 'Hududni yangilashda xatolik yuz berdi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => onClose(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-darkCard border border-edge-strong rounded-2xl shadow-2xl p-6 relative overflow-hidden animate-[slideUp_0.2s_ease-out]"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-ink">Hudud sozlamalari</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {zone.neighborhood.name} · {zone.neighborhood.district}
            </p>
          </div>
          <button
            onClick={() => onClose(false)}
            className="p-2 rounded-lg bg-overlay text-slate-400 hover:text-ink transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {formError && (
          <div className="mb-4 flex gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs items-center">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
              Yetkazib berish narxi
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Standart narx qo'llanadi"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-edge focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
              Taxminiy yetkazish vaqti (daqiqa)
            </label>
            <input
              type="number"
              min="0"
              placeholder="Taxminiy vaqt kiritilmagan"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-950 border border-edge focus:border-brand/40 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition duration-150"
            />
          </div>

          <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-edge">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-300">Faol holatda</span>
              <span className="text-[10px] text-slate-500">Nofaol hududga buyurtma qabul qilinmaydi</span>
            </div>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-brand focus:ring-0 focus:ring-offset-0 rounded bg-slate-900 border-edge cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-edge">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="flex-1 py-2.5 rounded-xl border border-edge-strong text-slate-400 hover:text-ink hover:bg-overlay transition duration-150 font-bold text-xs cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-xs shadow-lg shadow-brand/20 transition duration-150 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Saqlash</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
