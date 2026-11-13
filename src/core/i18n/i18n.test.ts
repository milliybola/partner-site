import { afterEach, describe, expect, it } from 'vitest';
import { getLang, LANG_KEY, setLang, t } from './index';
import { ru, uz } from './dict';

afterEach(() => setLang('uz', { reload: false }));

describe('i18n (kassa)', () => {
  it('standart til — o\'zbekcha', () => {
    expect(getLang()).toBe('uz');
    expect(t('shift.open')).toBe('Smenani ochish');
  });

  it('ruschaga o\'tadi va qurilmada saqlanadi', () => {
    setLang('ru', { reload: false });
    expect(localStorage.getItem(LANG_KEY)).toBe('ru');
    expect(t('shift.open')).toBe('Открыть смену');
    expect(t('act.confirm')).toBe('Подтвердить');
  });

  it('{n} o\'rniga qiymat qo\'yiladi', () => {
    expect(t('cart.totalCount', { n: 3 })).toBe('Jami · 3 ta');
    expect(t('card.hourMin', { h: 1, m: 5 })).toBe('1 soat 5 daq');
  });

  it('ru lug\'atida hamma kalit bor va bo\'sh emas', () => {
    for (const k of Object.keys(uz) as (keyof typeof uz)[]) expect(ru[k]?.trim(), k).toBeTruthy();
  });
});
