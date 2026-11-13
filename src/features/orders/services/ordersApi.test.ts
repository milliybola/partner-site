import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('../../../core/api/client', () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

import { opensNewBill, ordersApi } from './ordersApi';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: { success: true } });
});

describe('Buyurtmani bekor qilish', () => {
  it('partner-pos/<uuid>/cancel/ ga boradi (partner-management/…/cancelled/ yo\'li serverda yo\'q)', async () => {
    await ordersApi.updateOrderStatus('o-1', 'CANCELLED');
    expect(post).toHaveBeenCalledWith('orders/partner-pos/o-1/cancel/', {});
  });

  it('sabab reject_reason bilan yuboriladi (to\'langan buyurtmada majburiy)', async () => {
    await ordersApi.cancelOrder('o-2', 'Mijoz voz kechdi');
    expect(post).toHaveBeenCalledWith('orders/partner-pos/o-2/cancel/', { reject_reason: 'Mijoz voz kechdi' });
  });

  it('boshqa holatlar avvalgidek partner-management orqali', async () => {
    await ordersApi.updateOrderStatus('o-3', 'REJECTED', 'Band');
    expect(post).toHaveBeenCalledWith('orders/partner-management/o-3/reject/', { reject_reason: 'Band' });
  });
});

describe("To'langan buyurtmaga taom qo'shish — yangi hisob (backend _opens_new_bill bilan bir xil)", () => {
  it('stol va olib ketish — yangi hisob', () => {
    expect(opensNewBill({ is_paid: true, delivery_type: 'DINE_IN', table_number: '5' })).toBe(true);
    expect(opensNewBill({ is_paid: true, delivery_type: 'PICKUP' })).toBe(true);
  });
  it("o'z-o'ziga xizmat zali, yetkazib berish, to'lanmagan — yo'q", () => {
    expect(opensNewBill({ is_paid: true, delivery_type: 'DINE_IN', hall_uuid: 'h1' })).toBe(false);
    expect(opensNewBill({ is_paid: true, delivery_type: 'DELIVERY' })).toBe(false);
    expect(opensNewBill({ is_paid: false, delivery_type: 'PICKUP' })).toBe(false);
  });
});
