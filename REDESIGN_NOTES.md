# MilliyGo Hamkor — redesign notes (branch `redesign/pro-ux`)

Goal: a professional, mobile-first partner panel (in the spirit of Yandex Eda Vendor or Uber Eats Manager) that matches the MilliyGo superapp look, plus a migration from Electron to Tauri. All UI text is Uzbek (latin). Build status: **`npm run build` (tsc -b + vite) passes.**

Related docs: `API_GAPS.md` (missing backend pieces) · `TAURI_MIGRATION.md` (desktop build) · `D:\Milliy\API_CONTRACT_SETS_PROMOS.md` (shared Sets/1+1 contract).

## 1. Design system
- **Tokens** (`src/index.css`, `tailwind.config.js`): light-only UI.
  - Surfaces and text: canvas #F7F8FA, white surfaces, 1px borders #EEF0F3, ink #111111, muted #6B7280, field #F2F3F5.
  - Brand: green #15803D, bright #16A34A, soft #E8F7EE.
  - Accents: gold #F5B400 and #FFF4CC, danger #EF4444, warning #F59E0B.
  - Type: Inter, headings 800–900 at -0.4px. Radius 12/16/20. Minimal shadows.
  - The dark/light toggle is removed. Legacy `slate-*` and `emerald/rose/amber-300/400` utilities are remapped so any leftover markup stays legible on white.
  - Inputs are 16px on phones (no iOS zoom). There is a visible `:focus-visible` ring and `prefers-reduced-motion` is respected.
- **UI kit** (`src/core/ui/`), all components 44px+ tap targets:
  - Controls: `Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Switch`, `QtyStepper`, `SearchInput`.
  - Layout and display: `Card`, `CardHeader`, `Badge`, `StatCard`, `Tabs` (scrollable status tabs with counts), `Segmented`, `PageHeader` (sticky), `MobileActionBar`, `SettingRow`.
  - `Sheet` / `Modal`: a bottom sheet on phones and a centred dialog on desktop, with Esc and scroll lock.
  - `DataList`: a dense table at ≥768px and stacked cards below, so there is no horizontal scroll.
  - States: `LoadingState`, `SkeletonList`, `EmptyState`, `ErrorState` (with retry), `InlineAlert`.
  - `ApiGap`: amber dashed "API" pill with a tooltip.
