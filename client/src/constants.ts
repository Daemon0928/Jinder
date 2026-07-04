export interface LocationOption {
  key: string;
  name: string;
  /** Set for work-style options (remote / home office). */
  isWorkStyle?: boolean;
}

export const LOCATION_OPTIONS: LocationOption[] = [
  { key: 'budapest', name: 'Budapest' },
  { key: 'pest', name: 'Pest megye' },
  { key: 'debrecen', name: 'Debrecen' },
  { key: 'szeged', name: 'Szeged' },
  { key: 'miskolc', name: 'Miskolc' },
  { key: 'pecs', name: 'Pécs' },
  { key: 'gyor', name: 'Győr' },
  { key: 'nyiregyhaza', name: 'Nyíregyháza' },
  { key: 'kecskemet', name: 'Kecskemét' },
  { key: 'szekesfehervar', name: 'Székesfehérvár' },
  { key: 'szombathely', name: 'Szombathely' },
  { key: 'szolnok', name: 'Szolnok' },
  { key: 'tatabanya', name: 'Tatabánya' },
  { key: 'kaposvar', name: 'Kaposvár' },
  { key: 'bekescsaba', name: 'Békéscsaba' },
  { key: 'veszprem', name: 'Veszprém' },
  { key: 'zalaegerszeg', name: 'Zalaegerszeg' },
  { key: 'eger', name: 'Eger (Heves)' },
  { key: 'salgotarjan', name: 'Salgótarján' },
  { key: 'szekszard', name: 'Szekszárd' },
  { key: 'tavmunka', name: 'Távmunka / Remote', isWorkStyle: true },
  { key: 'home_office', name: 'Hibrid / Home office', isWorkStyle: true },
];
