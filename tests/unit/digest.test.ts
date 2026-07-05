import { describe, it, expect } from 'vitest';
import { renderDigestHtml, renderDigestText } from '../../src/notify/render';
import type { DigestPayload } from '../../src/notify/types';

const payload: DigestPayload = {
  periodDays: 7,
  generatedAt: '2026-07-05T00:00:00.000Z',
  jobs: [
    {
      title: 'Senior TS Engineer',
      company: 'Acme & Co',
      location: 'Budapest',
      link: 'https://example.com/1',
      score: 92,
      justification: 'Great fit',
    },
    {
      title: 'React Developer',
      company: 'Beta',
      location: 'Remote',
      link: 'https://example.com/2',
      score: 84,
      justification: 'Solid overlap',
    },
  ],
};

describe('renderDigestHtml', () => {
  it('renders every job with score, link and company', () => {
    const html = renderDigestHtml(payload);
    expect(html).toContain('Senior TS Engineer');
    expect(html).toContain('React Developer');
    expect(html).toContain('92% match');
    expect(html).toContain('https://example.com/1');
    // "top 2 matches from the last 7 days" — plural wording
    expect(html).toContain('Top 2 matches');
    expect(html).toContain('7 days');
  });

  it('escapes HTML-significant characters in job fields', () => {
    const html = renderDigestHtml(payload);
    expect(html).toContain('Acme &amp; Co');
    expect(html).not.toContain('Acme & Co');
  });

  it('uses singular wording for a single job and single day', () => {
    const html = renderDigestHtml({ ...payload, periodDays: 1, jobs: [payload.jobs[0]] });
    expect(html).toContain('Top 1 match ');
    expect(html).toContain('1 day.');
  });
});

describe('renderDigestText', () => {
  it('produces a plain-text line per job with the link', () => {
    const text = renderDigestText(payload);
    expect(text).toContain('92% — Senior TS Engineer @ Acme & Co (Budapest)');
    expect(text).toContain('https://example.com/2');
  });
});
