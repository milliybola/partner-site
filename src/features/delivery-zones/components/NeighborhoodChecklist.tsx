import React from 'react';
import { MapPin, CheckCircle2, Circle } from 'lucide-react';
import type { Neighborhood, PartnerDeliveryZone } from '../services/deliveryZonesApi';

interface NeighborhoodChecklistProps {
  neighborhoods: Neighborhood[];
  savedZonesByUuid: Map<string, PartnerDeliveryZone>;
  pendingUuids: Set<string>;
  onToggle: (uuid: string) => void;
}

export const NeighborhoodChecklist: React.FC<NeighborhoodChecklistProps> = ({
  neighborhoods,
  savedZonesByUuid,
  pendingUuids,
  onToggle,
}) => {
  if (neighborhoods.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-edge rounded-2xl text-slate-500 text-xs">
        Mahallalar topilmadi.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
      {neighborhoods.map((n) => {
        const saved = savedZonesByUuid.get(n.uuid);
        const isPending = pendingUuids.has(n.uuid);

        let statusPill: React.ReactNode = null;
        if (saved) {
          statusPill = (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${saved.is_active
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
              {saved.is_active ? "Qo'shilgan" : 'Nofaol'}
            </span>
          );
        } else if (isPending) {
          statusPill = (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Tanlandi
            </span>
          );
        }

        return (
          <button
            key={n.uuid}
            type="button"
            onClick={() => onToggle(n.uuid)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-edge hover:border-edge-strong transition text-left cursor-pointer"
          >
            {saved || isPending ? (
              <CheckCircle2 className={`w-4 h-4 shrink-0 ${saved ? (saved.is_active ? 'text-emerald-400' : 'text-amber-400') : 'text-sky-400'}`} />
            ) : (
              <Circle className="w-4 h-4 shrink-0 text-slate-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink text-sm truncate">{n.name}</p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {n.district}
              </p>
            </div>
            {statusPill}
          </button>
        );
      })}
    </div>
  );
};
