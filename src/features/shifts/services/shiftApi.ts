import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface Shift {
  id: number;
  uuid: string;
  opened_at: string;
  closed_at: string | null;
  status: 'OPEN' | 'CLOSED';
  opening_balance: string;
  closing_balance: string | null;
  opened_by_name: string;
  closed_by_name: string | null;
  expected_closing_balance: number;
  total_orders_count: number;
  total_revenue: number;
  cash_revenue: number;
  card_revenue: number;
  delivery_revenue: number;
  pickup_revenue: number;
  dine_in_revenue: number;
}

export interface ShiftHistoryResponse {
  success: boolean;
  period: string;
  count: number;
  data: Shift[];
}

export interface ShiftCurrentResponse {
  success: boolean;
  message?: string;
  data: Shift | null;
}

export interface ShiftCloseResponse {
  success: boolean;
  message: string;
  requires_logout: boolean;
  data: Shift;
}

export const shiftApi = {
  getCurrentShift: async (): Promise<Shift | null> => {
    const response = await apiClient.get<ShiftCurrentResponse>(ENDPOINTS.SHIFTS.CURRENT);
    return response.data?.data || null;
  },

  openShift: async (openingBalance: number = 0): Promise<Shift> => {
    const response = await apiClient.post(ENDPOINTS.SHIFTS.OPEN, {
      opening_balance: openingBalance,
    });
    return response.data?.data || response.data;
  },

  closeShift: async (closingBalance: number): Promise<ShiftCloseResponse> => {
    const response = await apiClient.post<ShiftCloseResponse>(ENDPOINTS.SHIFTS.CLOSE, {
      closing_balance: closingBalance,
    });
    return response.data;
  },

  getShifts: async (period: 'day' | 'week' | 'month' | 'all' = 'day'): Promise<Shift[]> => {
    const response = await apiClient.get<ShiftHistoryResponse>(`${ENDPOINTS.SHIFTS.LIST}?period=${period}`);
    return response.data?.data || [];
  },

  exportShiftsExcel: async (period: 'day' | 'week' | 'month' | 'all' = 'day'): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`${ENDPOINTS.SHIFTS.EXPORT}?period=${period}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
