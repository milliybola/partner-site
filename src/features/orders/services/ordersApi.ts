import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface OrderItem {
  uuid?: string;
  product?: {
    id?: number;
    uuid?: string;
    name: string;
    price: number | string;
    description?: string;
  } | null;
  quantity: number;
  price_at_time_of_order?: string | number;
  product_uuid?: string;
  product_name?: string;
  product_image?: string;
  line_total?: number | string;
  name?: string;
  /** Serverda hisoblangan narx tafsiloti (variantlar, aksiya, kg/qadoq) */
  unit?: 'PIECE' | 'KG';
  packaging_name?: string;
  options?: { group_name?: string; name: string; price_delta?: number | string }[];
  free_quantity?: number | string;
  discount_amount?: number | string;
  promotion_label?: string;
}

export interface Order {
  id: number;
  uuid: string;
  order_number?: string;
  status: 'PENDING' | 'SEARCHING_COURIER' | 'ACCEPTED' | 'REJECTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'ON_THE_WAY' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
  partner_uuid?: string;
  /** Buyurtma qaysi filialga tegishli (null — filialsiz) */
  filial_uuid?: string | null;
  filial_name?: string | null;
  contact_phone: string;
  contact_name?: string;
  address: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Faqat DELIVERY: NONE | REQUESTED | RECEIVED | HAS_POINT */
  location_status?: 'NONE' | 'REQUESTED' | 'RECEIVED' | 'HAS_POINT' | null;
  created_at: string;
  updated_at?: string;
  delivery_fee: number | string;
  total_price: number | string;
  /** Aksiya/chegirmalar yig'indisi (server hisoblaydi) */
  discount_amount?: number | string;
  payment?: string;
  payment_method?: string;
  payment_method_display?: string;
  order_source?: string;
  order_source_display?: string;
  courier_phone?: string;
  distance?: number;
  description?: string;
  reject_reason?: string | null;
  courier?: { first_name?: string; last_name?: string; full_name?: string; phone?: string } | null;
  is_paid?: boolean;
  table_number?: string | null;
  delivery_type?: string;
  items: OrderItem[];
}

export const getStatusSlug = (status: string): string => {
  switch (status) {
    case 'ACCEPTED':
      return 'accept';
    case 'REJECTED':
      return 'reject';
    case 'PREPARING':
      return 'preparing';
    case 'READY_FOR_PICKUP':
      return 'ready_for_pickup';
    default:
      return status.toLowerCase();
  }
};

