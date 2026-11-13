import { describe, expect, it } from 'vitest';
import type { PartnerSession } from '../core/lib/session';
import { UNRESTRICTED } from '../core/lib/tariff';
import { allowedByStage, buildNav, buildTabs, ROUTE_STAGE } from './nav';

const owner = { role: 'superadmin', partner_type: 'RESTAURANT' } as PartnerSession;
const manager = { role: 'manager', partner_type: 'RESTAURANT' } as PartnerSession;
const shop = { role: 'superadmin', partner_type: 'SHOP' } as PartnerSession;
const work = { fast_mode: false, warehouse_enabled: true };
const paths = (groups: ReturnType<typeof buildNav>) => groups.flatMap((g) => g.items.map((i) => i.to));

/** 2-bosqich (POS) bo'limlari: kassa, smena, zal/stol, ombor */
const POS_ONLY = ['/new-order', '/shift', '/tables', '/warehouse', '/inventory'];
/** 1-bosqichda albatta bo'lishi kerak: ilova buyurtmalari, menyu, aksiya, statistika */
const STAGE1_CORE = ['/orders', '/kitchen', '/all-orders', '/catalog', '/promotions', '/couriers', '/reports', '/staff', '/settings'];

describe('Menyu platforma bosqichi bo\'yicha', () => {
  it('1-bosqich, restoran egasi: POS bo\'limlari yo\'q, agregator bo\'limlari bor', () => {
    const p = paths(buildNav(owner, UNRESTRICTED, 'manage', 2, work, { stage: 1 }));
    for (const to of POS_ONLY) expect(p).not.toContain(to);
    for (const to of STAGE1_CORE) expect(p).toContain(to);
  });

  it('1-bosqich: saqlangan «kassa» rejimi ham boshqaruv menyusini beradi (kassa rejimi yo\'q)', () => {
    const p = paths(buildNav(owner, UNRESTRICTED, 'pos', 2, work, { stage: 1 }));
    expect(p).toContain('/catalog');
    expect(p).not.toContain('/new-order');
    expect(p).not.toContain('/tables');
  });

  it('1-bosqich, do\'kon: kassa va ombor yo\'q, yig\'ish bor', () => {
    const p = paths(buildNav(shop, UNRESTRICTED, 'manage', 2, work, { stage: 1 }));
    expect(p).toContain('/picking');
    expect(p).not.toContain('/new-order');
    expect(p).not.toContain('/inventory');
    expect(p).not.toContain('/shift');
  });

  it('1-bosqich, menejer: buyurtmalar va menyu bor, smena yo\'q', () => {
    const p = paths(buildNav(manager, UNRESTRICTED, 'manage', undefined, work, { stage: 1 }));
    expect(p).toContain('/orders');
    expect(p).toContain('/catalog');
    expect(p).not.toContain('/shift');
  });

  it('1-bosqich, pasaytirilgandan keyin ochiq smena qolgan: «Smena» faqat yopish uchun ko\'rinadi', () => {
    const p = paths(buildNav(owner, UNRESTRICTED, 'manage', 2, work, { stage: 1, openShift: true }));
    expect(p).toContain('/shift');
    expect(p).not.toContain('/new-order');
  });

  it('bosqich berilmasa — eng xavfsiz 1-bosqich', () => {
    expect(paths(buildNav(owner, UNRESTRICTED, 'manage', 2, work))).not.toContain('/shift');
  });

  it.each([2, 3, 4])('%i-bosqich: POS bo\'limlari qaytadi (tarif ham ruxsat bersa)', (stage) => {
    const p = paths(buildNav(owner, UNRESTRICTED, 'manage', 2, work, { stage }));
    for (const to of ['/tables', '/shift', '/warehouse']) expect(p).toContain(to);
    const pos = paths(buildNav(owner, UNRESTRICTED, 'pos', 2, work, { stage }));
    expect(pos).toContain('/tables');
    expect(pos).toContain('/shift');
    expect(paths(buildNav(shop, UNRESTRICTED, 'manage', 2, work, { stage }))).toContain('/new-order');
  });

  it('2-bosqich + zalsiz tarif: stollar baribir yo\'q (bosqich VA tarif)', () => {
    const p = paths(buildNav(owner, { ...UNRESTRICTED, allow_dine_in: false }, 'manage', 2, work, { stage: 2 }));
    expect(p).not.toContain('/tables');
    expect(p).toContain('/shift');
  });

  it('pastki tablar: 1-bosqichda stol/ombor o\'rniga menyu', () => {
    expect(buildTabs('restaurant', UNRESTRICTED, 'manage', 1).map((t) => t.to)).toEqual(['/orders', '/kitchen', '/catalog']);
    expect(buildTabs('store', UNRESTRICTED, 'manage', 1).map((t) => t.to)).toEqual(['/orders', '/picking', '/catalog']);
    expect(buildTabs('restaurant', UNRESTRICTED, 'pos', 1).map((t) => t.to)).not.toContain('/tables');
    expect(buildTabs('restaurant', UNRESTRICTED, 'manage', 2).map((t) => t.to)).toContain('/tables');
  });

  it('to\'g\'ridan havola: har POS yo\'li 1-bosqichda yopiq, 2-da ochiq', () => {
    for (const to of Object.keys(ROUTE_STAGE)) {
      expect(allowedByStage(to, 1)).toBe(false);
      expect(allowedByStage(to, 2)).toBe(true);
    }
    expect(allowedByStage('/orders', 1)).toBe(true);
  });
});
