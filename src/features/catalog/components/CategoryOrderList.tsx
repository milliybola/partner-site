import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

export interface OrderItem {
  uuid: string;
  name: string;
  count: number;
}

/**
 * Sudrab tartiblanadigan ro'yxat (sichqoncha — butun qator, sensorli ekran — tutqich).
 * Pointer hodisalari bilan: kutubxonasiz, planshet/telefonda ham ishlaydi.
 * Tutqichda klaviatura: ↑/↓ — bir qadam.
 * Qo'yib yuborilganda tartib o'zgargan bo'lsa `onChange(yangi uuid tartibi)` chaqiriladi.
 */
export const CategoryOrderList: React.FC<{
  items: OrderItem[];
  disabled?: boolean;
  onChange: (uuids: string[]) => void;
}> = ({ items, disabled, onChange }) => {
  const [draft, setDraft] = useState<OrderItem[] | null>(null);
  const [dragUuid, setDragUuid] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const startOrder = useRef('');

  const list = draft ?? items;

  const begin = (e: React.PointerEvent<HTMLLIElement>, uuid: string) => {
    if (disabled || e.button !== 0) return;
    const fromHandle = !!(e.target as HTMLElement).closest('[data-handle]');
    if (e.pointerType !== 'mouse' && !fromHandle) return; // barmoq bilan — faqat tutqichdan (sahifa aylanishi buzilmasin)
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startOrder.current = items.map((i) => i.uuid).join();
    setDraft(items);
    setDragUuid(uuid);
  };

  const move = (e: React.PointerEvent<HTMLLIElement>) => {
    if (!dragUuid || !draft) return;
    const y = e.clientY;
    const from = draft.findIndex((i) => i.uuid === dragUuid);
    // Sudralayotgan qatordan tashqari, o'rtasi kursordan yuqorida turgan qatorlar soni — yangi o'rin
    let to = 0;
    for (const it of draft) {
      if (it.uuid === dragUuid) continue;
      const el = rows.current.get(it.uuid);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top + r.height / 2 < y) to += 1;
      }
    }
    if (to !== from) {
      const next = [...draft];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      setDraft(next);
    }
    // Ro'yxat ekrandan uzun bo'lsa — chetga yaqinlashganda sahifani aylantirish
    if (y < 90) window.scrollBy(0, -12);
    else if (y > window.innerHeight - 90) window.scrollBy(0, 12);
  };

  const end = () => {
    if (!dragUuid) return;
    const final = draft ?? items;
    setDragUuid(null);
    setDraft(null);
    const uuids = final.map((i) => i.uuid);
    if (uuids.join() !== startOrder.current) onChange(uuids);
  };

  const keyMove = (e: React.KeyboardEvent, index: number) => {
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    const target = index + dir;
    if (!dir || disabled || target < 0 || target >= items.length) return;
    e.preventDefault();
    const next = items.map((i) => i.uuid);
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <ol className="space-y-2 select-none">
      {list.map((it, i) => {
        const dragging = it.uuid === dragUuid;
        return (
          <li
            key={it.uuid}
            ref={(el) => {
              if (el) rows.current.set(it.uuid, el);
              else rows.current.delete(it.uuid);
            }}
            onPointerDown={(e) => begin(e, it.uuid)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`flex items-center gap-3 h-14 pl-2 pr-4 rounded-2xl border bg-surface transition-shadow ${
              dragging
                ? 'border-brand shadow-pop relative z-10 cursor-grabbing'
                : `border-edge ${disabled ? 'opacity-60' : 'md:cursor-grab hover:border-edge-strong'}`
            }`}
          >
            <button
              type="button"
              data-handle
              aria-label={`${it.name}: o'rnini o'zgartirish (↑/↓)`}
              title="Ushlab torting"
              disabled={disabled}
              onKeyDown={(e) => keyMove(e, i)}
              className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-muted touch-none ${
                dragging ? 'text-brand cursor-grabbing' : 'hover:bg-field cursor-grab'
              }`}
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <span className="w-6 text-[13px] font-bold text-muted tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-ink">{it.name}</span>
            <span className="text-[12px] font-bold text-muted tabular-nums">{it.count} ta</span>
          </li>
        );
      })}
    </ol>
  );
};
