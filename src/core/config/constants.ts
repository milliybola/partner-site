export const API_BASE_URL = 'https://mytizim.uz/';
export const WS_BASE_URL = 'wss://mytizim.uz/ws/partner/';

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'milliygo_access_token',
  REFRESH_TOKEN: 'milliygo_refresh_token',
  PARTNER_DATA: 'milliygo_partner_data',
};

export const ENDPOINTS = {
  AUTH: {
    LOGIN: 'partner/auth/login/',
    ME: 'partner/me/',
  },
  STAFF: {
    LOGIN: 'partner/staff/auth/login/',
    ME: 'partner/staff/me/',
    BASE: 'partner/staff/',
    STATISTICS: 'partner/staff/statistics/',
  },
  SHIFTS: {
    CURRENT: 'partner/shifts/current/',
    OPEN: 'partner/shifts/open/',
    CLOSE: 'partner/shifts/close/',
    LIST: 'partner/shifts/',
    EXPORT: 'partner/shifts/export/excel/',
  },
  DASHBOARD: {
    STATS: 'partner/statistics/',
  },
  FINANCE: {
    EXPORT: 'partner/finance/export/excel/',
  },
  ORDERS: {
    LIST: 'orders/',
    UPDATE_STATUS: (orderUuid: string, statusSlug: string) =>
      `orders/partner-management/${orderUuid}/${statusSlug}/`,
  },
  CATALOG: {
    BASE_CATEGORIES: 'base-categories/',
    PARTNER_CATEGORIES: (restaurantUuid: string) =>
      `partner/category/?partner=${restaurantUuid}`,
    TOGGLE_CATEGORY: 'partner/category/',
    PRODUCTS: (restaurantUuid: string, categoryUuid: string) =>
      `products/?partner=${restaurantUuid}&category=${categoryUuid}`,
    ADD_PRODUCT: 'products/',
    UPDATE_PRODUCT: (productUuid: string) => `products/${productUuid}/`,
    DELETE_PRODUCT: (productUuid: string) => `products/${productUuid}/`,
  },
  PROFILE: {
    ME: 'partner/me/',
    OPENING_HOURS: (restaurantUuid: string) =>
      `partner/opening-hours/?restaurant_uuid=${restaurantUuid}`,
    SAVE_OPENING_HOURS: 'partner/opening-hours/',
  },
  TABLES: {
    BASE: 'partner/tables/',
    AVAILABLE: 'partner/tables/available/',
    BULK_IMPORT: 'partner/tables/bulk-import/',
    UPDATE_STATUS: (uuid: string) => `partner/tables/${uuid}/status/`,
    DETAIL: (uuid: string) => `partner/tables/${uuid}/`,
  },
};
