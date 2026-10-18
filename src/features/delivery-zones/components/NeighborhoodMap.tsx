import React, { useMemo, useState, useEffect } from 'react';
import { YMaps, Map as YandexMap, Polygon } from 'react-yandex-maps';
import type { Neighborhood, PartnerDeliveryZone } from '../services/deliveryZonesApi';

// react-yandex-maps' bundled types omit 'uz_UZ' from the YMaps `query.lang` union, but the
// underlying Yandex Maps API accepts it (same as ProfilePage.tsx's raw script usage).
const YMAPS_QUERY = { lang: 'uz_UZ' } as unknown as { lang: 'ru_RU' };

interface NeighborhoodMapProps {
  neighborhoods: Neighborhood[];
  savedZonesByUuid: Map<string, PartnerDeliveryZone>;
  pendingUuids: Set<string>;
  centerFallback: [number, number];
  onToggle: (uuid: string) => void;
}

// Neighborhood.coordinates arrives as GeoJSON-style rings, each point [lng, lat].
// Yandex Maps expects [lat, lng]. Neighborhood.center is already [lat, lng] and
// must NOT be flipped — only the polygon rings need this conversion.
//
// Real backend data isn't always a clean number[][][]: some records have been seen
// with an extra nesting level (MultiPolygon-shaped), missing points, or non-numeric
// values. Feeding that straight into ymaps.Polygon doesn't just fail to draw that one
// shape — it can corrupt the whole WebGL vector renderer and paint the entire map
// canvas solid black. So every ring is validated before flipping; anything malformed
// is dropped (and logged) instead of handed to Yandex.
const flipValidRings = (rings: unknown): number[][][] | null => {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const flipped: number[][][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const flippedRing: number[][] = [];
    for (const point of ring) {
      if (!Array.isArray(point) || point.length !== 2) return null;
      const [lng, lat] = point;
      if (typeof lng !== 'number' || typeof lat !== 'number' || !isFinite(lng) || !isFinite(lat)) return null;
      flippedRing.push([lat, lng]);
    }
    flipped.push(flippedRing);
  }
  return flipped;
};

const POLYGON_STYLES = {
  idle: { fillColor: '#9CA3AF', fillOpacity: 0.12, strokeColor: '#6B7280', strokeWidth: 1, strokeOpacity: 0.6, cursor: 'pointer' },
  pending: { fillColor: '#F5B400', fillOpacity: 0.35, strokeColor: '#D97706', strokeWidth: 2, strokeOpacity: 0.9, cursor: 'pointer' },
  active: { fillColor: '#16A34A', fillOpacity: 0.35, strokeColor: '#15803D', strokeWidth: 2, strokeOpacity: 0.9, cursor: 'pointer' },
  inactive: { fillColor: '#EF4444', fillOpacity: 0.18, strokeColor: '#EF4444', strokeWidth: 2, strokeOpacity: 0.9, strokeStyle: 'shortdash' as const, cursor: 'pointer' },
};

const LEGEND: { color: string; label: string }[] = [
  { color: '#16A34A', label: 'Faol hudud' },
  { color: '#EF4444', label: 'Nofaol' },
  { color: '#F5B400', label: 'Tanlangan' },
  { color: '#9CA3AF', label: "Qo'shilmagan" },
];

const MapLegend: React.FC = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 border-t border-edge text-[12px] text-muted">
    {LEGEND.map((l) => (
      <span key={l.label} className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded" style={{ background: l.color, opacity: 0.75 }} />
        {l.label}
      </span>
    ))}
  </div>
);

export const NeighborhoodMap: React.FC<NeighborhoodMapProps> = ({
  neighborhoods,
  savedZonesByUuid,
  pendingUuids,
  centerFallback,
  onToggle,
}) => {
  const [mapInstance, setMapInstance] = useState<any>(null);

  const flipped = useMemo(() => {
    const result: { neighborhood: Neighborhood; rings: number[][][] }[] = [];
    neighborhoods.forEach((n) => {
      const rings = flipValidRings(n.coordinates);
      if (rings) {
        result.push({ neighborhood: n, rings });
      } else {
        if (import.meta.env.DEV) console.warn('Skipping neighborhood with invalid polygon coordinates:', n.uuid, n.name);
      }
    });
    return result;
  }, [neighborhoods]);

  // A fixed zoom level is either too far out to see individual neighborhood blocks or
  // too close to show the whole district, depending on how spread out it is — so once
  // the map is ready, fit its viewport to the actual bounds of the polygons being shown
  // (re-running whenever the visible set changes, e.g. switching districts).
  useEffect(() => {
    if (!mapInstance || flipped.length === 0) return;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    flipped.forEach(({ rings }) => {
      rings.forEach((ring) => {
        ring.forEach(([lat, lng]) => {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        });
      });
    });
    if (isFinite(minLat) && isFinite(maxLat) && isFinite(minLng) && isFinite(maxLng)) {
      try {
        mapInstance.setBounds([[minLat, minLng], [maxLat, maxLng]], { checkZoomRange: true, zoomMargin: 40 });
      } catch (err) {
        console.warn('Failed to fit map bounds to neighborhoods:', err);
      }
    }
  }, [mapInstance, flipped]);

  return (
    <div className="rounded-2xl overflow-hidden border border-edge bg-surface">
      {/* Height comes from this wrapper (45vh on phones, 560px on desktop); width 100% keeps the map from causing horizontal scroll. */}
      <div className="relative isolate w-full h-[45vh] min-h-[280px] md:h-[560px] bg-field">
      <YMaps query={YMAPS_QUERY}>
        <YandexMap
          defaultState={{ center: centerFallback, zoom: 12 }}
          width="100%"
          height="100%"
          instanceRef={(inst: any) => { if (inst) setMapInstance(inst); }}
        >
          {flipped.map(({ neighborhood, rings }) => {
            const saved = savedZonesByUuid.get(neighborhood.uuid);
            const isPending = pendingUuids.has(neighborhood.uuid);
            const state = saved
              ? saved.is_active ? 'active' : 'inactive'
              : isPending ? 'pending' : 'idle';

            return (
              <Polygon
                key={neighborhood.uuid}
                geometry={rings}
                options={POLYGON_STYLES[state]}
                properties={{ hintContent: neighborhood.name }}
                onClick={() => onToggle(neighborhood.uuid)}
              />
            );
          })}
        </YandexMap>
      </YMaps>
      </div>
      <MapLegend />
      {neighborhoods.length === 0 && (
        <div className="p-4 text-center text-[13px] text-muted border-t border-edge">
          Ushbu tumanda mahallalar topilmadi.
        </div>
      )}
    </div>
  );
};
