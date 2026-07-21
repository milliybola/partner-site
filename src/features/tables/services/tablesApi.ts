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
  created_at?: string;
  updated_at?: string;
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

  bulkImportTables: async (payload: BulkImportPayload): Promise<BulkImportResponse> => {
    const response = await apiClient.post<BulkImportResponse>(ENDPOINTS.TABLES.BULK_IMPORT, payload);
    return response.data;
  },
};
