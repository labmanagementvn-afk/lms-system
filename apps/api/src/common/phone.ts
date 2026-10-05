/** Normalizes a Vietnamese phone number to local digits: "+84 98 765 4321" -> "0987654321". */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input.replace(/\D/g, '');
  if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
  return /^0\d{9,10}$/.test(d) ? d : null;
}
