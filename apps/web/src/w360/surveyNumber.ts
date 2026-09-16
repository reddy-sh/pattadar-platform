/** A whole survey number, including every subdivision. A record for 262/1
 * must never be treated as ownership of the department's entire plot 262. */
export function surveyNumber(value: string): string {
  const number = value.trim().toLowerCase()
    .replace(/^(?:survey|sy|plot)(?:\s*\.?\s*(?:no|number))?\.?\s*[:#]?\s*/, '');
  if (!/^\d+[a-z]?(?:\s*[/.-]\s*\d+[a-z]?)*$/.test(number)) return '';
  return number.replace(/\s/g, '').replace(/[.-]/g, '/')
    .replace(/(^|\/)0+(?=\d)/g, '$1');
}
