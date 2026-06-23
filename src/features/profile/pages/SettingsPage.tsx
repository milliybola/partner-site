import React, { useState, useEffect } from 'react';
import { Settings, Printer, AlertCircle, Check, Info, Minus, Plus } from 'lucide-react';
import confetti from 'canvas-confetti';

const SettingsPage: React.FC = () => {
  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('milliygo_auto_print') === 'true';
  });

  const [printCopies, setPrintCopies] = useState<number>(() => {
    const saved = localStorage.getItem('milliygo_print_copies');
    return saved ? parseInt(saved, 10) || 1 : 1;
  });

  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-save changes to localStorage
  useEffect(() => {
    localStorage.setItem('milliygo_auto_print', autoPrint ? 'true' : 'false');
  }, [autoPrint]);

  useEffect(() => {
    localStorage.setItem('milliygo_print_copies', printCopies.toString());
  }, [printCopies]);

  const handleToggleAutoPrint = () => {
    const newValue = !autoPrint;
    setAutoPrint(newValue);
    triggerSuccessToast(newValue ? "Avtomatik chop etish faollashtirildi!" : "Avtomatik chop etish o'chirildi!");
  };

  const handleIncrementCopies = () => {
    if (printCopies < 5) {
      setPrintCopies(prev => prev + 1);
      triggerSuccessToast(`Chek nusxalari soni: ${printCopies + 1} ta`);
    }
  };

  const handleDecrementCopies = () => {
    if (printCopies > 1) {
      setPrintCopies(prev => prev - 1);
      triggerSuccessToast(`Chek nusxalari soni: ${printCopies - 1} ta`);
    }
  };

  const triggerSuccessToast = (msg: string) => {
    setSuccessMsg(msg);
    // Simple haptic confetti burst
    confetti({
      particleCount: 20,
      spread: 40,
      origin: { y: 0.9 }
    });
    const timer = setTimeout(() => {
      setSuccessMsg(null);
    }, 3000);
    return () => clearTimeout(timer);
  };

  return (
    <div className="space-y-8 font-Outfit text-left animate-fade-in pb-20">
      {/* Page Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Tizim sozlamalari <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><Settings className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Chop etish rejimlari, chek nusxalari va bildirishnomalarni sozlang</p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm max-w-xl animate-fade-in shadow-lg shadow-emerald-500/5">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Side: Preferences Cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Chop etish sozlamalari */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-6 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <Printer className="w-5 h-5 text-brand" /> Chop etish moslamalari
            </h3>

            {/* Toggle auto print */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition duration-200">
              <div className="flex flex-col pr-4">
                <span className="text-sm font-bold text-white font-Outfit">Yangi buyurtmalarni avtomatik chop etish</span>
                <span className="text-xs text-slate-400 mt-1 font-Outfit leading-relaxed">
                  WebSocket orqali yangi buyurtma kelganda chekni printerga avtomatik tarzda chiqarish
                </span>
              </div>
              
              <button
                type="button"
                onClick={handleToggleAutoPrint}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  autoPrint ? 'bg-brand shadow-[0_0_12px_rgba(14,165,233,0.3)]' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    autoPrint ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Set number of copies */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-white/5 hover:border-white/10 transition duration-200">
              <div className="flex flex-col pr-4">
                <span className="text-sm font-bold text-white font-Outfit">Chop etiladigan nusxalar soni</span>
                <span className="text-xs text-slate-400 mt-1 font-Outfit leading-relaxed">
                  Har bir buyurtma uchun chek necha nusxada chop etilishi kerak (kuxnya va mijoz uchun)
                </span>
              </div>
              
              <div className="flex items-center bg-slate-950/80 rounded-xl p-1 border border-white/5 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDecrementCopies}
                  disabled={printCopies <= 1}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-bold text-white font-Outfit select-none">
                  {printCopies}
                </span>
                <button
                  type="button"
                  onClick={handleIncrementCopies}
                  disabled={printCopies >= 5}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Kiosk mode instructions */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500/50"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <AlertCircle className="w-5 h-5 text-amber-400" /> Kiosk rejimini sozlash (Oynasiz chop etish)
            </h3>

            <div className="space-y-4 text-sm">
              <p className="text-slate-300 leading-relaxed font-Outfit">
                Standart holatda brauzer `window.print()` chaqirilganda tizimning chop etish muloqot oynasini ochadi. Avtomatik ravishda, hech qanday oyna ochilmasdan default printerdan chek chiqarish uchun brauzerni <strong>Kiosk printing</strong> rejimida sozlang:
              </p>
              
              <div className="border border-white/5 rounded-xl overflow-hidden bg-slate-950/40 divide-y divide-white/5 font-Outfit">
                <div className="p-4 flex gap-3.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-brand/10 border border-brand/20 text-brand font-bold text-xs shrink-0 font-Outfit">1</span>
                  <div>
                    <h4 className="font-bold text-white text-xs">Yorliq yaratish / tanlash</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Google Chrome yoki Microsoft Edge yorlig'ini (shortcut) sichqonchaning o'ng tugmasi bilan bosing va <strong>Properties (Svoystva)</strong> bandini tanlang.
                    </p>
                  </div>
                </div>

                <div className="p-4 flex gap-3.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-brand/10 border border-brand/20 text-brand font-bold text-xs shrink-0 font-Outfit">2</span>
                  <div className="w-full">
                    <h4 className="font-bold text-white text-xs">Kiosk kalitini qo'shish</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      <strong>Target (Obekt)</strong> maydonining oxiriga bitta bo'shliq (probel) qoldirib, quyidagi kodni qo'shing:
                    </p>
                    <div className="mt-2.5 p-3 rounded-lg bg-slate-950 border border-white/5 flex items-center justify-between gap-3 text-xs font-mono font-bold text-amber-400">
                      <span className="select-all truncate">--kiosk --kiosk-printing</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 flex gap-3.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-brand/10 border border-brand/20 text-brand font-bold text-xs shrink-0 font-Outfit">3</span>
                  <div>
                    <h4 className="font-bold text-white text-xs">Qayta ishga tushirish</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Barcha ochiq brauzer oynalarini yopib yuboring (Task Manager orqali jarayon to'liq to'xtatilganiga ishonch hosil qiling). So'ngra ushbu yangilangan yorliq orqali tizimga kiring.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Informative Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-4 shadow-lg text-left relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h4 className="font-bold text-white text-sm tracking-wide uppercase text-slate-400 border-b border-white/5 pb-2 font-Outfit flex items-center gap-1.5">
              <Info className="w-4 h-4 text-brand" /> Ma'lumot
            </h4>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-Outfit">
              <p>
                Avtomatik chop etish yoqilganda, kassa monitorida yangi buyurtma kelib tushishi bilan chek avtomatik tarzda default printerga chiqariladi.
              </p>
              <p>
                Agar chek chiqmayotgan bo'lsa:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                <li>Printerning yoqilganligini tekshiring.</li>
                <li>Operatsion tizimingizda (Windows) ushbu printer default qilib o'rnatilganini tekshiring.</li>
                <li>Brauzer kiosk rejimda ekanligini qayta ko'ring.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
