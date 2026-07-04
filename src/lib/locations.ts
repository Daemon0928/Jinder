/**
 * Unified location table. Config stores canonical lowercase keys
 * (e.g. "budapest", "tavmunka"); each scraper looks up its own
 * platform-specific representation here.
 */

export interface LocationEntry {
  /** Profession.hu URL slug ('' when the location is a work-style filter). */
  professionSlug: string;
  /** Profession.hu numeric location id ('0' when not a real place). */
  professionId: string;
  /** Profession.hu home-office filter id, when the key is a work style. */
  professionHomeOfficeId?: string;
  /** Display city name used by the No Fluff Jobs search API. */
  nofluffCity: string;
  /** URL slug used by the No Fluff Jobs HTML fallback crawl. */
  nofluffSlug: string;
}

export const LOCATIONS: Record<string, LocationEntry> = {
  budapest: { professionSlug: 'budapest', professionId: '23', nofluffCity: 'Budapest', nofluffSlug: 'budapest' },
  pest: { professionSlug: 'pest', professionId: '37', nofluffCity: 'Pest', nofluffSlug: 'pest' },
  debrecen: { professionSlug: 'debrecen', professionId: '32', nofluffCity: 'Debrecen', nofluffSlug: 'debrecen' },
  szeged: { professionSlug: 'szeged', professionId: '29', nofluffCity: 'Szeged', nofluffSlug: 'szeged' },
  miskolc: { professionSlug: 'miskolc', professionId: '28', nofluffCity: 'Miskolc', nofluffSlug: 'miskolc' },
  pecs: { professionSlug: 'pecs', professionId: '26', nofluffCity: 'Pécs', nofluffSlug: 'pecs' },
  gyor: { professionSlug: 'gyor', professionId: '31', nofluffCity: 'Győr', nofluffSlug: 'gyor' },
  nyiregyhaza: { professionSlug: 'nyiregyhaza', professionId: '39', nofluffCity: 'Nyíregyháza', nofluffSlug: 'nyiregyhaza' },
  kecskemet: { professionSlug: 'kecskemet', professionId: '25', nofluffCity: 'Kecskemét', nofluffSlug: 'kecskemet' },
  szekesfehervar: { professionSlug: 'szekesfehervar', professionId: '30', nofluffCity: 'Székesfehérvár', nofluffSlug: 'szekesfehervar' },
  szombathely: { professionSlug: 'szombathely', professionId: '41', nofluffCity: 'Szombathely', nofluffSlug: 'szombathely' },
  szolnok: { professionSlug: 'jasz-nagykun-szolnok', professionId: '34', nofluffCity: 'Szolnok', nofluffSlug: 'szolnok' },
  tatabanya: { professionSlug: 'tatabanya', professionId: '35', nofluffCity: 'Tatabánya', nofluffSlug: 'tatabanya' },
  kaposvar: { professionSlug: 'kaposvar', professionId: '38', nofluffCity: 'Kaposvár', nofluffSlug: 'kaposvar' },
  bekescsaba: { professionSlug: 'bekescsaba', professionId: '27', nofluffCity: 'Békéscsaba', nofluffSlug: 'bekescsaba' },
  veszprem: { professionSlug: 'veszprem', professionId: '42', nofluffCity: 'Veszprém', nofluffSlug: 'veszprem' },
  zalaegerszeg: { professionSlug: 'zalaegerszeg', professionId: '43', nofluffCity: 'Zalaegerszeg', nofluffSlug: 'zalaegerszeg' },
  eger: { professionSlug: 'heves', professionId: '33', nofluffCity: 'Eger', nofluffSlug: 'eger' },
  salgotarjan: { professionSlug: 'salgotarjan', professionId: '36', nofluffCity: 'Salgótarján', nofluffSlug: 'salgotarjan' },
  szekszard: { professionSlug: 'szekszard', professionId: '40', nofluffCity: 'Szekszárd', nofluffSlug: 'szekszard' },
  tavmunka: { professionSlug: '', professionId: '0', professionHomeOfficeId: '6', nofluffCity: 'remote', nofluffSlug: 'remote' },
  home_office: { professionSlug: '', professionId: '0', professionHomeOfficeId: '5', nofluffCity: 'remote', nofluffSlug: 'remote' },
};

export function getLocation(key: string): LocationEntry | undefined {
  return LOCATIONS[key.toLowerCase()];
}
