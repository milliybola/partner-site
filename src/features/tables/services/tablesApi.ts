import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';

export interface TableCurrentOrderItem {
  uuid: string;
  product_uuid: string;
  product_name: string;
  quantity: number;
  price_at_time_of_order: string | number;
  total_price: number;
}

export interface TableCurrentOrder {
  uuid: string;
  order_number: string;
  status: string;
  status_display: string;
  delivery_type: string;
  payment_method: string;
  is_paid: boolean;
  total_price: string | number;
  waiter_name: string | null;
  items: TableCurrentOrderItem[];
  created_at: string;
}

export interface TableModel {
  uuid: string;
  table_number: string;
  capacity: number;
  status: TableStatus;
  status_display?: string;
  notes?: string;
  is_active?: boolean;
  display_order?: number;
  partner_name?: string;
  filial_uuid?: string;
  current_order?: TableCurrentOrder | null;
  /** Stol QR havolasi (token bilan). Tarifda stol QR menyusi bo'lmasa — null */
  qr_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TableBillOrder {
  uuid: string;
  order_number: string | null;
  status: string;
  status_display: string;
  created_at: string;
  is_paid: boolean;
  /** Tasdiqlangan va hali to'lanmagan: kassada to'lanadi */
  billable: boolean;
  order_source: string;
  payment_method: string;
  guest_name: string | null;
  waiter_name: string | null;
  items: Array<{ name: string; quantity: number; free_quantity: number; line_total: number | string }>;
  total_price: number | string;
}

/** Stolning joriy seansi hisobi (kassa uchun). Ochiq seans yo'q bo'lsa session = null. */
export interface TableBill {
  table_uuid: string;
  table_number: string;
  session: { uuid: string; opened_at: string } | null;
  orders: TableBillOrder[];
  bill: { subtotal: number | string; service_charge_amount: number | string; total: number | string; orders_count: number };
}

export interface TablesListResponse {
  success?: boolean;
  count?: number;
  data?: TableModel[];
  results?: TableModel[];
}

export interface TableDetailResponse {
  success?: boolean;
  message?: string;
  data?: TableModel;
  uuid?: string;
  table_number?: string;
  capacity?: number;
  status?: TableStatus;
}

export interface BulkImportPayload {
  tables: Array<{
    table_number: string;
    capacity: number;
    notes?: string;
    is_active?: boolean;
  }>;
}

export interface BulkImportResponse {
  success: boolean;
  message: string;
  created: number;
  failed: number;
  data: TableModel[];
  errors: string[];
}

export const tablesApi = {
  getTables: async (): Promise<TableModel[]> => {
    const response = await apiClient.get<TablesListResponse>(ENDPOINTS.TABLES.BASE);
    if (response.data?.results) {
      return response.data.results;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.data || [];
  },

  getAvailableTables: async (): Promise<TableModel[]> => {
    const response = await apiClient.get<TablesListResponse>(ENDPOINTS.TABLES.AVAILABLE);
    if (response.data?.results) {
      return response.data.results;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data?.data || [];
  },

  createTable: async (payload: Partial<TableModel>): Promise<TableModel> => {
    const response = await apiClient.post<any>(ENDPOINTS.TABLES.BASE, payload);
    return response.data?.data || response.data;
  },

  updateTable: async (uuid: string, payload: Partial<TableModel>): Promise<TableModel> => {
    const response = await apiClient.put<any>(ENDPOINTS.TABLES.DETAIL(uuid), payload);
    return response.data?.data || response.data;
  },

  updateTableStatus: async (uuid: string, status: TableStatus): Promise<TableModel> => {
    const response = await apiClient.patch<any>(ENDPOINTS.TABLES.UPDATE_STATUS(uuid), { status });
    return response.data?.data || response.data;
  },

  deleteTable: async (uuid: string): Promise<boolean> => {
    await apiClient.delete(ENDPOINTS.TABLES.DETAIL(uuid));
    return true;
  },

  /** QR'ni yangilash: eski QR kodlar ishlamay qoladi (faqat manager) */
  resetTableQr: async (uuid: string): Promise<TableModel> => {
    const response = await apiClient.post<any>(`${ENDPOINTS.TABLES.DETAIL(uuid)}qr-reset/`);
    return response.data?.data || response.data;
  },

  /** Stolning joriy seansi hisobi: barcha buyurtmalar va jami */
  getTableBill: async (uuid: string): Promise<TableBill> => {
    const response = await apiClient.get<any>(`${ENDPOINTS.TABLES.DETAIL(uuid)}bill/`);
    return response.data?.data;
  },

  /** Hisobni kassada to'lash. orderUuids berilmasa — butun stol; berilsa — faqat shu buyurtmalar (bo'lib to'lash) */
  payTableBill: async (uuid: string, paymentMethod: string, orderUuids?: string[]): Promise<TableBill> => {
    const response = await apiClient.post<any>(`${ENDPOINTS.TABLES.DETAIL(uuid)}bill/pay/`, {
      payment_method: paymentMethod,
      ...(orderUuids ? { order_uuids: orderUuids } : {}),
    });
    return response.data?.data;
  },

  bulkImportTables: async (payload: BulkImportPayload): Promise<BulkImportResponse> => {
    const response = await apiClient.post<BulkImportResponse>(ENDPOINTS.TABLES.BULK_IMPORT, payload);
    return response.data;
  },
};
