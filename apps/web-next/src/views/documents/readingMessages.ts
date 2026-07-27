/**
 * Rotating copy for the AI "reading" spinner — land-deed-specific, ordered to
 * feel like it's progressing through a real deed rather than just repeating
 * "Reading…". Ported verbatim from the rhub AddPropertyModal.
 */
import { useEffect, useState } from 'react';

export const READING_MESSAGES = [
  'Reading your document…',
  'Finding the plot number and extent…',
  'Opening the schedule — this is where the boundaries live…',
  'Measuring the four boundaries…',
  'Working out the plot dimensions…',
  'Identifying the buyer and seller…',
  'Noting the SRO, document number and date…',
  'Cross-checking the area against the measurements…',
  'Almost there — putting it together…',
];

/**
 * Advances through READING_MESSAGES every ~2800ms while `active`, stopping
 * (and staying) at the last message rather than wrapping back to the first;
 * resets + stops when `active` goes false.
 */
export function useReadingMessage(active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const t = setInterval(() => {
      setIndex((i) => {
        const next = Math.min(i + 1, READING_MESSAGES.length - 1);
        if (next === READING_MESSAGES.length - 1) clearInterval(t);
        return next;
      });
    }, 2800);
    return () => clearInterval(t);
  }, [active]);
  return READING_MESSAGES[index];
}
