import React from 'react';
import { Check, MapPin } from 'lucide-react';
import type { Neighborhood, PartnerDeliveryZone } from '../services/deliveryZonesApi';
import { Badge, EmptyState } from '../../../core/ui';

interface NeighborhoodChecklistProps {
  neighborhoods: Neighborhood[];
  savedZonesByUuid: Map<string, PartnerDeliveryZone>;
  pendingUuids: Set<string>;
  onToggle: (uuid: string) => void;
}

export const NeighborhoodChecklist: React.FC<NeighborhoodChecklistProps> = ({ neighborhoods, savedZonesByUuid, pendingUuids, onToggle }) => {
  if (neighborhoods.length === 0) {
    return <EmptyState icon={<MapPin className="w-7 h-7" />} title="Mahallalar topilmadi" description="Tuman yoki qidiruv so'zini o'zgartirib ko'ring." className="py-8" />;
  }

  return (
    <ul className="divide-y divide-edge">
      {neighborhoods.map((n) => {
        const saved = savedZonesByUuid.get(n.uuid);
        const isPending = pendingUuids.has(n.uuid);
        const checked = !!saved || isPending;
        return (
          <li key={n.uuid}>
            <button
              type="button"
              onClick={() => onToggle(n.uuid)}
              aria-pressed={checked}
              className="w-full min-h-[56px] flex items-center gap-3 px-1 py-2.5 text-left cursor-pointer hover:bg-surface2 rounded-xl"
            >
              <span
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border-2 transition-colors ${
                  saved
                    ? saved.is_active
                      ? 'bg-brand-bright border-brand-bright text-white'
                      : 'bg-danger-soft border-danger/40 text-danger-ink'
                    : isPending
                      ? 'bg-gold border-gold text-ink'
                      : 'border-edge-strong bg-surface'
                }`}
              >
                {checked && <Check className="w-4 h-4" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink truncate">{n.name}</span>
                <span className="block text-[12px] text-muted truncate">{n.district}</span>
              </span>
              {saved ? (
                <Badge tone={saved.is_active ? 'success' : 'danger'}>{saved.is_active ? "Qo'shilgan" : 'Nofaol'}</Badge>
              ) : isPending ? (
                <Badge tone="gold">Tanlandi</Badge>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
