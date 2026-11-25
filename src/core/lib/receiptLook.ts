import apiClient from '../api/client';

/**
 * Chek ko'rinishi (kafe bo'yicha, serverda): logotip, uning joyi va eni, rahmat matni.
 * Kassa uni keshlaydi — internet uzilsa ham chek logotip bilan chiqadi.
 * `logo_raster` — server tayyorlagan termal printer rasmi (80/58 mm), 1 bit = qora nuqta.
 */
export interface LogoRaster {
  bytes_per_row: number;
  height: number;
  /** base64 */
  data: string;
}

export interface ReceiptLook {
  logo: string | null;
  logo_position: 'none' | 'top';
  logo_width: number;
  footer: string;
  logo_raster: Record<'80' | '58', LogoRaster> | null;
}

export const DEFAULT_RECEIPT_LOOK: ReceiptLook = { logo: null, logo_position: 'none', logo_width: 60, footer: '', logo_raster: null };

const KEY = 'milliygo_receipt_look';
export const RECEIPT_LOOK_EVENT = 'milliygo:receipt-look-changed';

export const getReceiptLook = (): ReceiptLook => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_RECEIPT_LOOK, ...(JSON.parse(raw) as Partial<ReceiptLook>) } : DEFAULT_RECEIPT_LOOK;
  } catch {
    return DEFAULT_RECEIPT_LOOK;
  }
};

const cache = (look: ReceiptLook) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    /* storage to'la — chek logotipsiz chiqadi */
  }
  window.dispatchEvent(new Event(RECEIPT_LOOK_EVENT));
  return look;
};

const unwrap = (body: unknown): ReceiptLook => {
  const d = (body as { data?: Partial<ReceiptLook> })?.data ?? (body as Partial<ReceiptLook>);
  return { ...DEFAULT_RECEIPT_LOOK, ...d };
};

/** Serverdan yangilab keshlash (kassa ochilganda, sozlama o'zgarganda); xato bo'lsa — kesh qoladi */
export const refreshReceiptLook = async (): Promise<ReceiptLook> => {
  try {
    return cache(unwrap((await apiClient.get('partner/receipt-settings/')).data));
  } catch {
    return getReceiptLook();
  }
};

export const updateReceiptLook = async (patch: Partial<Pick<ReceiptLook, 'logo_position' | 'logo_width' | 'footer'>>) =>
  cache(unwrap((await apiClient.patch('partner/receipt-settings/', patch)).data));

export const uploadReceiptLogo = async (file: File) => {
  const fd = new FormData();
  fd.append('image', file);
  return cache(unwrap((await apiClient.post('partner/receipt-settings/logo/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data));
};

export const removeReceiptLogo = async () => cache(unwrap((await apiClient.delete('partner/receipt-settings/logo/')).data));

/** Chekka chiqadigan logotip (joyi «tepada» va rasm tayyor bo'lsa) */
export const logoRasterFor = (look: ReceiptLook, widthMm: 58 | 80): { bytesPerRow: number; height: number; data: Uint8Array } | null => {
  if (look.logo_position !== 'top') return null;
  const r = look.logo_raster?.[String(widthMm) as '80' | '58'];
  if (!r?.data) return null;
  try {
    const bin = atob(r.data);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { bytesPerRow: r.bytes_per_row, height: r.height, data };
  } catch {
    return null;
  }
};
