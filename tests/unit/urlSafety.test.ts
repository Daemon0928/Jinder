import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertSafePublicUrl, isValidDiscordWebhookUrl, UnsafeUrlError } from '../../src/lib/urlSafety';

const savedEnv = { NODE_ENV: process.env.NODE_ENV, ALLOW_PRIVATE_URLS: process.env.ALLOW_PRIVATE_URLS };

describe('assertSafePublicUrl', () => {
  beforeEach(() => {
    // Exercise the real (non-test-mode) validation paths
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRIVATE_URLS;
  });
  afterEach(() => {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
    if (savedEnv.ALLOW_PRIVATE_URLS !== undefined) {
      process.env.ALLOW_PRIVATE_URLS = savedEnv.ALLOW_PRIVATE_URLS;
    }
  });

  const blocked = [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://localhost/x',
    'http://api.localhost/x',
    'http://intranet.local/x',
    'http://127.0.0.1/x',
    'http://0.0.0.0/x',
    'http://10.1.2.3/x',
    'http://172.16.0.1/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/latest/meta-data', // cloud metadata endpoint
    'http://100.64.0.1/x', // CGNAT
    'http://[::1]/x',
    'http://[fe80::1]/x',
    'not-a-url',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      await expect(assertSafePublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    });
  }

  it('allows a public https URL', async () => {
    // Uses a real DNS lookup; dns.google resolves to public addresses.
    const url = await assertSafePublicUrl('https://dns.google/');
    expect(url.hostname).toBe('dns.google');
  });

  it('allows private targets in test mode', async () => {
    process.env.NODE_ENV = 'test';
    await expect(assertSafePublicUrl('http://localhost:5001/x')).resolves.toBeInstanceOf(URL);
  });

  it('still blocks file:// in test mode', async () => {
    process.env.NODE_ENV = 'test';
    await expect(assertSafePublicUrl('file:///etc/passwd')).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe('isValidDiscordWebhookUrl', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_PRIVATE_URLS;
  });
  afterEach(() => {
    process.env.NODE_ENV = savedEnv.NODE_ENV;
  });

  it('accepts discord.com webhook URLs', () => {
    expect(isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123/token')).toBe(true);
    expect(isValidDiscordWebhookUrl('https://discordapp.com/api/webhooks/123/token')).toBe(true);
  });

  it('rejects non-Discord and non-https URLs', () => {
    expect(isValidDiscordWebhookUrl('https://evil.example.com/api/webhooks/123')).toBe(false);
    expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/token')).toBe(false);
    expect(isValidDiscordWebhookUrl('https://discord.com/other/path')).toBe(false);
    expect(isValidDiscordWebhookUrl('not a url')).toBe(false);
  });

  it('accepts any http(s) URL in test mode (mock webhook server)', () => {
    process.env.NODE_ENV = 'test';
    expect(isValidDiscordWebhookUrl('http://localhost:5001/webhook')).toBe(true);
  });
});
