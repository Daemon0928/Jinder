import { describe, it, expect } from 'vitest';
import { computeDedupeKey } from '../../src/lib/dedupe';

describe('computeDedupeKey', () => {
  it('collapses diacritics, case, punctuation and company suffixes', () => {
    const a = computeDedupeKey('OTP Bank Nyrt.', 'Szoftverfejlesztő (Senior)');
    const b = computeDedupeKey('OTP BANK', 'szoftverfejleszto senior');
    expect(a).toBe('otp bank::szoftverfejleszto senior');
    expect(b).toBe(a);
  });

  it('differs when the role differs', () => {
    expect(computeDedupeKey('Acme', 'Frontend Developer')).not.toBe(
      computeDedupeKey('Acme', 'Backend Developer'),
    );
  });

  it('differs when the company differs', () => {
    expect(computeDedupeKey('Acme', 'Developer')).not.toBe(
      computeDedupeKey('Globex', 'Developer'),
    );
  });

  it('returns null for unknown or empty parts (must never collapse unknowns)', () => {
    expect(computeDedupeKey('Unknown Company', 'Developer')).toBeNull();
    expect(computeDedupeKey('Acme', 'Unknown Position')).toBeNull();
    expect(computeDedupeKey('', 'Developer')).toBeNull();
    expect(computeDedupeKey('Acme', '')).toBeNull();
    expect(computeDedupeKey('***', '!!!')).toBeNull();
  });
});
