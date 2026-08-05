import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface Neighborhood {
  uuid: string;
  name: string;
  district: string;
  center: [number, number] | null;
  coordinates: number[][][] | null;
  order: number;
}

export interface NeighborhoodsData {
  count: number;
  districts: string[];
  neighborhoods: Neighborhood[];
}

export interface PartnerDeliveryZone {
  uuid: string;
  neighborhood: Neighborhood;
  filial_name: string;
  delivery_fee: string | null;
  estimated_minutes: number | null;
  is_active: boolean;
}

export interface DeliveryZoneBulkPayload {
  neighborhood_uuids?: string[];
  filial_uuid?: string | null;
  delivery_fee?: string | null;
  estimated_minutes?: number | null;
}

export interface DeliveryZonePatchPayload {
  delivery_fee?: string | null;
  estimated_minutes?: number | null;
  is_active?: boolean;
}

// Extracts an array of delivery zones from any of the response envelope shapes this
// backend is known to use: a bare array, {results:[...]}, {zones:[...]}, {data:[...]},
// {data:{results:[...]}}, or {data:{zones:[...]}} (the confirmed real shape for the
// filial-scoped list: {success, data:{count, filial_uuid, zones:[...]}}).
const extractZonesList = (data: any): PartnerDeliveryZone[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.zones)) return data.zones;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.data?.results)) return data.data.results;
  if (Array.isArray(data?.data?.zones)) return data.data.zones;
  return [];
};

export const deliveryZonesApi = {
  getNeighborhoods: async (): Promise<NeighborhoodsData> => {
    const response = await apiClient.get(ENDPOINTS.DELIVERY_ZONES.NEIGHBORHOODS);
    return response.data?.data || { count: 0, districts: [], neighborhoods: [] };
  },

  getZones: async (filialUuid?: string): Promise<PartnerDeliveryZone[]> => {
    const response = await apiClient.get(ENDPOINTS.DELIVERY_ZONES.BASE, {
      params: filialUuid ? { filial_uuid: filialUuid } : undefined,
    });
    return extractZonesList(response.data);
  },

  bulkAddZones: async (payload: DeliveryZoneBulkPayload): Promise<PartnerDeliveryZone[]> => {
    const response = await apiClient.post(ENDPOINTS.DELIVERY_ZONES.BULK, payload);
    return extractZonesList(response.data);
  },

  updateZone: async (uuid: string, payload: DeliveryZonePatchPayload): Promise<PartnerDeliveryZone> => {
    const response = await apiClient.patch(ENDPOINTS.DELIVERY_ZONES.DETAIL(uuid), payload);
    return response.data?.data || response.data;
  },

  deleteZone: async (uuid: string): Promise<void> => {
    await apiClient.delete(ENDPOINTS.DELIVERY_ZONES.DETAIL(uuid));
  },

  clearZones: async (): Promise<void> => {
    await apiClient.delete(ENDPOINTS.DELIVERY_ZONES.CLEAR);
  },
};
