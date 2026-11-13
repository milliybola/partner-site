import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';
import { getWorkingFilial } from '../../../core/lib/workingFilial';

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
  /** Q42: savdo raqamlari faqat to'langanlar; to'lanmaganlar alohida (eski backendda yo'q bo'lishi mumkin) */
  unpaid_orders_count?: number;
  unpaid_total?: number | string;
  /** A3: smena filialga bog'langan (eski backendda yo'q bo'lishi mumkin) */
  filial_uuid?: string | null;
  filial_name?: string | null;
  /**
   * A31: yopilgan smenalardagi to'lov keyin bekor qilinsa / usuli o'zgarsa — shu smenaga tushgan farq (minus bo'lishi
   * mumkin). Savdo, naqd va kutilgan kassaga backendda allaqachon qo'shilgan. Eski backendda yo'q.
   */
  adjustments_count?: number;
  adjustments_total?: number | string;
  adjustments_cash?: number | string;
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

/** Smena holati o'zgardi yoki yangilandi (detail: Shift | null) — kassa pastidagi holat qatori tinglaydi */
export const SHIFT_EVENT = 'milliygo:shift';
const emitShift = (shift: Shift | null) => window.dispatchEvent(new CustomEvent<Shift | null>(SHIFT_EVENT, { detail: shift }));

/**
 * A3: smena filial bo'yicha. Filial berilmasa — rahbar tanlagan ishlayotgan filial (xodimda doim null:
 * server uni o'z filialiga qulflaydi, yuborilgan filial_uuid e'tiborsiz). Ikkalasi ham yo'q — server asosiy filialni oladi.
 */
const filialOf = (filialUuid?: string | null) => filialUuid || getWorkingFilial() || undefined;

export const shiftApi = {
  /** `silent`: boshqa (ishlayotgan bo'lmagan) filial so'rovi — kassa pastidagi holat qatoriga tegmaydi */
  getCurrentShift: async (filialUuid?: string | null, opts?: { silent?: boolean }): Promise<Shift | null> => {
    const filial = filialOf(filialUuid);
    const response = await apiClient.get<ShiftCurrentResponse>(ENDPOINTS.SHIFTS.CURRENT, {
      params: filial ? { filial_uuid: filial } : undefined,
    });
    const shift = response.data?.data || null;
    if (!opts?.silent) emitShift(shift);
    return shift;
  },

  openShift: async (openingBalance: number = 0, filialUuid?: string | null): Promise<Shift> => {
    const filial = filialOf(filialUuid);
    const response = await apiClient.post(ENDPOINTS.SHIFTS.OPEN, {
      opening_balance: openingBalance,
      ...(filial ? { filial_uuid: filial } : {}),
    });
    const shift: Shift = response.data?.data || response.data;
    if (shift?.uuid) emitShift(shift);
    return shift;
  },

  /** Yopiladigan smena filiali aniq beriladi (ko'rsatilgan smena) — boshqa filial smenasi yopilib qolmasin */
  closeShift: async (closingBalance: number, filialUuid?: string | null): Promise<ShiftCloseResponse> => {
    const filial = filialOf(filialUuid);
    const response = await apiClient.post<ShiftCloseResponse>(ENDPOINTS.SHIFTS.CLOSE, {
      closing_balance: closingBalance,
      ...(filial ? { filial_uuid: filial } : {}),
    });
    emitShift(null);
    return response.data;
  },

  /** Tarix: filial berilmasa — barcha filiallar (rahbar ishlayotgan filial tanlagan bo'lsa — o'sha) */
  getShifts: async (period: 'day' | 'week' | 'month' | 'all' = 'day', filialUuid?: string | null): Promise<Shift[]> => {
    const filial = filialOf(filialUuid);
    const response = await apiClient.get<ShiftHistoryResponse>(ENDPOINTS.SHIFTS.LIST, {
      params: { period, ...(filial ? { filial_uuid: filial } : {}) },
    });
    return response.data?.data || [];
  },

  exportShiftsExcel: async (period: 'day' | 'week' | 'month' | 'all' = 'day', filialUuid?: string | null): Promise<Blob> => {
    const periodMap: Record<string, string> = {
      day: 'today',
      week: 'this_week',
      month: 'this_month',
      all: 'overall'
    };
    const backendPeriod = periodMap[period] || period;
    const filial = filialOf(filialUuid);
    const response = await apiClient.get<Blob>(ENDPOINTS.SHIFTS.EXPORT, {
      params: { period: backendPeriod, ...(filial ? { filial_uuid: filial } : {}) },
      responseType: 'blob',
    });
    return response.data;
  },
};
