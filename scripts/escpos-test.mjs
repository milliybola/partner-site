#!/usr/bin/env node
/**
 * ESC/POS sinov cheki: ilovadagi EscPos kodlovchisi bilan printerga to'g'ridan-to'g'ri chiqaradi.
 * Rust/Tauri kerak emas — printerni va kodlovchini alohida tekshirish uchun.
 *
 *   node scripts/escpos-test.mjs --net 192.168.1.100            # LAN/Wi-Fi printer (9100-port)
 *   node scripts/escpos-test.mjs --printer "XP-80C"             # Windows'ga o'rnatilgan printer (RAW)
 *   node scripts/escpos-test.mjs --out test.bin                 # faqat fayl (printersiz tekshirish)
 *   node scripts/escpos-test.mjs --list                         # Windows printerlari ro'yxati
 *
 * Qo'shimcha: --width 58|80 (80)  --codepage 17 (CP866)  --chars (belgilar jadvali)  --drawer  --no-cut  --plain (buyruqsiz oddiy matn)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EscPos } from '../src/core/platform/escpos.ts';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
};

if (opt('list', false)) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', 'Get-Printer | Select-Object Name,DriverName,PortName | Format-Table -AutoSize | Out-String -Width 200'], { encoding: 'utf8' });
  console.log(r.stdout || r.stderr);
  process.exit(0);
}

const width = Number(opt('width', 80)) === 58 ? 58 : 80;
const codepage = Number(opt('codepage', 17));
const p = new EscPos(width, codepage);

p.align('center').bold().size(2, 2).line('MilliyGo').size().line(`ESC/POS sinov · ${width} mm`).bold(false).align('left').divider();
p.line(`Ustunlar: ${p.cols}`);
p.line('1234567890'.repeat(5).slice(0, p.cols));
p.divider('=');
p.pair('Lotin:', "O'zbekiston, g'isht, o'rik").pair('Kirill:', 'Ўзбекистон, Ёзув, Қорақалпоқ').pair('Raqam:', '1 234 567 UZS');
p.pair('Juda uzun taom nomi: Lavash pishloqli katta achchiq sousli', '45 000');
p.divider();
p.bold().line('Qalin matn').bold(false).size(2, 1).line('Keng 2x1').size(1, 2).line('Baland 1x2').size();
p.align('center').line('Markazda').align('right').line('O\'ngda').align('left');
p.divider();
p.pair('Jami', '66 000').bold().size(1, 2).pair('TO\'LOV', '66 000', 1).size().bold(false);
p.divider().align('center').line('QR kod:').qr('https://qr-code.milliyapp.uz/test', 6).feed(1);
p.line(new Date().toLocaleString('uz-UZ')).align('left');

if (opt('chars', false)) {
  p.divider().line(`Kod sahifasi ${codepage}: 0x80-0xFF`);
  for (let row = 0x80; row <= 0xff; row += 16) {
    const hex = row.toString(16).toUpperCase();
    p.raw(...Buffer.from(`${hex}: `, 'ascii'));
    for (let c = row; c < row + 16; c++) p.raw(c, 0x20);
    p.raw(0x0a);
  }
}
if (opt('drawer', false)) p.openDrawer();
const data = argv.includes('--no-cut') ? p.feed(4).build() : p.cut().build();
// --plain: hech qanday ESC/POS buyruqsiz, faqat oddiy matn (printer matnni umuman chiqaradimi — tekshirish)
const plain = argv.includes('--plain');
// --step N: buyruqlarni birma-bir sinash (qaysi buyruq chop etishni buzayotganini topish uchun)
const step = Number(opt('step', 0));
const stepData = () => {
  const s = new EscPos(width, codepage);
  if (step === 1) return Buffer.from([0x1b, 0x40, ...Buffer.from('STEP1 init only\n\n\n\n', 'ascii')]); // faqat ESC @
  if (step === 2) return s.line('STEP2 init + codepage').line('Lotin: abc 123').feed(3).build(); // + ESC t n
  if (step === 3) return s.bold().size(2, 2).line('STEP3').size().bold(false).align('center').line('markaz').align('left').feed(3).build();
  if (step === 4) return s.line('STEP4 Kirill:').line('Ўзбекистон Ёзув').pair('Nom', '45 000').divider().feed(3).build();
  if (step === 5) return s.line('STEP5 QR').qr('https://qr-code.milliyapp.uz/test', 6).feed(3).build();
  if (step === 6) return s.line('STEP6 cut').feed(4).raw(0x1d, 0x56, 0x42, 0x00).build();
  return null;
};
const payload = plain ? Buffer.from('HELLO 12345\r\nTEST TEST TEST\r\n\r\n\r\n\r\n', 'ascii') : step ? stepData() : data;
const out = opt('out', null);
const host = opt('net', null);
const sysName = opt('printer', null);

if (out && out !== true) {
  writeFileSync(out, payload);
  console.log(`${payload.length} bayt yozildi: ${out}`);
} else if (host && host !== true) {
  const [h, port = '9100'] = host.split(':');
  await new Promise((resolve, reject) => {
    const s = net.createConnection({ host: h, port: Number(port), timeout: 5000 }, () => s.end(Buffer.from(payload), resolve));
    s.on('timeout', () => { s.destroy(); reject(new Error(`${h}:${port} javob bermadi (5 s)`)); });
    s.on('error', reject);
  });
  console.log(`${payload.length} bayt yuborildi → ${h}:${port}`);
} else if (sysName && sysName !== true) {
  // Windows spooler'ga RAW hujjat sifatida (drayver buyruqlarni o'zgartirmaydi)
  const dir = mkdtempSync(join(tmpdir(), 'escpos-'));
  const bin = join(dir, 'job.bin');
  const ps1 = join(dir, 'send.ps1');
  writeFileSync(bin, payload);
  writeFileSync(ps1, `
param([string]$Printer, [string]$File)
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public class RawPrn {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In] DOCINFO d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
}
"@
$bytes = [System.IO.File]::ReadAllBytes($File)
$h = [IntPtr]::Zero
if (-not [RawPrn]::OpenPrinter($Printer, [ref]$h, [IntPtr]::Zero)) { throw "Printer ochilmadi: $Printer (xato $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
$di = New-Object RawPrn+DOCINFO; $di.pDocName = 'MilliyGo ESC/POS test'; $di.pDataType = 'RAW'
[void][RawPrn]::StartDocPrinter($h, 1, $di); [void][RawPrn]::StartPagePrinter($h)
$w = 0; $ok = [RawPrn]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w)
[void][RawPrn]::EndPagePrinter($h); [void][RawPrn]::EndDocPrinter($h); [void][RawPrn]::ClosePrinter($h)
if (-not $ok) { throw "Yozib bo'lmadi" }
Write-Output "$w bayt yuborildi"
`);
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Printer', sysName, '-File', bin], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error((r.stderr || r.stdout).trim());
    process.exit(1);
  }
  console.log(`${r.stdout.trim()} → ${sysName}`);
} else {
  console.error('Printer ko\'rsatilmagan. --net IP | --printer "Nom" | --out fayl.bin | --list');
  process.exit(2);
}
