import { describe, expect, it } from 'vitest';
import { quickTenders } from './quickTenders';

describe('Naqd tez summalar', () => {
  it('jamidan katta eng yaqin yaxlit summalar, takrorsiz, ko\'pi bilan 3 ta', () => {
    expect(quickTenders(37_000)).toEqual([40_000, 50_000, 100_000]);
    expect(quickTenders(112_000)).toEqual([120_000, 150_000, 200_000]);
    expect(quickTenders(50_000)).toEqual([100_000, 200_000]);
    expect(quickTenders(8_500)).toEqual([10_000, 50_000, 100_000]);
  });
  it('jami 0 yoki noto\'g\'ri bo\'lsa — bo\'sh', () => {
    expect(quickTenders(0)).toEqual([]);
    expect(quickTenders(NaN)).toEqual([]);
  });
});
