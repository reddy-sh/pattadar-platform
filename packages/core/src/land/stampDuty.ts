/**
 * Stamp-duty math (landcalc-style, AP-IGRS convention): duty is charged on
 * the HIGHER of the declared consideration and the guideline market value.
 * Pure functions, no dependencies. Rates are fractions (0.05 = 5%).
 */

export interface DutyRates {
  /** e.g. "Sale Deed" */
  regTypeEn: string;
  /** e.g. "Sale of immovable property" */
  natureEn: string;
  stampRate: number;
  transferRate: number;
  regRate: number;
  userRate: number;
}

export interface DutyBreakdown {
  /** The chargeable value — max(consideration, marketValue). */
  basis: number;
  basisSource: 'consideration' | 'market value';
  stampDuty: number;
  transferDuty: number;
  registrationFee: number;
  userCharges: number;
  total: number;
}

export function calcStampDuty(
  consideration: number,
  marketValue: number,
  rates: DutyRates,
): DutyBreakdown {
  const c = Math.max(0, Number(consideration) || 0);
  const m = Math.max(0, Number(marketValue) || 0);
  const basis = Math.max(c, m);
  const basisSource = basis === c && c >= m ? 'consideration' : 'market value';
  const stampDuty = Math.round(basis * rates.stampRate);
  const transferDuty = Math.round(basis * rates.transferRate);
  const registrationFee = Math.round(basis * rates.regRate);
  const userCharges = Math.round(basis * rates.userRate);
  return {
    basis,
    basisSource,
    stampDuty,
    transferDuty,
    registrationFee,
    userCharges,
    total: stampDuty + transferDuty + registrationFee + userCharges,
  };
}
