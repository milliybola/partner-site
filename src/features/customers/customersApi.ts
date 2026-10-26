import apiClient from '../../core/api/client';

/** Hamkorning avvalgi buyurtmalaridan yig'ilgan mijoz (telefon bo'yicha). Shartnoma: API_CONTRACT_CALLS_PAYMENTS.md §2 */
export interface Customer {
  phone: string;
  name: string | null;
  orders_count: number;
  last_order_at: string | null;
}

export const customersApi = {
  search: async (search: string, limit = 8): Promise<Customer[]> => {
    const res = await apiClient.get('partner/customers/', { params: { search: search || undefined, limit } });
    const d = res.data?.data ?? res.data;
    return Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : [];
  },

  /** Topilmasa ham 200 — `name` null. */
  lookup: async (phone: string): Promise<Customer | null> => {
    const res = await apiClient.get('partner/customers/lookup/', { params: { phone } });
    return (res.data?.data ?? null) as Customer | null;
  },
};
