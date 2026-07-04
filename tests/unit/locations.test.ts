import { describe, it, expect } from 'vitest';
import { LOCATIONS, getLocation } from '../../src/lib/locations';

describe('locations', () => {
  it('resolves keys case-insensitively', () => {
    expect(getLocation('Budapest')?.professionId).toBe('23');
    expect(getLocation('BUDAPEST')?.nofluffCity).toBe('Budapest');
  });

  it('returns undefined for unknown keys', () => {
    expect(getLocation('atlantis')).toBeUndefined();
  });

  it('maps work styles to remote for No Fluff Jobs', () => {
    expect(getLocation('tavmunka')?.nofluffCity).toBe('remote');
    expect(getLocation('home_office')?.nofluffSlug).toBe('remote');
  });

  it('work styles carry a profession home-office id instead of a location id', () => {
    for (const key of ['tavmunka', 'home_office']) {
      const entry = getLocation(key)!;
      expect(entry.professionHomeOfficeId).toBeTruthy();
      expect(entry.professionSlug).toBe('');
    }
  });

  it('every real location has consistent platform mappings', () => {
    for (const [key, entry] of Object.entries(LOCATIONS)) {
      if (entry.professionHomeOfficeId) continue;
      expect(entry.professionSlug, key).not.toBe('');
      expect(Number(entry.professionId), key).toBeGreaterThan(0);
      expect(entry.nofluffCity, key).not.toBe('');
      expect(entry.nofluffSlug, key).not.toBe('');
    }
  });
});
