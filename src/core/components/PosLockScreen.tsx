import React, { useCallback, useEffect, useState } from 'react';
import { Delete, KeyRound, Lock, LogOut } from 'lucide-react';
import apiClient from '../api/client';
import { applySession } from '../lib/applySession';
import type { SessionResponse } from '../lib/applySession';
import { getErrorMessage } from '../lib/errors';
import { getDisplayName, getPartner } from '../lib/session';
import { unlockPos } from '../lib/posLock';
import { Button, Input } from '../ui';

const MAX_LEN = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Kassa qulfi ekrani: xodim PIN'ini teradi → `partner/pos/unlock/` → sessiya o'sha xodimga o'tadi.
 * PIN 4 raqamdan keyin «Ochish» bilan (6 raqam terilsa — avtomatik) yuboriladi. Klaviaturadan ham ishlaydi.
 * Zaxira: PIN o'rnatilmagan bo'lsa yoki unutilgan bo'lsa — shu qurilmada kirgan hisob paroli bilan ochiladi.
 */
export const PosLockScreen: React.FC<{ onLogout: () => void; hasPins?: boolean | null }> = ({ onLogout, hasPins }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usePassword, setUsePassword] = useState(hasPins === false);
  const [password, setPassword] = useState('');
  const partner = getPartner();
  const who = partner?.name;

  const submit = useCallback(
    async (value: string) => {
      if (value.length < 4 || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await apiClient.post('partner/pos/unlock/', { pin: value });
        applySession((res.data?.data || res.data) as SessionResponse);
        unlockPos();
      } catch (err) {
        setError(getErrorMessage(err, "PIN noto'g'ri."));
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post('partner/pos/unlock/', { password });
      unlockPos(); // sessiya o'zgarmaydi — shu hisobning o'zi davom etadi
    } catch (err) {
      setError(getErrorMessage(err, "Parol noto'g'ri."));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  const press = useCallback(
    (d: string) => {
      if (pin.length >= MAX_LEN || busy) return;
      const next = pin + d;
      setError(null);
      setPin(next);
      if (next.length === MAX_LEN) void submit(next);
    },
    [pin, busy, submit],
  );
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    if (usePassword) return; // parol maydoni o'zi klaviaturani oladi
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') void submit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, submit, pin, usePassword]);

  const switchMode = () => {
    setUsePassword((v) => !v);
    setError(null);
    setPin('');
    setPassword('');
  };

  const keyBtn = 'h-16 rounded-2xl bg-surface border border-edge text-[26px] font-black text-ink active:scale-95 transition cursor-pointer disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[300] bg-canvas flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Kassa qulflangan">
      <div className="w-full max-w-xs text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </span>
        <h1 className="mt-3 text-[22px] font-black tracking-tightest">Kassa qulflangan</h1>
        <p className="mt-1 text-[14px] text-muted">
          {getDisplayName(partner)}
          {who && partner?.user_type === 'staff' ? ` · oxirgi: ${who}` : ''}
        </p>

        {usePassword ? (
          <form onSubmit={submitPassword} className="mt-6 space-y-3 text-left">
            {hasPins === false && (
              <p className="text-[13px] text-muted text-center">
                Xodimlarga hali PIN o'rnatilmagan — shu hisobning paroli bilan oching.
              </p>
            )}
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              label="Hisob paroli"
              leftIcon={<KeyRound className="w-4 h-4" />}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              error={error ?? undefined}
              disabled={busy}
            />
            <Button type="submit" block size="lg" loading={busy} disabled={!password}>
              Ochish
            </Button>
          </form>
        ) : (
          <>
            <div className="mt-6 flex justify-center gap-3" aria-label={`${pin.length} ta raqam terildi`}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span key={i} className={`w-4 h-4 rounded-full ${i < pin.length ? 'bg-brand' : 'bg-edge'}`} />
              ))}
            </div>
            <p className={`mt-3 min-h-[20px] text-[13px] font-semibold ${error ? 'text-danger-ink' : 'text-muted'}`}>
              {error || 'Shaxsiy PIN kodingizni kiriting'}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {KEYS.map((k) => (
                <button key={k} type="button" className={keyBtn} disabled={busy} onClick={() => press(k)}>
                  {k}
                </button>
              ))}
              <button type="button" className={`${keyBtn} text-[15px] font-bold bg-field`} disabled={busy || pin.length < 4} onClick={() => void submit(pin)}>
                Ochish
              </button>
              <button type="button" className={keyBtn} disabled={busy} onClick={() => press('0')}>
                0
              </button>
              <button type="button" className={`${keyBtn} flex items-center justify-center bg-field`} disabled={busy} onClick={back} aria-label="O'chirish">
                <Delete className="w-6 h-6" />
              </button>
            </div>
            <p className="mt-5 text-[12px] text-muted">PIN'ni ega yoki menejer «Xodimlar» bo'limida o'rnatadi.</p>
          </>
        )}

        <button type="button" onClick={switchMode} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand cursor-pointer">
          <KeyRound className="w-4 h-4" /> {usePassword ? 'PIN bilan ochish' : 'PIN yo\'qmi? Parol bilan ochish'}
        </button>
        <br />
        <button type="button" onClick={onLogout} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-muted hover:text-ink cursor-pointer">
          <LogOut className="w-4 h-4" /> Boshqa hisob bilan kirish
        </button>
      </div>
    </div>
  );
};
