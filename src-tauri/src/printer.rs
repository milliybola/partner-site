//! Chek printeriga to'g'ridan-to'g'ri ESC/POS baytlarini yuborish (brauzer oynasisiz).
//!
//! Ikki ulanish turi:
//! - `network` — LAN/Wi-Fi printer, RAW TCP (odatda 9100-port). Drayver kerak emas.
//! - `system`  — Windows'ga o'rnatilgan printer (USB), spooler orqali RAW ma'lumot turi bilan.
//!
//! Baytlarni frontend (`src/core/platform/escpos.ts`) tayyorlaydi; bu yerda faqat yetkazish.

use serde::Deserialize;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PrinterTarget {
    Network { host: String, port: Option<u16> },
    System { name: String },
}

fn send_network(host: &str, port: u16, data: &[u8]) -> Result<(), String> {
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| format!("Manzil noto'g'ri ({host}:{port}): {e}"))?
        .next()
        .ok_or_else(|| format!("Manzil topilmadi: {host}:{port}"))?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(4))
        .map_err(|e| format!("Printerga ulanib bo'lmadi ({host}:{port}): {e}"))?;
    stream.set_write_timeout(Some(Duration::from_secs(8))).ok();
    stream.write_all(data).map_err(|e| format!("Printerga yozib bo'lmadi: {e}"))?;
    stream.flush().map_err(|e| format!("Printerga yozib bo'lmadi: {e}"))?;
    Ok(())
}

#[cfg(windows)]
mod spooler {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL,
        PRINTER_INFO_4W,
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe fn from_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut len = 0;
        while *p.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
    }

    /// O'rnatilgan printerlar nomlari (lokal + tarmoq ulanishlari).
    pub fn list() -> Vec<String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: u32 = 0;
        let mut count: u32 = 0;
        unsafe {
            EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut count);
            if needed == 0 {
                return Vec::new();
            }
            let mut buf = vec![0u8; needed as usize];
            if EnumPrintersW(flags, std::ptr::null(), 4, buf.as_mut_ptr(), needed, &mut needed, &mut count) == 0 {
                return Vec::new();
            }
            let infos = std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, count as usize);
            infos.iter().map(|i| from_wide(i.pPrinterName)).filter(|n| !n.is_empty()).collect()
        }
    }

    pub fn send(name: &str, data: &[u8]) -> Result<(), String> {
        let printer = wide(name);
        let mut doc_name = wide("MilliyGo chek");
        let mut datatype = wide("RAW");
        unsafe {
            let mut handle: HANDLE = 0;
            if OpenPrinterW(printer.as_ptr(), &mut handle, std::ptr::null()) == 0 {
                return Err(format!("Printer topilmadi: {name}"));
            }
            let doc = DOC_INFO_1W {
                pDocName: doc_name.as_mut_ptr(),
                pOutputFile: std::ptr::null_mut(),
                pDatatype: datatype.as_mut_ptr(),
            };
            let result = if StartDocPrinterW(handle, 1, &doc) == 0 {
                Err(format!("Chop etishni boshlab bo'lmadi: {name}"))
            } else {
                StartPagePrinter(handle);
                let mut written: u32 = 0;
                let ok = WritePrinter(handle, data.as_ptr() as *const _, data.len() as u32, &mut written);
                EndPagePrinter(handle);
                EndDocPrinter(handle);
                if ok == 0 || written as usize != data.len() {
                    Err(format!("Printerga yozib bo'lmadi: {name}"))
                } else {
                    Ok(())
                }
            };
            ClosePrinter(handle);
            result
        }
    }
}

#[cfg(not(windows))]
mod spooler {
    pub fn list() -> Vec<String> {
        Vec::new()
    }
    pub fn send(_name: &str, _data: &[u8]) -> Result<(), String> {
        Err("O'rnatilgan printerga RAW chop etish faqat Windows'da".into())
    }
}

/// Windows'dagi printerlar ro'yxati (Sozlamalar → printer tanlash).
#[tauri::command]
pub async fn printer_list() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(spooler::list).await.unwrap_or_default()
}

/// ESC/POS baytlarini printerga yuborish.
#[tauri::command]
pub async fn printer_send(target: PrinterTarget, data: Vec<u8>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match target {
        PrinterTarget::Network { host, port } => send_network(host.trim(), port.unwrap_or(9100), &data),
        PrinterTarget::System { name } => spooler::send(&name, &data),
    })
    .await
    .map_err(|e| format!("Chop etishda ichki xato: {e}"))?
}
