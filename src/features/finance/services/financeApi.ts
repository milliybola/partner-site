import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export const financeApi = {
  exportFinanceExcel: async (period: 'today' | 'this_week' | 'this_month' | 'overall'): Promise<Blob> => {
    const response = await apiClient.get<Blob>(`${ENDPOINTS.FINANCE.EXPORT}?period=${period}`, {
      responseType: 'blob',
    });
    return response.data;
  },
};
