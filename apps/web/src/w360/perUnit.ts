/** "an acre", "a sq.yd" — one of a record's extent unit, for a figure stated
 *  per unit ("₹10,837 an acre"). The server sends the unit as stored (`ac`,
 *  `acres`, `sqyd`, `sqft`, `cents`, `guntas`…); a unit it does not know is
 *  said as it came. Empty for no unit, so a caller can drop the figure. */
const UNIT_ONE: Record<string, string> = {
  ac: 'an acre', acre: 'an acre', acres: 'an acre',
  cent: 'a cent', cents: 'a cent',
  gunta: 'a gunta', guntas: 'a gunta',
  ha: 'a hectare', hectare: 'a hectare', hectares: 'a hectare',
  sqyd: 'a sq.yd', 'sq.yd': 'a sq.yd', sqyds: 'a sq.yd',
  sqft: 'a sq.ft', 'sq.ft': 'a sq.ft', sft: 'a sq.ft',
  sqm: 'a sq.m', 'sq.m': 'a sq.m',
};

export function perUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim();
  if (!u) return '';
  return UNIT_ONE[u.toLowerCase()] ?? `a ${u}`;
}
