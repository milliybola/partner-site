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
  line_total?: number;
  name?: string;
}

export interface Order {
  id: number;
  uuid: string;
  order_number?: string;
  status: 'PENDING' | 'SEARCHING_COURIER' | 'ACCEPTED' | 'REJECTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'DELIVERING' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
  contact_phone: string;
  contact_name?: string;
  address: string;
  created_at: string;
  updated_at?: string;
  delivery_fee: number | string;
  total_price: number | string;
  payment?: string;
  payment_method?: string;
  payment_method_display?: string;
  order_source?: string;
  order_source_display?: string;
  courier_phone?: string;
  distance?: number;
  description?: string;
  reject_reason?: string | null;
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
  getOrders: async (): Promise<Order[]> => {
    const response = await apiClient.get(ENDPOINTS.ORDERS.LIST);
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

  completeOrder: async (orderUuid: string): Promise<any> => {
    const response = await apiClient.post(`orders/partner-pos/${orderUuid}/complete/`);
    return response.data;
  },

  createOrder: async (payload: {
    description: string;
    address: string;
    contact_phone: string;
    latitude: string;
    longitude: string;
    items: { product_uuid: string; quantity: number }[];
  }): Promise<any> => {
    const response = await apiClient.post(ENDPOINTS.ORDERS.LIST, payload);
    return response.data;
  },

  createDeliveryOrder: async (payload: {
    contact_phone: string;
    contact_name: string;
    address: string;
    latitude: number;
    longitude: number;
    payment_method: string;
    description: string;
    items: { product_uuid: string; quantity: number }[];
  }): Promise<any> => {
    const response = await apiClient.post('orders/partner-pos/create-delivery/', payload);
    return response.data;
  },

  createPickupOrder: async (payload: {
    contact_phone: string;
    contact_name: string;
    payment_method: string;
    description?: string;
    items: { product_uuid: string; quantity: number }[];
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
    items: { product_uuid: string; quantity: number }[];
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
