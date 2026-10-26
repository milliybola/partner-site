import apiClient from '../../core/api/client';

/** Hamkor telefonidagi ilova yuborgan qo'ng'iroq yozuvi. Shartnoma: API_CONTRACT_CALLS_PAYMENTS.md §1 */
export type CallStatus = 'RINGING' | 'ENDED' | 'MISSED';

export interface IncomingCall {
  uuid: string;
  phone: string;
  customer_name: string | null;
  orders_count: number;
  last_order_at: string | null;
  status: CallStatus;
  duration_seconds: number;
  created_at: string;
  ended_at: string | null;
  is_open: boolean;
}

/** Realtime (WebSocket) xabarlari */
export interface IncomingCallEvent {
  type: 'incoming_call' | 'call_update';
  call: IncomingCall;
}

export const callsApi = {
  listOpen: async (limit = 20): Promise<IncomingCall[]> => {
    const res = await apiClient.get('partner/calls/', { params: { open: 1, limit } });
    const d = res.data?.data ?? res.data;
    return Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : [];
  },
  dismiss: async (uuid: string): Promise<void> => {
    await apiClient.post(`partner/calls/${uuid}/dismiss/`);
  },
  resolve: async (uuid: string, orderUuid?: string): Promise<void> => {
    await apiClient.post(`partner/calls/${uuid}/resolve/`, orderUuid ? { order_uuid: orderUuid } : {});
  },
};
