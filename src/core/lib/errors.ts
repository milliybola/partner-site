/** Extracts a human readable (Uzbek, if backend sent one) message from an axios error. */
export const getErrorMessage = (err: any, fallback = "Xatolik yuz berdi. Qaytadan urinib ko'ring."): string => {
  if (!err) return fallback;
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
    return "Internet aloqasi yo'q yoki server javob bermayapti.";
  }
  if (err.code === 'ECONNABORTED') return "Server javobi juda uzoq kutildi. Qaytadan urinib ko'ring.";
  const data = err.response?.data;
  if (typeof data === 'string' && data.length < 200 && !data.trim().startsWith('<')) return data;
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string') return data.message;
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.error === 'string') return data.error;
    if (Array.isArray(data.non_field_errors)) return data.non_field_errors.join(' ');
    // DRF field errors: { field: ["msg"] }
    const src = data.errors && typeof data.errors === 'object' ? data.errors : data;
    for (const key of Object.keys(src)) {
      const v = src[key];
      if (Array.isArray(v) && typeof v[0] === 'string') return `${key}: ${v[0]}`;
      if (typeof v === 'string' && key !== 'success') return `${key}: ${v}`;
    }
  }
  const status = err.response?.status;
  if (status === 403) return "Bu amal uchun ruxsatingiz yo'q.";
  if (status === 404) return "Ma'lumot topilmadi (404).";
  if (status && status >= 500) return "Serverda xatolik yuz berdi. Birozdan keyin urinib ko'ring.";
  if (err instanceof Error && err.message && !/status code/i.test(err.message)) return err.message;
  return fallback;
};

/** True when an endpoint simply does not exist (yet) on the backend. */
export const isMissingEndpoint = (err: any) => {
  const s = err?.response?.status;
  return s === 404 || s === 405 || s === 501;
};
