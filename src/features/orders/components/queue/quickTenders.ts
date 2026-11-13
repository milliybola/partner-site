/**
 * Naqd uchun tez summalar: jamidan KATTA eng yaqin yaxlit summalar (10 000, 50 000, 100 000, 200 000 ga yaxlitlab),
 * takrorsiz, ko'pi bilan 3 ta. «Aniq» (= jami) bu ro'yxatga kirmaydi — alohida tugma.
 * 37 000 → [40 000, 50 000, 100 000]; 112 000 → [120 000, 150 000, 200 000]; 50 000 → [100 000, 200 000].
 */
export const quickTenders = (total: number): number[] => {
  if (!(total > 0)) return [];
  const out: number[] = [];
  for (const step of [10_000, 50_000, 100_000, 200_000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total && !out.includes(v)) out.push(v);
    if (out.length === 3) break;
  }
  return out;
};
