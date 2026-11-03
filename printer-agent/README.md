# MilliyGo printer agenti

Kassa kompyuterida ishlaydigan kichik dastur: brauzerdagi partner-site chekni (ESC/POS) shu agentga yuboradi,
agent termal printerga uzatadi (USB — Windows RAW, LAN — 9100-port). Chek oynasiz chiqadi, avtomatik kesiladi,
pul qutisi ochiladi. Rust/Tauri kerak emas.

## O'rnatish (har bir kassa kompyuterida, bir marta)

1. **Node.js 18+** o'rnating (https://nodejs.org).
2. `printer-agent/` papkasini kompyuterga ko'chiring.
3. Ruxsat etilgan sayt: `https://hamkor.milliyapp.uz` (agent ichida tayyor, sozlash shart emas). Boshqa manzil kerak bo'lsa,
   `agent.config.example.json` ni `agent.config.json` deb nusxalab, `allowedOrigins` ga qo'shing. Ro'yxatda bo'lmagan sayt
   agentdan foydalana olmaydi.
4. Avtomatik ishga tushirish: `powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1`
   (qo'lda sinash: `node agent.mjs`). O'chirish: shu fayl `-Remove` bilan.
5. partner-site → Sozlamalar → Printerlar → **Printer agenti** yoqing, printerni tanlang, **Sinov cheki**.

## Printerni Windows'ga qo'shish (USB)

Drayver turi muhim emas (chek RAW yuboriladi): "Generic / Text Only" yetadi. "Windows protected print mode"
yoqilgan bo'lsa, eski printer drayverlarini bloklaydi — uni o'chiring. Port: printer bilan kelgan USB porti
(masalan "POS-80 PORT:"); virtual "USB00x" port ishlamasa, boshqasini sinang. LAN printer bo'lsa, drayver kerak emas.

## Xavfsizlik

- Faqat `127.0.0.1` da tinglaydi (tarmoqdan ko'rinmaydi).
- Brauzer so'rovi faqat `allowedOrigins` dagi saytdan; `Host` tekshiriladi (DNS rebinding'dan himoya).
- Tarmoq printeri faqat ichki IP (192.168.x.x, 10.x.x.x, 172.16–31.x.x) bo'lishi mumkin.
- Chrome birinchi marta "mahalliy tarmoqdagi qurilmalarga kirish" ruxsatini so'rashi mumkin — ruxsat bering.

## API

| | |
|---|---|
| `GET /health` | `{ ok, version }` |
| `GET /printers` | Windows printerlari ro'yxati |
| `POST /print` | `{ target: {kind:"system",name} \| {kind:"network",host,port}, data: <base64 ESC/POS> }` |

Port o'zgartirish: `agent.config.json` → `port` (saytdagi `PRINTER_AGENT_URL` ham shunga mos bo'lishi kerak) yoki `PORT` muhit o'zgaruvchisi.
