/**
 * Montana license and drawing fees, from the 2026 Deer, Elk & Antelope regulations (the printed fee charts,
 * pp. 12-13; drawing refunds, p. 11; "Fees and Refunds", p. 18), read Nov 11, 2026. Unlike FWP's fee web page,
 * the regulations carry their season year, so these are labelled 2026. Client-safe.
 *
 * FWP's nonresident fee page (checked Nov 11, 2026) agrees on the combination prices and says the Conservation and
 * Base Hunting licenses and the AIS pass "must be purchased separately".
 *
 * What the regulations do and don't say:
 *   - Montana takes the license price with the application. The p. 11 table lists when "drawing refunds" are
 *     mailed (combinations and deer/elk permits early May; Deer B, Elk B and archery antelope end of August;
 *     antelope and Antelope B early September).
 *   - Not refunded: "a $5 nonrefundable application fee for each license or permit you apply for", in addition to
 *     its cost; the prerequisite Conservation, Base Hunting and AIS licenses; elk permits.
 *   - The printed drawing prices appear to include that $5 where it can be checked: a Deer B by drawing is $5 more
 *     than over the counter ($15 vs $10 resident, $80 vs $75 nonresident), and the Elk B line says "includes drawing
 *     fee". The deer permit is $5, "application fee only". So the $5 is not added again here.
 *   - Not stated: whether bonus or preference point fees come back to an unsuccessful applicant. You keep the point;
 *     we don't say the fee is refunded.
 *   - Nonresident Antelope B: the nonresident chart prints no Antelope B drawing price, so none is shown.
 */
import type { MtBonusType, MtComboType } from './mtPoints';

export const MT_FEES_SOURCE = 'https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/2026/2026-dea-regulations-final-with-low-resolution-maps-for-web.pdf';
export const MT_FEES_YEAR = 2026;
export const MT_APP_FEE = 5;

export const MT_PREREQ = {
  res: [{ label: 'Conservation License', amount: 8 }, { label: 'Base Hunting License', amount: 10 }, { label: 'Aquatic Invasive Species Prevention Pass (16+)', amount: 2 }],
  nr: [{ label: 'Conservation License', amount: 10 }, { label: 'Base Hunting License', amount: 50 }, { label: 'Aquatic Invasive Species Prevention Pass', amount: 7.5 }],
} as const;

/** Price of applying for each bonus-point license type, as the chart prints it (null = not printed). */
export const MT_DRAW_PRICE: Record<MtBonusType, { res: number; nr: number | null; refundable: boolean; note?: string }> = {
  DEER_PERMIT: { res: 5, nr: 5, refundable: false, note: 'application fee only' },
  ELK_PERMIT: { res: 9, nr: 9, refundable: false, note: 'elk permits are nonrefundable' },
  ANTELOPE: { res: 19, nr: 205, refundable: true },
  DEER_B: { res: 15, nr: 80, refundable: true },
  ELK_B: { res: 25, nr: 275, refundable: true },
  ANTELOPE_B: { res: 19, nr: null, refundable: true },
};
export const MT_COMBO_PRICE: Record<MtComboType, number> = { BIG_GAME: 1312, ELK: 1112, DEER: 760 };
export const MT_GENERAL_RES = { DEER: 16, ELK: 20 } as const;
export const MT_BONUS_POINT = { res: 2, nr: 20 } as const;
export const MT_PREF_POINT = 100;

/** When FWP mails drawing refunds (2026 regulations p. 11). */
export const MT_REFUND_MAILED: Record<'COMBO' | MtBonusType, string> = {
  COMBO: 'early May', DEER_PERMIT: 'early May', ELK_PERMIT: 'early May',
  DEER_B: 'end of August', ELK_B: 'end of August', ANTELOPE: 'early September', ANTELOPE_B: 'early September',
};

export interface MtCostItem { label: string; amount: number | null }
export interface MtCost {
  apply: MtCostItem[];
  /** what comes back if you don't draw, and when, in words */
  ifNot: string;
  ifDraw: string;
  prereq: MtCostItem[];
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const mtMoney = money;

/** Itemised cost of one application: what you pay to apply, what happens if you draw and if you don't. */
export function mtApplicationCost(type: MtBonusType, nr: boolean, buyingPoint: boolean): MtCost {
  const p = MT_DRAW_PRICE[type], pool = nr ? 'nr' : 'res';
  const price = nr ? p.nr : p.res;
  const apply: MtCostItem[] = [{ label: `License or permit, by drawing${p.note ? ` (${p.note})` : ''}`, amount: price }];
  if (buyingPoint) apply.push({ label: 'Bonus point for this license type', amount: MT_BONUS_POINT[pool] });
  const ifNot = !p.refundable
    ? `Nothing comes back: ${p.note}.`
    : `FWP mails drawing refunds ${MT_REFUND_MAILED[type]}. The ${money(MT_APP_FEE)} application fee in that price and the prerequisite licenses are not refunded; FWP doesn't say whether the bonus point fee is (you keep the point).`;
  return { apply, ifNot, ifDraw: 'Nothing more to pay: the license was paid with the application.', prereq: [...MT_PREREQ[pool]] };
}

/** A nonresident's combination license application. */
export function mtComboCost(combo: MtComboType, buyingPoint: boolean): MtCost {
  const apply: MtCostItem[] = [{ label: `${combo === 'BIG_GAME' ? 'Big Game' : combo === 'ELK' ? 'Elk' : 'Deer'} Combination, by drawing`, amount: MT_COMBO_PRICE[combo] }];
  if (buyingPoint) apply.push({ label: 'Preference point, optional (only at application)', amount: MT_PREF_POINT });
  return {
    apply,
    ifNot: `FWP mails drawing refunds ${MT_REFUND_MAILED.COMBO}; the ${money(MT_APP_FEE)} application fee is not refunded, and FWP doesn't say whether the point fee is (you keep the point).`,
    ifDraw: 'Nothing more to pay. Returned before Aug. 1, FWP may refund 80%; from Aug. 1 to the season, 50%.',
    prereq: [...MT_PREREQ.nr],
  };
}

/** A resident's general license: over the counter, no draw. */
export function mtGeneralResCost(species: 'DEER' | 'ELK'): MtCost {
  return {
    apply: [{ label: `General ${species === 'ELK' ? 'Elk' : 'Deer'} License, over the counter`, amount: MT_GENERAL_RES[species] }],
    ifNot: 'There is no draw.', ifDraw: 'Bought over the counter; youth and seniors pay half.', prereq: [...MT_PREREQ.res],
  };
}
