import { afterEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../api/client';
import { __setPlatformConfigForTest, getPlatformStage, loadPlatformConfig, normalizeConfig, posEnabled } from './platformStage';
import { getWorkMode } from './workMode';

afterEach(() => {
  vi.restoreAllMocks();
  __setPlatformConfigForTest(null);
  localStorage.clear();
});

describe('Platforma bosqichi (GET /platform/config/)', () => {
  it('javobni tekshiradi: noto\'g\'ri bosqich — rad etiladi', () => {
    expect(normalizeConfig({ stage: 2, features: { pos: true, couriers: false } })).toEqual({ stage: 2, features: { pos: true, couriers: false } });
    expect(normalizeConfig({ stage: 3 })?.features).toEqual({ pos: true, couriers: true });
    expect(normalizeConfig({ stage: 0 })).toBeNull();
    expect(normalizeConfig({ stage: 'x' })).toBeNull();
    expect(normalizeConfig(null)).toBeNull();
  });

  it('hech narsa ma\'lum bo\'lmasa — 1-bosqich (POS yopiq)', () => {
    expect(getPlatformStage()).toBe(1);
    expect(posEnabled()).toBe(false);
  });

  it('serverdan keladi va eslab qolinadi; keyingi xatoda oxirgi ma\'lum qiymat qoladi', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ data: { stage: 2, features: { pos: true, couriers: false } } } as never);
    await loadPlatformConfig(true);
    expect(getPlatformStage()).toBe(2);
    expect(localStorage.getItem('milliygo:platform_config')).toContain('"stage":2');

    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Network Error'));
    await loadPlatformConfig(true);
    expect(getPlatformStage()).toBe(2);
  });

  it('1-bosqichda kassa rejimi yo\'q — saqlangan tanlov va kassir uchun ham', () => {
    localStorage.setItem('milliygo:work_mode', 'pos');
    __setPlatformConfigForTest({ stage: 1, features: { pos: false, couriers: false } });
    expect(getWorkMode({ role: 'superadmin' } as never)).toBe('manage');
    expect(getWorkMode({ role: 'cashier' } as never)).toBe('manage');
    __setPlatformConfigForTest({ stage: 2, features: { pos: true, couriers: false } });
    expect(getWorkMode({ role: 'superadmin' } as never)).toBe('pos');
    expect(getWorkMode({ role: 'cashier' } as never)).toBe('pos');
  });
});