- **Helpers** (`src/core/lib/`):
  - `session.ts`: `getPartner`, `setPartner` (which broadcasts updates), `isManager`, `isShop`, and `wording()` for restaurant vs shop terms (Menyu/Mahsulotlar, Tayyorlanmoqda/Yig'ilmoqda…).
  - `format.ts`: money as "125 000 so'm", parsing of backend `dd-MM-yyyy`, phone mask.
  - `errors.ts`: `getErrorMessage`, `isMissingEndpoint`.
- **Order status** (`features/orders/utils/status.ts`): one source of labels, tones and the queue groups Yangi / Tayyorlanmoqda / Tayyor / Yo'lda / Yakunlangan.

## 2. App shell (`core/components/Layout.tsx`)
- **Desktop:** grouped left sidebar (Savdo / Menyu / Boshqaruv / Hisob), collapsible, with a new-order badge. A slim sticky top bar holds the connection indicator, the open/closed status and "Yangi buyurtma".
- **Phone:** sticky app bar (logo, name, filial, connection, status) and a **bottom tab bar**: Buyurtmalar (with a live badge) · Menyu · Statistika (Smena for managers) · **Ko'proq**. Ko'proq opens a sheet with every other screen, "Yangi buyurtma", the filial switcher and logout. Safe-area insets are handled.
- **Realtime** (`core/realtime/RealtimeProvider.tsx`):
  - There is **one WebSocket per session**. Previously Orders and Tables each opened their own socket, which gave double sounds and double reconnects. Pages subscribe with `useRealtime()`.
  - New orders produce the existing chime, an unseen-order badge, a `(N)` prefix in the window title, and an OS notification (a native toast in Tauri, a Web Notification in the browser when the tab is hidden).
- **Performance:** routes are lazy-loaded; the main JS chunk is 688 KB → 326 KB.
- **Access:** owner-only routes (`/finance`, `/branches`, `/delivery-zones`) now redirect managers. Before, they were only hidden from the menu.

## 3. Screens
- **Buyurtmalar (queue):**
  - Phones get status tabs with counts; desktop gets 5 status columns.
  - Every card has **one clear next-step button**. New orders get big **Rad etish / Qabul qilish** buttons and are highlighted.
  - Each card shows elapsed time, turning amber at 15 minutes and red at 30.
  - Order details, payment and courier picker open as bottom sheets.
  - Queue settings: skip the "Tayyorlanmoqda" stage, and show or hide Yakunlangan.
  - If the socket drops, the queue falls back to polling every 30 s.
- **Yangi buyurtma (POS):**
  - Phone flow: service type → (table) → menu with sticky search and category chips → a floating "Savat · N · total" bar → checkout sheet.
  - Desktop: menu plus a sticky cart column.
  - Multi-cart is kept. The payment method and comment fields are restored. Shops get delivery only.
- **Buyurtmalar tarixi:** period presets, a filter sheet on phones, `DataList`, a detail sheet with call links, edit and print.
- **Stollar:** tile grid with status colours, capacity, current total and elapsed time; status tabs and search. The table order sheet is full height with Menyu/Savat switching on phones. There are separate sheets for add/edit, bulk import (with preview) and QR.
- **Menyu / Mahsulotlar:**
  - Categories show as a left list on desktop and chips on phones. Search covers all categories.
  - Product cards have a large "Sotuvda" switch (optimistic, rolls back on error).
  - The product form is a sheet with an image check and field errors.
  - Shops get a stock field marked ApiGap.
- **Setlar va aksiyalar (new):** management of Sets and 1+1/2+1 promotions, following the shared contract.
  - Lists, an active switch, and create/edit sheets.
  - Pickers use real products, and the set shows the composition price from real prices and the saving %.
  - Live preview, e.g. "7 ta olsa: 5 ta to'laydi, 2 ta bepul".
  - If the endpoints return 404/405/501, the page shows "tez orada" instead of crashing.
- **Statistika:** period segmented control, 8 KPI cards, a daily bar chart from `daily_chart` (pure CSS), top products, commission and delivery terms.
- **Moliya:** real KPIs only, an order-based list (`DataList`), Excel export. Payouts are marked ApiGap.
- **Yetkazish hududlari:** map at 45vh on phones, a 56px-row neighbourhood checklist, bulk add, edit and clear sheets.
- **Xodimlar:** Xodimlar / Kuryerlar / Reyting tabs, `DataList`, sheets with validation and the phone mask, a stats sheet per period.
- **Smena:** current shift hero card, open/close with a money input and expected cash, history and Excel export.
- **Profil / Filiallar / Sozlamalar / Kirish:**
  - Profil: sectioned profile with a sticky save bar.
  - Filiallar: shared Yandex location picker and working-hours editor; assign a manager.
  - Sozlamalar: auto-print, copies, **test receipt**, notification permission, sound test. Browser kiosk instructions appear only outside the desktop app.
  - Kirish (login): clean light login with the phone mask.
- **Removed:** confetti, which is not appropriate in a professional tool.

## 4. Bugs found and fixed
**Auth and session**
1. **401 handling.** It redirected to `/login`, which does not exist under HashRouter, so the desktop app showed a blank screen. It now goes to `#/login`. Login calls are excluded so a wrong password shows an inline error. Manager-override calls that carry their own token no longer log the cashier out.
2. **ProfilePage** overwrote the saved session with the raw API object, dropping `role` and `staff_uuid`. A manager who opened Profile was treated as the owner everywhere.
3. **LoginForm** forced `is_open: true` for managers. It also did not clear the old session before saving the new one.
4. Managers could open owner-only screens by typing the URL.

**Open/closed status**
5. The open/closed toggle only changed localStorage; customers never saw it. It now calls the API (see API_GAPS #1).

**Security**
6. The **WebSocket URL, including the access token,** was written to the console on every connect.
7. **Receipt HTML** did not escape customer text (name, comment, product names). Because the receipt prints from a same-origin iframe, a crafted comment could run a script with access to the token. All of it is now escaped.

**Orders**
8. **Orders:** background and realtime refreshes dropped the selected filial filter, and so did refreshing after an edit.
9. **Orders:** an order could only be rejected by drag-and-drop, which is impossible on phones. There is now an explicit button with a confirmation.
10. **Orders and history:** times were taken by splitting the date string, and sorting compared raw `dd-MM-yyyy` strings, which gave a wrong order and NaN.
11. **History:** the page crashed when an order had no phone or address (`contact_phone.includes`). The payment filter ignored `payment_method`, and completed dine-in orders were labelled "Yetkazildi".

**POS (Yangi buyurtma)**
12. **POS:** it invented an 8 000 so'm delivery fee and a 50 000 free-delivery threshold when the profile lacked them.
13. **POS:** a phone field left at "+998" was sent as `"998"`. Saved carts kept stale prices and sold-out items. The search field was disabled, and the payment selector was commented out, so every order went out as CASH.

**Tables**
14. **Tables:** the active toggle sent a partial PUT, which failed validation. Edit and delete appeared only on hover, so they were unreachable on touch screens. Search was commented out.
15. **Tables:** a receipt that failed to print looked like a failed payment, which invited a second payment. Completing a dine-in order never freed the table.

**Dashboard, finance and catalog (fabricated or wrong numbers)**
16. **Dashboard:** a hardcoded "+12%" trend was shown. "Today" cards mixed in all-time counts.
17. **Finance:** the unused `mock/financeData.ts` file of fake data was deleted.
    - Cancelled orders for week and month were computed as orders − delivered, which counted in-progress orders as cancelled.
    - Commission was guessed.
    - Week and overall top products silently showed this month's data.
    - A missing payment method was shown as CASH, and cancelled orders were labelled "Qaytarildi" (refunded).
    - One failed request blanked the whole page.
18. **Catalog:** the product form closed before saving finished and hid errors. Required fields were not validated. New products defaulted to the first category. Errors loading base categories looked like "no categories".
19. **Profile:** a made-up "5.0" rating was shown.

**Partial failures**
20. **Staff, Branches and Finance:** with `Promise.all`, one failing request blanked the whole page. Courier search sent a request on every keystroke. A `success:false` response on closing a shift was ignored.
21. **filialApi:** returned nothing for a `{data:[…]}` response without a `success` flag.

**Desktop app**
22. Under file:// and tauri://, the receipt logo (`window.location.origin`) and the login logo (`/logo.png`) were broken.

## 5. Remaining issues and launch blockers
**Launch blockers**
- **POS delivery coordinates.** POS delivery orders are sent with the venue's coordinates, not the customer's (API_GAPS #5), so courier routing and distance pricing will be wrong.
- **Silent printing in Tauri is unverified.** It relies on WebView2 honouring `--kiosk-printing`. Test it on the real thermal printer before rollout; the fallback is described in TAURI_MIGRATION.md §5.
- **The Tauri build has never been compiled** (no Rust on this machine). Run `npm run tauri:build` on a build PC first, and keep Electron until then.
- **The open/closed toggle** depends on `PATCH partner/me/` accepting `{is_open}` (API_GAPS #1).

**Should fix soon**
- `GET orders/` pagination and filters are unknown, so history and finance may only show page 1 (API_GAPS #12).
- The Excel export period values disagree between finance and shifts (API_GAPS #10).
- `DELETE delivery-zones/clear/` clears every filial (API_GAPS #11).
- The contact phone format differs between flows: the POS sends 9 local digits, while the table order sends 12 digits starting with 998. Backend must confirm the expected format.
- Yandex Maps has no API key.
- CSP is disabled in Tauri (see TAURI_MIGRATION.md §7).
- Reject reason, unsetting a staff/courier filial, courier `service_types` editing, and `current_order` in table events are all pending on the backend.
- `npm run lint` reports about 150 errors from the strict react-hooks v7 (React Compiler) rules (setState-in-effect, refs during render, fast-refresh exports) and `no-explicit-any`. Lint is not part of the build; these are code-quality items, not runtime bugs.
- **No device QA has been done.** Visual QA on a real phone (iOS Safari, Android Chrome) and on a 1366×768 cashier screen has not been performed. In particular, check the sticky offsets of the catalog category chips and the POS cart bar.
- Sets and promos: ordering sets from the POS waits for the backend (`items[].set`), and so do the contract gaps (API_GAPS #3a–3d).

## 6. How to run
```bash
npm install
npm run dev          # http://localhost:7080 (npm run dev:lan to test on a phone in the same Wi-Fi)
npm run build        # production web build (dist/)
npm run tauri:dev    # desktop (requires Rust, see TAURI_MIGRATION.md)
npm run tauri:build  # Windows installers (NSIS + MSI)
```

## 6. Qo'ng'iroq taklifi, mijoz ismi va hamkor to'lov usullari (2026-10-26)
Shartnoma: `D:\Milliy\API_CONTRACT_CALLS_PAYMENTS.md`.

- **Qo'ng'iroq taklifi** (`src/features/calls/`): hamkor telefonidagi MilliyGo Merchant `POST partner/calls/` yuboradi; partner-site `GET partner/calls/?open=1` ni har ~5 s so'raydi (yashirin tabda 30 s, xatoda 30 s gacha sekinlashadi) va WebSocket `incoming_call` / `call_update` xabarlarini tinglaydi. `CallAlerts` (Layout'da, barcha sahifalarda) ekran tepasida alert-kartalar chiqaradi: telefon, ism, "N marta buyurtma bergan", holat (Qo'ng'iroq bo'lmoqda / tugadi / o'tkazib yuborilgan), **Buyurtma ochish** (`/new-order?phone=&name=&call=`) va **Yopish** (`dismiss`). 3 tagacha karta, qolgani "Yana N ta". Signal: buyurtma chime'idan farqli "ding-dong" ovozi, OS bildirishnomasi ("… raqamga buyurtma yaratamizmi?") va oyna sarlavhasida `📞 (N)`. Yopilgan/hal qilingan call qayta chiqmaydi; sahifa ochilganda eski ochiq qo'ng'iroqlar ovozsiz ko'rsatiladi.
- **Buyurtma ochish**: `CreateOrderPage` query'dagi `phone`, `name`, `call` ni o'qiydi — bo'sh savat bo'lsa shuni to'ldiradi, aks holda yangi savat ochadi. Yaratilgach `POST partner/calls/{call}/resolve/ {order_uuid}`.
- **Mijoz ismi** (`src/features/customers/`): telefon maydonida avvalgi mijozlardan taklif (`GET partner/customers/?search=`); tanlanganda yoki 9 raqam to'liq kiritilganda `lookup` bilan ism avtomatik to'ldiriladi (yozilgan ism hech qachon bosib ketilmaydi).
- **To'lov usullari** (`src/core/lib/payments.ts`): backend kodlari (CASH, CARD, TRANSFER, CLICK, PAYME; UZCARD/HUMO → CARD). `GET partner/payment-methods/` bo'yicha `PaymentSheet` (topshirish) va stol hisob-kitobida faqat yoqilgan usullar ko'rinadi. Sozlamalar → "To'lov usullari" (faqat egasi, `PUT`, kamida bittasi). To'lov va yakunlash endi bitta `complete {payment_method}` so'rovi (`ordersApi.completeWithPayment`); javobda `is_paid` true bo'lmasa (eski server) `mark-paid` ga qaytadi.
- **Yaratishda to'lov so'ralmaydi**: kassa (`CreateOrderPage`) va stolga buyurtma ochishda to'lov tanlagich olib tashlandi; buyurtma `CASH` / to'lanmagan yaratiladi, to'lov topshirishda bir marta qabul qilinadi.
- Tekshirilmagan: jonli server bilan (backend/ilova hali tayyor emas edi). `npm run build` (tsc + vite) xatosiz; yangi fayllar ESLint'dan o'tadi. Loyihada test infratuzilmasi (vitest/jest) yo'q.
- Delivery from the POS: only the phone is required (address and map point optional; no fake venue coordinates are sent). Resolves API_GAPS #5.

## Yetkazish manzili / joylashuv so'rovi (API_CONTRACT_LOCATION.md)
- Chek (`printing.ts`): DELIVERY uchun ism, katta telefon, manzil (yo'q bo'lsa "MANZIL KIRITILMAGAN — mijozga qo'ng'iroq qiling") va koordinata bo'lsa xarita QR.
- `ordersApi`: `updateDeliveryInfo` (PATCH delivery-info), `requestLocation` (POST request-location); `Order` ga `latitude/longitude/location_status`.
- UI: `DeliveryAddressSection` (OrderDetailSheet) — ogohlantirish, "Manzilni kiritish", "Mijozdan joylashuv so'rash" (SMS ketmasa havola + nusxa); `LocationBadge` karta va sheetda.
- Backend: `OrderReceiptSerializer` ga `latitude/longitude` qo'shildi.
