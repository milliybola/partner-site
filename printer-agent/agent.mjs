#!/usr/bin/env node
/**
 * MilliyGo printer agenti: kassa kompyuterida ishlaydigan kichik mahalliy server.
 * Brauzerdagi partner-site chek baytlarini (ESC/POS) shu agentga yuboradi, agent esa termal printerga uzatadi:
 *   - USB (Windows'ga o'rnatilgan printer) — Windows spooler'ga RAW hujjat sifatida
 *   - LAN/Wi-Fi printer — TCP 9100
 *
 * Faqat Node.js 18+ kerak, tashqi paket yo'q.
 *
 *   GET  /health    → { ok, version }
 *   GET  /printers  → ["POS-E804", ...]           (Windows printerlari)
 *   POST /print     → { target, data: <base64> }  target: {kind:'system',name} | {kind:'network',host,port}
 *
 * Xavfsizlik: faqat 127.0.0.1'da tinglaydi; brauzer so'rovi faqat `allowedOrigins` ro'yxatidagi saytdan qabul
 * qilinadi (agent.config.json); tarmoq printeri faqat ichki (private) IP bo'lishi mumkin.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '1.0.0';
const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 1024 * 1024; // 1 MB (chek bir necha KB)

// ── sozlama ─────────────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = ['https://hamkor.milliyapp.uz', 'http://localhost:7080', 'http://localhost:5173', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'];
const loadConfig = () => {
  let file = {};
  try {
    const p = join(HERE, 'agent.config.json');
    if (existsSync(p)) file = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('agent.config.json o\'qilmadi:', e.message);
  }
  return {
    port: Number(process.env.PORT || file.port || 9101),
    allowedOrigins: [...new Set([...DEFAULT_ORIGINS, ...(file.allowedOrigins ?? [])].map((o) => String(o).replace(/\/$/, '')))],
  };
};
const config = loadConfig();

const log = (...a) => console.log(new Date().toLocaleTimeString('uz-UZ'), ...a);

// ── printerga yuborish ──────────────────────────────────────────────────────
const isPrivateHost = (h) => {
  if (h === 'localhost') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
};

const sendNetwork = (host, port, bytes) =>
  new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port, timeout: 5000 });
    s.on('connect', () => s.end(bytes, resolve));
    s.on('timeout', () => {
      s.destroy();
      reject(new Error(`${host}:${port} javob bermadi (5 s). IP manzil va printer yoqilganini tekshiring.`));
    });
    s.on('error', (e) => reject(new Error(`${host}:${port} — ${e.code || e.message}`)));
  });

const PS_RAW = `
param([string]$Printer, [string]$Path)
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
$bytes = [System.IO.File]::ReadAllBytes($Path)
$h = [IntPtr]::Zero
if (-not [RawPrn]::OpenPrinter($Printer, [ref]$h, [IntPtr]::Zero)) { throw "Printer ochilmadi: $Printer (xato $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))" }
$di = New-Object RawPrn+DOCINFO; $di.pDocName = 'MilliyGo ESC/POS'; $di.pDataType = 'RAW'
[void][RawPrn]::StartDocPrinter($h, 1, $di); [void][RawPrn]::StartPagePrinter($h)
$w = 0; $ok = [RawPrn]::WritePrinter($h, $bytes, $bytes.Length, [ref]$w)
[void][RawPrn]::EndPagePrinter($h); [void][RawPrn]::EndDocPrinter($h); [void][RawPrn]::ClosePrinter($h)
if (-not $ok) { throw "Printerga yozib bo'lmadi" }
`;

let workDir = null;
const work = () => {
  if (!workDir) {
    workDir = mkdtempSync(join(tmpdir(), 'milliygo-agent-'));
    writeFileSync(join(workDir, 'raw.ps1'), PS_RAW);
  }
  return workDir;
};

const powershell = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n')[0].trim() || `powershell ${code}`))));
  });

let jobSeq = 0;
const sendSystem = async (name, bytes) => {
  if (process.platform !== 'win32') throw new Error('Tizim printeri faqat Windows\'da qo\'llab-quvvatlanadi');
  const dir = work();
  const bin = join(dir, `job-${++jobSeq}.bin`);
  writeFileSync(bin, bytes);
  await powershell(['-File', join(dir, 'raw.ps1'), '-Printer', name, '-Path', bin]);
};

const listSystemPrinters = async () => {
  if (process.platform !== 'win32') return [];
  const out = await powershell(['-Command', 'Get-Printer | ForEach-Object { $_.Name } | ConvertTo-Json -Compress']);
  const v = out.trim() ? JSON.parse(out) : [];
  return Array.isArray(v) ? v : [v];
};

// Ishlar ketma-ket bajariladi: ikki chek printerda aralashib ketmasin
let queue = Promise.resolve();
const enqueue = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

const printJob = (target, bytes) => {
  if (target?.kind === 'network') {
    const host = String(target.host ?? '').trim();
    const port = Number(target.port) || 9100;
    if (!isPrivateHost(host)) throw httpError(400, 'Faqat ichki tarmoq (192.168.x.x, 10.x.x.x) printeriga yuborish mumkin');
    if (port < 1 || port > 65535) throw httpError(400, 'Port noto\'g\'ri');
    return enqueue(() => sendNetwork(host, port, bytes));
  }
  if (target?.kind === 'system') {
    const name = String(target.name ?? '').trim();
    if (!name || name.length > 200) throw httpError(400, 'Printer nomi ko\'rsatilmagan');
    return enqueue(() => sendSystem(name, bytes));
  }
  throw httpError(400, 'target.kind: "network" yoki "system" bo\'lishi kerak');
};

// ── HTTP ────────────────────────────────────────────────────────────────────
const httpError = (status, message) => Object.assign(new Error(message), { status });

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'So\'rov juda katta'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const send = (res, status, body, headers) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ? String(req.headers.origin).replace(/\/$/, '') : null;
  const cors = origin && config.allowedOrigins.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : {};
  try {
    // DNS rebinding'dan himoya: faqat localhost nomi bilan murojaat
    const host = String(req.headers.host ?? '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost') throw httpError(403, 'Host ruxsat etilmagan');
    if (origin && !cors['Access-Control-Allow-Origin']) {
      log(`✋ Ruxsatsiz sayt: ${origin} — kerak bo'lsa agent.config.json → allowedOrigins ga qo'shing`);
      throw httpError(403, `Sayt ruxsat etilmagan: ${origin}`);
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, version: VERSION, platform: process.platform }, cors);
    if (req.method === 'GET' && path === '/printers') return send(res, 200, { ok: true, printers: await listSystemPrinters() }, cors);
    if (req.method === 'POST' && path === '/print') {
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw httpError(415, 'Content-Type: application/json kerak');
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (e) {
        throw e.status ? e : httpError(400, 'JSON noto\'g\'ri');
      }
      const bytes = Buffer.from(String(body?.data ?? ''), 'base64');
      if (!bytes.length) throw httpError(400, 'data bo\'sh');
      await printJob(body.target, bytes);
      log(`🖨  ${bytes.length} bayt → ${body.target.kind === 'network' ? `${body.target.host}:${body.target.port || 9100}` : body.target.name}`);
      return send(res, 200, { ok: true, bytes: bytes.length }, cors);
    }
    throw httpError(404, 'Topilmadi');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) log('❌', e.message);
    send(res, status, { ok: false, error: e.message }, cors);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`${config.port}-port band: agent allaqachon ishlayotgan bo'lishi mumkin.`);
  else console.error(e);
  process.exit(1);
});
server.listen(config.port, '127.0.0.1', () => {
  log(`MilliyGo printer agenti ${VERSION} — http://127.0.0.1:${config.port}`);
  log(`Ruxsat etilgan saytlar: ${config.allowedOrigins.join(', ')}`);
});
