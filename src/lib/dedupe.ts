/**
 * Cross-platform duplicate detection. The same vacancy often appears on
 * Profession.hu, No Fluff Jobs, and the company's own career page; the
 * dedupe key lets those listings share one Gemini evaluation and lets the
 * UI badge siblings ("also on profession").
 */

/** Lowercase, strip diacritics and noise words, keep alphanumerics. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics: fejlesztő -> fejleszto
    .replace(/\b(kft|zrt|bt|nyrt|ltd|llc|inc|gmbh|plc|co|corp)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Stable key for "same role at same company". Empty when either part is
 * unknown — unknown-company rows must never collapse into each other.
 */
export function computeDedupeKey(company: string, title: string): string | null {
  const normCompany = normalize(company);
  const normTitle = normalize(title);
  if (!normCompany || !normTitle) return null;
  if (normCompany === 'unknown company' || normTitle === 'unknown position') return null;
  return `${normCompany}::${normTitle}`;
}
