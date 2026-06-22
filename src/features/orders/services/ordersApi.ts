import apiClient from '../../../core/api/client';
import { ENDPOINTS } from '../../../core/config/constants';

export interface OrderItem {
  product: {
    name: string;
    price: number;
  };
  quantity: number;
}

export interface Order {
  id: number;
  uuid: string;
  status: 'PENDING' | 'SEARCHING_COURIER' | 'ACCEPTED' | 'REJECTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'DELIVERING' | 'COMPLETED' | 'DELIVERED' | 'CANCELLED';
  contact_phone: string;
  address: string;
  created_at: string;
  delivery_fee: number;
  total_price: number;
  payment: string;
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
};