export const ordersApi = {
  getOrders: async (filters?: { filialUuid?: string; fromDate?: string; toDate?: string }): Promise<Order[]> => {
    const config: any = {};
    const params: Record<string, string> = {};
    if (filters?.filialUuid) params.filial_uuid = filters.filialUuid;
    if (filters?.fromDate) params.from_date = filters.fromDate;
    if (filters?.toDate) params.to_date = filters.toDate;
    if (Object.keys(params).length > 0) {
      config.params = params;
    }
    const response = await apiClient.get(ENDPOINTS.ORDERS.LIST, config);
    // APIs might return results inside a 'results' field or direct array
    if (response.data.results) {
      return response.data.results;
    }
    if (Array.isArray(response.data)) {
      return response.data;
    }
    return response.data.data || [];
  },

  updateOrderStatus: async (orderUuid: string, status: string): Promise<any> => {
    const slug = getStatusSlug(status);
    const url = ENDPOINTS.ORDERS.UPDATE_STATUS(orderUuid, slug);
    const response = await apiClient.post(url);
    return response.data;
  },

  getOrderReceipt: async (orderUuid: string): Promise<any> => {
    const response = await apiClient.get(`orders/partner-pos/${orderUuid}/receipt/`);
    return response.data;
  },

  updateDeliveryInfo: async (
    orderUuid: string,
    payload: { address?: string; latitude?: number | null; longitude?: number | null; contact_name?: string; contact_phone?: string },
  ): Promise<Order> => {
    const response = await apiClient.patch(`orders/partner-pos/${orderUuid}/delivery-info/`, payload);
    return response.data?.data;
  },

  requestLocation: async (
    orderUuid: string,
  ): Promise<{ link: string; sms_sent: boolean; sms_error: string; sent_count: number; expires_at: string; location_status: Order['location_status'] }> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/request-location/`, {});
    return response.data?.data;
  },

  completeOrder: async (orderUuid: string, payment?: { payment_method: string; is_paid?: boolean; split_count?: number }): Promise<any> => {
    // Backend `complete`: payment_method berilsa to'lov va yakunlash BIR tranzaksiyada (yagona to'lov mantig'i).
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/complete/`, payment ?? undefined);
    return response.data;
  },

  /**
   * To'lovni qabul qilib yakunlash — bitta so'rovda. Server javobida `is_paid` true bo'lmasa (eski backend
   * `complete` ga to'lovni e'tiborsiz qoldiradi) — `mark-paid` bilan to'ldiriladi.
   */
  completeWithPayment: async (orderUuid: string, paymentMethod: string, splitCount = 1): Promise<any> => {
    const res = await ordersApi.completeOrder(orderUuid, {
      payment_method: paymentMethod,
      ...(splitCount > 1 ? { split_count: splitCount } : {}),
    });
    if (res?.is_paid !== true) {
      await ordersApi.markOrderPaid(orderUuid, { payment_method: paymentMethod, is_paid: true });
    }
    return res;
  },

  markOrderPaid: async (
    orderUuid: string,
    payload: { payment_method: string, is_paid: boolean }
  ): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/mark-paid/`, payload);
    return response.data;
  },

  // Assign one of the partner's own couriers directly — the order is accepted
  // immediately, no confirmation is awaited from the courier.
  assignOwnCourier: async (orderUuid: string, courierUuid: string): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/assign-own-courier/`, {
      courier_uuid: courierUuid,
    });
    return response.data;
  },

  // Push the order out to the global courier pool (used when the partner's own
  // couriers are busy/unavailable). Backend runs a 5-minute acceptance timer.
  dispatchGlobally: async (orderUuid: string): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/dispatch-globally/`);
    return response.data;
  },

  createOrder: async (payload: {
    description: string;
    address: string;
    contact_phone: string;
    latitude: string;
    longitude: string;
    items: PosItemInput[];
  }): Promise<any> => {
    const response = await apiClient.post(ENDPOINTS.ORDERS.LIST, payload);
    return response.data;
  },

  createDeliveryOrder: async (payload: {
    filial_uuid?: string;
    contact_phone?: string;
    contact_name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    payment_method: string;
    description: string;
    items: PosItemInput[];
  }): Promise<any> => {
    const response = await apiClient.post('orders/partner-pos/create-delivery/', payload);
    return response.data;
  },

  createPickupOrder: async (payload: {
    filial_uuid?: string;
    contact_phone?: string;
    contact_name?: string;
    payment_method: string;
    description?: string;
    items: PosItemInput[];
  }): Promise<any> => {
    const response = await apiClient.post('orders/partner-pos/create-pickup/', payload);
    return response.data;
  },

  createDineInOrder: async (payload: {
    table: string;
    payment_method: string;
    contact_phone?: string;
    contact_name?: string;
    description?: string;
    items: PosItemInput[];
  }): Promise<any> => {
    const response = await apiClient.post('orders/partner-pos/create-dine-in/', payload);
    return response.data;
  },

  managerLogin: async (payload: { phone: string; password: string }): Promise<{ access: string }> => {
    const response = await apiClient.post('partner/staff/login/', payload);
    return response.data;
  },

  getOrderItems: async (orderUuid: string, managerToken?: string): Promise<any> => {
    const config: any = {};
    if (managerToken) {
      config.headers = {
        Authorization: `Bearer ${managerToken}`,
      };
    }
    const response = await apiClient.get(`orders/partner-pos/${orderUuid}/items/`, config);
    return response.data;
  },

  addOrderItems: async (
    orderUuid: string,
    payload: { items: { product_uuid: string; quantity: number }[] },
    managerToken?: string
  ): Promise<any> => {
    const config: any = {};
    if (managerToken) {
      config.headers = {
        Authorization: `Bearer ${managerToken}`,
      };
    }
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/add-items/`, payload, config);
    return response.data;
  },

  removeOrderItems: async (
    orderUuid: string,
    payload: { items: { item_uuid: string; quantity: number }[] },
    managerToken?: string
  ): Promise<any> => {
    const config: any = {};
    if (managerToken) {
      config.headers = {
        Authorization: `Bearer ${managerToken}`,
      };
    }
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/remove-items/`, payload, config);
    return response.data;
  },

  updateOrderItemQuantity: async (
    orderUuid: string,
    itemUuid: string,
    payload: { quantity: number },
    managerToken?: string
  ): Promise<any> => {
    const config: any = {};
    if (managerToken) {
      config.headers = {
        Authorization: `Bearer ${managerToken}`,
      };
    }
    const response = await apiClient.patch(`orders/partner-pos/${orderUuid}/items/${itemUuid}/`, payload, config);
    return response.data;
  },
};

/** Buyurtma qatori (POS): `quantity` — dona/kg yoki (qadoq tanlansa) qadoqlar soni; `options` — variant uuid'lari */
export interface PosItemInput {
  product_uuid: string;
  quantity: number;
  packaging?: string;
  options?: string[];
}

/** Server hisoblagan savat qatori (POS quote) — buyurtma yaratilgandagi bilan bir xil */
export interface QuoteLine {
  product_uuid: string;
  name: string;
  quantity: number | string;
  unit: 'PIECE' | 'KG';
  packaging: string | null;
  unit_price: number | string;
  options: { uuid: string; name: string; price_delta: number | string }[];
  free_quantity: number | string;
  discount_amount: number | string;
  promotion_label: string;
  line_total: number | string;
}

export interface PosQuote {
  items: QuoteLine[];
  subtotal: number | string;
  discount_amount: number | string;
  delivery_fee: number | string;
  total_price: number | string;
}

export const quotePosCart = async (items: PosItemInput[], deliveryType: string): Promise<PosQuote> =>
  (await apiClient.post('orders/partner-pos/quote/', { items, delivery_type: deliveryType })).data?.data;
