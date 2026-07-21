import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface CourierVehicleInfo {
  transport_type?: string;
  brand?: string;
  license_plate?: string;
}

export interface CourierModel {
  uuid: string;
  first_name: string;
  last_name: string;
  phone: string;
  telegram_id?: string;
  status?: string;
  is_active: boolean;
  service_types?: string;
  vehicle_info?: CourierVehicleInfo;
  filial_uuid?: string;
  filial_name?: string;
  created_at?: string;
}

export interface CouriersListResponse {
  success?: boolean;
  count?: number;
  data?: CourierModel[];
  results?: CourierModel[];
}

export interface CourierDetailResponse {
  success?: boolean;
  message?: string;
  data?: CourierModel;
}

export interface CreateCourierPayload {
  first_name: string;
  last_name: string;
  phone: string;
  password: string;
  telegram_id?: string;
  service_types?: string;
  transport_type?: string;
  vehicle_brand?: string;
  license_plate?: string;
  filial_uuid?: string;
  is_active?: boolean;
}

export interface UpdateCourierPayload {
  first_name?: string;
  last_name?: string;
  phone?: string;
  password?: string;
  telegram_id?: string;
  service_types?: string;
  transport_type?: string;
  vehicle_brand?: string;
  license_plate?: string;
  filial_uuid?: string;
  is_active?: boolean;
}

export interface CourierFilters {
  filial_uuid?: string;
  status?: string;
  search?: string;
}

export const couriersApi = {
  getCouriers: async (filters?: CourierFilters): Promise<CourierModel[]> => {
    const params: Record<string, string> = {};
    if (filters?.filial_uuid) params.filial_uuid = filters.filial_uuid;
    if (filters?.status) params.status = filters.status;
    if (filters?.search) params.search = filters.search;

    const response = await apiClient.get<CouriersListResponse>(ENDPOINTS.COURIERS.BASE, { params });
    if (response.data?.results) {
      return response.data.results;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.data || [];
  },

  getCourier: async (uuid: string): Promise<CourierModel> => {
    const response = await apiClient.get<CourierDetailResponse>(ENDPOINTS.COURIERS.DETAIL(uuid));
    return response.data?.data || (response.data as any);
  },

  createCourier: async (payload: CreateCourierPayload): Promise<CourierModel> => {
    const response = await apiClient.post<CourierDetailResponse>(ENDPOINTS.COURIERS.BASE, payload);
    return response.data?.data || (response.data as any);
  },

  updateCourier: async (uuid: string, payload: UpdateCourierPayload): Promise<CourierModel> => {
    const response = await apiClient.patch<CourierDetailResponse>(ENDPOINTS.COURIERS.DETAIL(uuid), payload);
    return response.data?.data || (response.data as any);
  },

  deleteCourier: async (uuid: string): Promise<void> => {
    await apiClient.delete(ENDPOINTS.COURIERS.DETAIL(uuid));
  },
};
