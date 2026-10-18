import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import { Button, Spinner } from '../../../core/ui';

declare global {
  interface Window {
    ymaps: any;
  }
}

const DEFAULT_CENTER: [number, number] = [41.311081, 69.240562]; // Toshkent

let ymapsPromise: Promise<any> | null = null;
/** Loads Yandex Maps 2.1 once per app session. */
export const loadYmaps = (): Promise<any> => {
  if (window.ymaps?.Map) return Promise.resolve(window.ymaps);
  if (ymapsPromise) return ymapsPromise;
  ymapsPromise = new Promise((resolve, reject) => {
    const done = () => window.ymaps.ready(() => resolve(window.ymaps));
    if (window.ymaps) return done();
    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?lang=uz_UZ';
    script.async = true;
    script.onload = done;
    script.onerror = () => {
      ymapsPromise = null;
      reject(new Error('Yandex xarita yuklanmadi'));
    };
    document.body.appendChild(script);
  });
  return ymapsPromise;
};

const toNum = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/**
 * Map + coordinates picker. Tap on the map or drag the pin when `editable`.
 */
export const YandexLocationPicker: React.FC<{
  lat: number | string | null | undefined;
  lng: number | string | null | undefined;
  onChange?: (lat: number, lng: number) => void;
  editable?: boolean;
  height?: number;
  hint?: string;
}> = ({ lat, lng, onChange, editable = false, height = 280, hint }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const pinRef = useRef<any>(null);
  const editableRef = useRef(editable);
  const onChangeRef = useRef(onChange);
  editableRef.current = editable;
  onChangeRef.current = onChange;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locating, setLocating] = useState(false);

  // Init once
  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((ymaps) => {
        if (cancelled || !containerRef.current) return;
        const la = toNum(lat);
        const lo = toNum(lng);
        const center: [number, number] = la !== null && lo !== null ? [la, lo] : DEFAULT_CENTER;
        const map = new ymaps.Map(containerRef.current, { center, zoom: la !== null ? 15 : 12, controls: ['zoomControl'] });
        const pin = new ymaps.Placemark(center, {}, { draggable: editableRef.current, preset: 'islands#greenDotIcon' });
        const emit = (coords: number[]) => {
          onChangeRef.current?.(parseFloat(coords[0].toFixed(6)), parseFloat(coords[1].toFixed(6)));
        };
        pin.events.add('dragend', () => emit(pin.geometry.getCoordinates()));
        map.events.add('click', (e: any) => {
          if (!editableRef.current) return;
          const coords = e.get('coords');
          pin.geometry.setCoordinates(coords);
          emit(coords);
        });
        map.geoObjects.add(pin);
        // Keep page scroll usable on phones: one-finger drag scrolls the page.
        try {
          map.behaviors.disable('scrollZoom');
          if (window.matchMedia('(pointer: coarse)').matches) map.behaviors.disable('drag');
        } catch {
          /* ignore */
        }
        mapRef.current = map;
        pinRef.current = pin;
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
      try {
        mapRef.current?.destroy();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      pinRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to editability
  useEffect(() => {
    pinRef.current?.options.set('draggable', editable);
    try {
      if (editable) mapRef.current?.behaviors.enable('drag');
    } catch {
      /* ignore */
    }
  }, [editable, status]);

  // React to external coordinate changes
  useEffect(() => {
    const la = toNum(lat);
    const lo = toNum(lng);
    if (la === null || lo === null || !pinRef.current || !mapRef.current) return;
    const cur = pinRef.current.geometry.getCoordinates();
    if (Math.abs(cur[0] - la) > 1e-7 || Math.abs(cur[1] - lo) > 1e-7) {
      pinRef.current.geometry.setCoordinates([la, lo]);
      mapRef.current.setCenter([la, lo]);
    }
  }, [lat, lng, status]);

  const detect = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChangeRef.current?.(parseFloat(pos.coords.latitude.toFixed(6)), parseFloat(pos.coords.longitude.toFixed(6)));
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl overflow-hidden border border-edge bg-field" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted text-[13px]">
            {status === 'loading' ? <Spinner /> : <MapPin className="w-6 h-6" />}
            {status === 'loading' ? 'Xarita yuklanmoqda...' : "Xaritani yuklab bo'lmadi. Koordinatalarni qo'lda kiriting."}
          </div>
        )}
      </div>
      {editable && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-[12px] text-muted">{hint || "Xaritaga bosing yoki belgini suring."}</p>
          <Button variant="outline" size="md" icon={<Crosshair className="w-4 h-4" />} loading={locating} onClick={detect}>
            Joriy joylashuv
          </Button>
        </div>
      )}
    </div>
  );
};
