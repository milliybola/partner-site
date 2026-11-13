import { describe, expect, it } from 'vitest';
import { classifyError, getErrorMessage, isStageLocked } from './errors';

const http = (status: number, data?: unknown) => ({ response: { status, data } });

describe('Xatolar namunasi', () => {
  it('server matni ustun turadi, maydon nomi o\'zbekcha yoki umuman yo\'q', () => {
    expect(getErrorMessage(http(400, { detail: "Parol noto'g'ri" }))).toBe("Parol noto'g'ri");
    expect(getErrorMessage(http(400, { contact_phone: ["Noto'g'ri raqam"] }))).toBe("Telefon: Noto'g'ri raqam");
    expect(getErrorMessage(http(400, { some_field: ['Xato'] }))).toBe('Xato');
    expect(getErrorMessage(http(400, { items: [{}, { quantity: ['Kam'] }] }))).toBe('2-qator: Kam');
  });
  it('kod xodimga ko\'rinmaydi', () => {
    expect(getErrorMessage(http(404))).not.toMatch(/404/);
    expect(getErrorMessage(http(502, '<html>'))).toBe("Serverda nosozlik. Birozdan keyin qayta urinib ko'ring.");
    expect(classifyError(http(403)).kind).toBe('forbidden');
    expect(classifyError(http(401)).retryable).toBe(false);
  });
  it('tarmoq va kutish', () => {
    expect(classifyError({ code: 'ECONNABORTED' }).kind).toBe('timeout');
    expect(['offline', 'unreachable']).toContain(classifyError({ code: 'ERR_NETWORK' }).kind);
  });
  it('server kodi bo\'yicha tushunarli matn (to\'langan buyurtma himoyalari)', () => {
    const coded = (status: number, code: string) => http(status, { success: false, code, message: 'server matni' });
    expect(getErrorMessage(coded(403, 'PAID_CANCEL_MANAGER_ONLY'))).toMatch(/faqat menejer yoki rahbar bekor qiladi/);
    expect(getErrorMessage(coded(403, 'PAYMENT_CHANGE_MANAGER_ONLY'))).toMatch(/faqat menejer yoki rahbar o‘zgartiradi/);
    expect(getErrorMessage(coded(409, 'ORDER_PAID'))).toMatch(/tarkibini o‘zgartirib bo‘lmaydi/);
    expect(getErrorMessage(coded(400, 'REASON_REQUIRED'))).toMatch(/kamida 3 ta belgi/);
    expect(classifyError(coded(403, 'PAID_CANCEL_MANAGER_ONLY')).kind).toBe('forbidden');
    // Noma'lum kod — server matni
    expect(getErrorMessage(coded(409, 'SOMETHING_ELSE'))).toBe('server matni');
  });
  it('STAGE_LOCKED — platforma bosqichi: tushunarli matn, qayta urinish yo\'q', () => {
    const locked = http(403, { success: false, code: 'STAGE_LOCKED', required_stage: 2, message: 'Bu funksiya keyingi bosqichda ochiladi' });
    expect(getErrorMessage(locked)).toMatch(/keyingi bosqichda ochiladi/);
    expect(getErrorMessage(locked)).not.toMatch(/tarif/i);
    expect(classifyError(locked).kind).toBe('forbidden');
    expect(classifyError(locked).retryable).toBe(false);
    expect(isStageLocked(locked)).toBe(true);
    expect(isStageLocked(http(403, { code: 'TARIFF_LIMIT' }))).toBe(false);
  });
  it('chaqiruvchining fallback matni saqlanadi', () => {
    expect(getErrorMessage(http(400), 'Saqlab bo\'lmadi')).toBe("Saqlab bo'lmadi");
    expect(getErrorMessage(null, 'X')).toBe('X');
  });
});
