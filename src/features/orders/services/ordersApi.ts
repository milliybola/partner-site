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

/** Aralash to'lovning bir qismi (backend: `payments` / `payment_breakdown`) */
export interface PaymentPart {
  method: string;
  amount: number | string;
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
  /** Stol buyurtmasiga qo'llangan xizmat haqi (foiz snapshot'i va summasi) */
  service_charge_percent?: number | string;
  service_charge_amount?: number | string;
  total_price: number | string;
  /** Aksiya/chegirmalar yig'indisi (server hisoblaydi) */
  discount_amount?: number | string;
  /** Qo'lda chegirma (A10, menejer/rahbar): summa, foiz (0 — summa bilan berilgan), sabab, kim va qachon */
  manual_discount_amount?: number | string;
  manual_discount_percent?: number | string;
  manual_discount_reason?: string;
  manual_discount_by?: string;
  manual_discount_at?: string | null;
  waiter_name?: string | null;
  waiter_uuid?: string | null;
  /** Biriktirilgan xodim roli: waiter — haqiqiy ofitsiant; cashier/manager — kassa ochgan */
  waiter_role?: string | null;
  payment?: string;
  payment_method?: string;
  payment_method_display?: string;
  /** Aralash to'lov taqsimoti; bo'sh — butun summa `payment_method` bilan */
  payment_breakdown?: PaymentPart[];
  order_source?: string;
  /** O'z-o'ziga xizmat zali buyurtmasi (stolsiz) */
  hall_uuid?: string | null;
  hall_name?: string | null;
  /** O'z-o'ziga xizmat: mijozni chaqirish raqami (filialda har ish kuni 1 dan) */
  call_number?: number | null;
  /** MilliyGo ilovasidan kelgan buyurtmaning tayyorlash muddati (ISO); boshqalarda null */
  deadline_at?: string | null;
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

/** Stol buyurtmasiga biriktiriladigan ofitsiant */
export interface QrWaiter {
  uuid: string;
  name: string;
  phone?: string;
}

/** Tasdiq kutayotgan mehmon QR buyurtmasi — to'lanmaydi, oshxonaga chiqmaydi */
export const isAwaitingQrConfirm = (o: { order_source?: string; status?: string } | null | undefined) =>
  !!o && o.order_source === 'QR' && (o.status === 'PENDING' || o.status === 'NEW');

/** Stol buyurtmasiga hali haqiqiy ofitsiant biriktirilmagan (kassa ochgan yoki ofitsiantsiz tasdiqlangan) */
export const needsWaiter = (o: { delivery_type?: string; hall_uuid?: string | null; table_number?: string | null; waiter_role?: string | null }) =>
  o.delivery_type === 'DINE_IN' && !o.hall_uuid && !!o.table_number && o.waiter_role !== 'waiter';

/**
 * To'langan buyurtmaga taom qo'shilsa server ALOHIDA yangi hisob ochadi (backend `_opens_new_bill` bilan bir xil):
 * faqat stol (stolli DINE_IN) va olib ketish. O'z-o'ziga xizmat zali va yetkazib berishda to'langan tarkib butunlay qulf.
 */
export const opensNewBill = (o: { is_paid?: boolean; hall_uuid?: string | null; delivery_type?: string; table_number?: string | null }) =>
  !!o.is_paid && !o.hall_uuid && (o.delivery_type === 'DINE_IN' ? !!o.table_number : o.delivery_type === 'PICKUP');

/** `add-items` javobi: `new_bill` — to'langan buyurtma uchun yangi hisob ochildi (`data` — yangi buyurtma) */
export interface AddItemsResult {
  success?: boolean;
  new_bill?: boolean;
  parent_order_uuid?: string;
  message?: string;
  data?: { uuid?: string; order_number?: string } & Record<string, any>;
}

export const ordersApi = {
  /** Buyurtmaga biriktiriladigan ofitsiantlar (buyurtma filialidagi faol ofitsiantlar) */
  getOrderWaiters: async (orderUuid: string): Promise<QrWaiter[]> => {
    const response = await apiClient.get(`orders/partner-pos/${orderUuid}/waiters/`);
    return response.data?.data ?? [];
  },

  /** «Tayyor» — stol buyurtmasida ovqatni olib boradigan ofitsiant bilan (unga push boradi) */
  markReady: async (orderUuid: string, waiterUuid: string | null): Promise<any> => {
    const response = await apiClient.post(`orders/partner-management/${orderUuid}/ready_for_pickup/`, waiterUuid ? { waiter_uuid: waiterUuid } : undefined);
    return response.data;
  },

  /** Stol buyurtmasiga ofitsiant biriktirish / almashtirish */
  assignWaiter: async (orderUuid: string, waiterUuid: string): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/assign-waiter/`, { waiter_uuid: waiterUuid });
    return response.data;
  },

  /** Mehmon QR buyurtmasini tasdiqlash — tanlangan ofitsiant biriktiriladi */
  confirmQrOrder: async (orderUuid: string, waiterUuid: string | null): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/confirm/`, waiterUuid ? { waiter_uuid: waiterUuid } : {});
    return response.data;
  },

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

  /**
   * `reason` — rad etish / bekor qilish sababi: `REJECTED` uchun va to'langan buyurtmani bekor qilishda
   * backend majburiy talab qiladi. Bekor qilish — alohida yo'l (`cancelOrder`).
   */
  updateOrderStatus: async (orderUuid: string, status: string, reason?: string): Promise<any> => {
    if (status === 'CANCELLED') return ordersApi.cancelOrder(orderUuid, reason);
    const slug = getStatusSlug(status);
    const url = ENDPOINTS.ORDERS.UPDATE_STATUS(orderUuid, slug);
    const response = await apiClient.post(url, reason ? { reject_reason: reason } : undefined);
    return response.data;
  },

  /**
   * Buyurtmani bekor qilish (`partner-pos/<uuid>/cancel/`). To'langan buyurtmani faqat menejer/ega bekor qiladi
   * va sabab (≥3 belgi) majburiy: kassirga 403 PAID_CANCEL_MANAGER_ONLY, sababsiz — 400 REASON_REQUIRED.
   */
  cancelOrder: async (orderUuid: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/cancel/`, reason ? { reject_reason: reason } : {});
    return response.data;
  },

  /**
   * Qo'lda chegirma (`partner-pos/<uuid>/discount/`, 2-bosqich): `{percent | amount, reason}`; 0 — bekor qilish.
   * Faqat menejer/rahbar (403 DISCOUNT_MANAGER_ONLY), menejerga chegara (403 DISCOUNT_LIMIT + limit_percent),
   * to'langan — 409 ORDER_PAID. Javob — yangilangan buyurtma (jami, xizmat haqi, manual_discount_*).
   */
  applyDiscount: async (orderUuid: string, payload: { percent: number; reason?: string } | { amount: number; reason?: string }): Promise<Order> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/discount/`, payload);
    return response.data?.data;
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

  completeOrder: async (
    orderUuid: string,
    payment?: { payment_method?: string; payments?: PaymentPart[]; is_paid?: boolean; split_count?: number },
  ): Promise<any> => {
    // Backend `complete`: payment_method berilsa to'lov va yakunlash BIR tranzaksiyada (yagona to'lov mantig'i).
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/complete/`, payment ?? undefined);
    return response.data;
  },

  /**
   * To'lovni qabul qilib yakunlash — bitta so'rovda. Server javobida `is_paid` true bo'lmasa (eski backend
   * `complete` ga to'lovni e'tiborsiz qoldiradi) — `mark-paid` bilan to'ldiriladi.
   */
  completeWithPayment: async (orderUuid: string, paymentMethod: string, splitCount = 1, payments?: PaymentPart[]): Promise<any> => {
    // Aralash to'lov (2+ usul) — qismlar bilan; aks holda bitta usul
    const pay = payments && payments.length > 1 ? { payments } : { payment_method: paymentMethod };
    const res = await ordersApi.completeOrder(orderUuid, {
      ...pay,
      ...(splitCount > 1 ? { split_count: splitCount } : {}),
    });
    if (res?.is_paid !== true) {
      await ordersApi.markOrderPaid(orderUuid, { ...pay, is_paid: true });
    }
    return res;
  },

  markOrderPaid: async (
    orderUuid: string,
    payload: { payment_method?: string; payments?: PaymentPart[]; is_paid: boolean }
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
    /** Oflayn navbat: takror yuborilsa server ikkinchi marta yaratmaydi */
    client_uuid?: string;
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
    /** Oflayn navbat: takror yuborilsa server ikkinchi marta yaratmaydi */
    client_uuid?: string;
  }): Promise<any> => {
    const response = await apiClient.post('orders/partner-pos/create-pickup/', payload);
    return response.data;
  },

  createDineInOrder: async (payload: {
    /** Stol UUID — yoki o'z-o'ziga xizmat zali (`hall`) */
    table?: string;
    hall?: string;
    payment_method: string;
    contact_phone?: string;
    contact_name?: string;
    description?: string;
    items: PosItemInput[];
    /** Oflayn navbat: takror yuborilsa server ikkinchi marta yaratmaydi */
    client_uuid?: string;
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
  ): Promise<AddItemsResult> => {
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
  /** Xizmat haqi — faqat stol (DINE_IN) buyurtmasida, filial foizi bo'yicha */
  service_charge_percent?: number | string;
  service_charge_amount?: number | string;
  total_price: number | string;
}

export const quotePosCart = async (items: PosItemInput[], deliveryType: string): Promise<PosQuote> =>
  (await apiClient.post('orders/partner-pos/quote/', { items, delivery_type: deliveryType })).data?.data;
