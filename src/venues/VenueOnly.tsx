import React from 'react';
import { Navigate } from 'react-router-dom';
import { useVenue } from './index';
import type { VenueKind } from './index';

/** Sahifa faqat bitta hamkor turiga tegishli (masalan ombor — faqat do'kon): boshqasi bosh sahifaga qaytariladi. */
export const VenueOnly: React.FC<{ kind: VenueKind; children: React.ReactElement }> = ({ kind, children }) => {
  const venue = useVenue();
  return venue.kind === kind ? children : <Navigate to="/orders" replace />;
};
