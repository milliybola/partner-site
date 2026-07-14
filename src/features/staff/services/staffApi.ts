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
  today_stats?: {
    total_orders: number;
    completed_orders: number;
    revenue: number;
  };
  home_filial?: {
    uuid: string;
    filial_name: string;
  } | null;
  current_filial?: {
    uuid: string;
    filial_name: string;
  } | null;
}

export interface StaffPeriodStats {
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  total_revenue: number;
  cash_revenue: number;
  card_revenue: number;
}

export interface StaffDetailsResponse {
  success: boolean;
  data: StaffMember;
  statistics: {
    today: StaffPeriodStats;
    week: StaffPeriodStats;
    month: StaffPeriodStats;
    all: StaffPeriodStats;
  };
}

export interface StaffRatingMember {
  uuid: string;
  name: string;
  role: 'manager' | 'waiter';
  total_orders: number;
  completed_orders: number;
  total_revenue: number;
}

export interface StaffRatingResponse {
  success: boolean;
  period: string;
  data: StaffRatingMember[];
}

export interface CreateStaffPayload {
  name: string;
  phone: string;
  password?: string;
  role: 'manager' | 'waiter';
  is_active?: boolean;
  home_filial_uuid?: string;
  current_filial_uuid?: string;
}

export interface UpdateStaffPayload {
  name?: string;
  phone?: string;
  password?: string;
  role?: 'manager' | 'waiter';
  is_active?: boolean;
  home_filial_uuid?: string;
  current_filial_uuid?: string;
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
  },

  getStaffDetails: async (uuid: string): Promise<StaffDetailsResponse> => {
    const response = await apiClient.get<StaffDetailsResponse>(`${ENDPOINTS.STAFF.BASE}${uuid}/`);
    return response.data;
  },

  getStaffRating: async (period: 'today' | 'week' | 'month' | 'all' = 'month'): Promise<StaffRatingMember[]> => {
    const response = await apiClient.get<StaffRatingResponse>(`${ENDPOINTS.STAFF.STATISTICS}?period=${period}`);
    return response.data?.data || [];
  }
};
