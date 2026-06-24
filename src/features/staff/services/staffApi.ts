import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface StaffMember {
  uuid: string;
  name: string;
  phone: string;
  role: 'manager' | 'waiter';
  is_active: boolean;
  created_at?: string;
  partner_uuid?: string;
  partner_name?: string;
}

export interface CreateStaffPayload {
  name: string;
  phone: string;
  password?: string;
  role: 'manager' | 'waiter';
  is_active?: boolean;
}

export interface UpdateStaffPayload {
  name?: string;
  phone?: string;
  password?: string;
  role?: 'manager' | 'waiter';
  is_active?: boolean;
}

export const staffApi = {
  getStaff: async (): Promise<StaffMember[]> => {
    const response = await apiClient.get(ENDPOINTS.STAFF.BASE);
    if (response.data?.success && Array.isArray(response.data?.data)) {
      return response.data.data;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.results || response.data?.data?.results || [];
  },

  createStaff: async (payload: CreateStaffPayload): Promise<StaffMember> => {
    const response = await apiClient.post(ENDPOINTS.STAFF.BASE, payload);
    return response.data?.data || response.data;
  },

  updateStaff: async (uuid: string, payload: UpdateStaffPayload): Promise<StaffMember> => {
    const response = await apiClient.patch(`${ENDPOINTS.STAFF.BASE}${uuid}/`, payload);
    return response.data?.data || response.data;
  },

  deleteStaff: async (uuid: string): Promise<void> => {
    await apiClient.delete(`${ENDPOINTS.STAFF.BASE}${uuid}/`);
  }
};
