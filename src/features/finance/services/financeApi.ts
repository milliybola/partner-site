import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export const financeApi = {
  exportFinanceExcel: async (period: 'today' | 'this_week' | 'this_month' | 'overall'): Promise<Blob> => {
    const periodMap: Record<string, string> = {
      today: 'day',
      this_week: 'week',
      this_month: 'month',
      overall: 'all',
    };
    const backendPeriod = periodMap[period] || period;
    const response = await apiClient.get<Blob>(`${ENDPOINTS.FINANCE.EXPORT}?period=${backendPeriod}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
