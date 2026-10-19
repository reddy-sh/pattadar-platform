/** Why a typed registration date cannot be saved, or '' when it can.
 *
 *  DD/MM/YYYY, day first — never `new Date(text)`, which reads "03/04/2026"
 *  as 4 March (the swap packages/core's parseISOToDisplay once had). Empty is
 *  allowed: an unknown date is left blank, not invented. */
export function dayFirstProblem(text: string): string {
  const s = text.trim();
  if (!s) return '';
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return 'Write the registration date as DD/MM/YYYY.';
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const when = new Date(year, month - 1, day);
  if (month < 1 || month > 12 || when.getFullYear() !== year || when.getMonth() !== month - 1
      || when.getDate() !== day) {
    return 'That registration date does not exist.';
  }
  if (year < 1800 || when.getTime() > Date.now()) return 'That registration date is not possible.';
  return '';
}
