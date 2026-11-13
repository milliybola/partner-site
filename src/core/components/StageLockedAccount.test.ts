import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const post = vi.fn();
const get = vi.fn();
vi.mock('../api/client', () => ({
  default: { post: (...args: unknown[]) => post(...args), get: (...args: unknown[]) => get(...args) },
}));

import { STORAGE_KEYS } from '../config/constants';
import { __setPlatformConfigForTest } from '../lib/platformStage';
import { enqueuePayment, getQueue, getSentPayments } from '../lib/offline';
import { t } from '../i18n';
import { ToastProvider } from './ToastProvider';
import { ConfirmProvider } from './ConfirmProvider';
import { StageLockedAccountScreen } from './StageGate';

/**
 * D33 — kassa yopiq bosqich (1-bosqich, Q48): kassir hisobi yopiq ekranga tushadi, lekin oflayn navbatdagi
 * to'lov baribir serverga yuboriladi (Q56) va chek taklif qilinmaydi (backend `receipt/` 403 STAGE_LOCKED).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDER = 'ord-1';
const BASE = `orders/partner-pos/${ORDER}/`;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const render = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(
          ToastProvider,
          null,
          React.createElement(ConfirmProvider, null, React.createElement(StageLockedAccountScreen, { onLogout: () => {} })),
        ),
      ),
    );
  });
};

/** Navbat yuborilishi (setTimeout 0 + bir nechta await) tugashini kutadi */
const settle = async () => {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
};

beforeEach(() => {
  localStorage.clear();
  post.mockReset();
  get.mockReset();
  __setPlatformConfigForTest({ stage: 1, features: { pos: false, couriers: false } });
  localStorage.setItem(
    STORAGE_KEYS.PARTNER_DATA,
    JSON.stringify({ uuid: 'p-1', staff_uuid: 'cashier-1', role: 'cashier', user_type: 'staff', current_filial: { uuid: 'f-1' } }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  __setPlatformConfigForTest(null);
});

describe('D33: 1-bosqichda kassirning oflayn navbati', () => {
  it("yopiq ekranda to'lov serverga yuboriladi, «yetdi» ko'rinadi, chek taklif qilinmaydi", async () => {
    expect(enqueuePayment({ label: '№ 12', total: 60_000, payment: { order_uuid: ORDER, collect: true, method: 'CASH' } })).toBe(true);
    get.mockResolvedValue({
      data: { data: { uuid: ORDER, status: 'READY_FOR_PICKUP', is_paid: false, total_price: '60000.00', payment_method: 'CASH', payment_breakdown: [] } },
    });
    post.mockResolvedValue({ data: { success: true, data: { uuid: ORDER, status: 'COMPLETED', is_paid: true } } });

    await render();
    await settle();

    expect(get).toHaveBeenCalledWith(BASE);
    expect(post).toHaveBeenCalledWith(`${BASE}mark-paid/`, { payment_method: 'CASH', is_paid: true });
    expect(post).toHaveBeenCalledWith(`${BASE}complete/`, {});
    expect(getQueue()).toHaveLength(0);
    expect(getSentPayments()).toHaveLength(1);

    const text = document.body.textContent || '';
    expect(text).toContain(t('offline.sentBarSaved', { n: 1 }));
    expect(text).toContain(t('stage.accountTitle'));
    // receipt/ endpointi 1-bosqichda 403 — chek so'ralmaydi va taklif ham qilinmaydi
    expect(get.mock.calls.some((c) => String(c[0]).includes('receipt'))).toBe(false);
    expect(text).not.toContain(t('offline.sentBar', { n: 1 }));
  });

  it("navbat bo'sh bo'lsa — hech narsa yuborilmaydi, faqat yopiq ekran", async () => {
    await render();
    await settle();
    expect(post).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(t('stage.accountTitle'));
  });
});
