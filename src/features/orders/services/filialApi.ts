import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface PartnerFilial {
  uuid: string;
  partner?: string;
  filial_name: string;
  filial_status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  address?: string;
  phone?: string;
  location_lat?: number;
  location_long?: number;
  manager?: string | null;
  manager_info?: {
    uuid: string;
    name: string;
    phone: string;
    avatar?: string | null;
    role?: string;
  } | null;
  is_main?: boolean;
  opening_hours?: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
    from_hour: string;
    to_hour: string;
  } | null;
}

export const filialApi = {
  getFilials: async (): Promise<PartnerFilial[]> => {
    const response = await apiClient.get(ENDPOINTS.FILIALS.BASE);
    if (response.data?.success && Array.isArray(response.data?.data)) {
      return response.data.data;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.results || response.data?.data?.results || [];
  },

  getFilialDetail: async (uuid: string): Promise<PartnerFilial> => {
    const response = await apiClient.get(ENDPOINTS.FILIALS.DETAIL(uuid));
    return response.data?.data || response.data;
  },

  createFilial: async (payload: Omit<PartnerFilial, 'uuid'>): Promise<PartnerFilial> => {
    const response = await apiClient.post(ENDPOINTS.FILIALS.BASE, payload);
    return response.data?.data || response.data;
  },

  updateFilial: async (uuid: string, payload: Partial<Omit<PartnerFilial, 'uuid'>>): Promise<PartnerFilial> => {
    const response = await apiClient.patch(ENDPOINTS.FILIALS.DETAIL(uuid), payload);
    return response.data?.data || response.data;
  },

  deleteFilial: async (uuid: string): Promise<void> => {
    await apiClient.delete(ENDPOINTS.FILIALS.DETAIL(uuid));
  },

  assignManager: async (filialUuid: string, managerUuid: string): Promise<any> => {
    const response = await apiClient.post(ENDPOINTS.FILIALS.ASSIGN_MANAGER(filialUuid), {
      manager_uuid: managerUuid
    });
    return response.data;
  },

  switchFilial: async (staffUuid: string, filialUuid: string | null): Promise<any> => {
    const response = await apiClient.post(ENDPOINTS.STAFF.SWITCH_FILIAL, {
      staff_uuid: staffUuid,
      filial_uuid: filialUuid
    });
    return response.data;
  }
};
