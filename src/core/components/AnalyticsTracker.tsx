import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPartner } from '../lib/session';
import { identifyUser, initAnalytics, trackPageView } from '../lib/analytics';

/** Har bir sahifa o'tishini Metrica'ga yuboradi va kim ishlayotganini (rol, muassasa, filial) belgilaydi. */
export const AnalyticsTracker: React.FC = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    const p = getPartner();
    if (p) {
      identifyUser(p.staff_uuid || p.uuid, {
        role: p.role || p.user_type || 'unknown',
        partner: p.partner_name || p.name || '',
        filial: p.current_filial?.filial_name || p.home_filial?.filial_name || '',
      });
    }
    trackPageView(pathname + search);
  }, [pathname, search]);

  return null;
};
