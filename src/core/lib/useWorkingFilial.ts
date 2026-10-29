import { useCallback, useEffect, useState } from 'react';
import { filialApi } from '../../features/orders/services/filialApi';
import type { PartnerFilial } from '../../features/orders/services/filialApi';
import { isOwner } from './session';
import { WORKING_FILIAL_EVENT, getWorkingFilial, setWorkingFilial } from './workingFilial';

/** Tanlangan ishlayotgan filial (faqat rahbar) + o'zgartirish. Boshqa oynada/tabda o'zgarsa ham yangilanadi. */
export const useWorkingFilial = (): [string | null, (uuid: string | null) => void] => {
  const [uuid, setUuid] = useState<string | null>(() => getWorkingFilial());
  useEffect(() => {
    const sync = () => setUuid(getWorkingFilial());
    window.addEventListener(WORKING_FILIAL_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WORKING_FILIAL_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const set = useCallback((next: string | null) => setWorkingFilial(next), []);
  return [uuid, set];
};

let cache: Promise<PartnerFilial[]> | null = null;
export const clearOwnerFilialsCache = () => {
  cache = null;
};

/** Rahbar uchun filiallar ro'yxati (bir marta yuklanadi). Xodimda bo'sh ro'yxat. Saqlangan filial endi yo'q bo'lsa tanlov tozalanadi. */
export const useOwnerFilials = (): { filials: PartnerFilial[]; loading: boolean; reload: () => void } => {
  const owner = isOwner();
  const [filials, setFilials] = useState<PartnerFilial[]>([]);
  const [loading, setLoading] = useState(owner);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    if (tick > 0) cache = null;
    cache = cache ?? filialApi.getFilials();
    cache
      .then((list) => {
        if (!alive) return;
        setFilials(list);
        const current = getWorkingFilial();
        if (current && !list.some((f) => f.uuid === current)) setWorkingFilial(null);
      })
      .catch(() => {
        cache = null;
        if (alive) setFilials([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [owner, tick]);

  return { filials, loading, reload: () => setTick((t) => t + 1) };
};
