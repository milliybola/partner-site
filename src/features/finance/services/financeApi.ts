import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export type FinancePeriod = 'today' | 'this_week' | 'this_month' | 'overall';

// NOTE: this endpoint expects day/week/month/all, while partner/shifts/export/excel/
// is called with today/this_week/this_month/overall (see shiftApi). The two mappings
// are opposite — one of them is probably wrong; confirm with backend (API_GAPS.md).
const PERIOD_MAP: Record<FinancePeriod, string> = {
  today: 'day',
  this_week: 'week',
  this_month: 'month',
  overall: 'all',
};

export const financeApi = {
  exportFinanceExcel: async (period: FinancePeriod): Promise<Blob> => {
    const response = await apiClient.get<Blob>(ENDPOINTS.FINANCE.EXPORT, {
      params: { period: PERIOD_MAP[period] || period },
      responseType: 'blob',
    });
    const blob = response.data;
    // A JSON error body delivered as a blob would otherwise be saved as a broken .xlsx
    if (blob && blob.type && blob.type.includes('application/json')) {
      const text = await blob.text();
      let message = 'Hisobotni yaratib bo‘lmadi';
      try {
        const parsed = JSON.parse(text);
        message = parsed.message || parsed.detail || message;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    return blob;
  },
};
