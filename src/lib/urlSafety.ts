import dns from 'dns';
import net from 'net';

/**
 * Guards user-supplied URLs before the scraper navigates to them.
 * Blocks non-HTTP protocols (file:, etc.) and private/loopback/link-local
 * targets so config input can't be used to read local files or probe the
 * host network (SSRF).
 *
 * The e2e suite drives scrapers against localhost mocks, so private targets
 * are allowed when NODE_ENV=test or ALLOW_PRIVATE_URLS=true.
 */

function allowPrivateTargets(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_PRIVATE_URLS === 'true';
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)); // IPv4-mapped
    return false;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true; // unparseable → treat as unsafe
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Throws UnsafeUrlError unless the URL is http(s) and resolves to a public
 * address. Returns the parsed URL on success.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Only http(s) URLs are allowed, got "${url.protocol}//"`);
  }

  if (allowPrivateTargets()) {
    return url;
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeUrlError(`Refusing to fetch local host "${hostname}"`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch private address "${hostname}"`);
    }
    return url;
  }

  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}"`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new UnsafeUrlError(`Host "${hostname}" resolves to a private address`);
    }
  }

  return url;
}

/** Discord webhook URLs must point at Discord itself (any http(s) URL in test mode). */
export function isValidDiscordWebhookUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (allowPrivateTargets()) return true;
  if (url.protocol !== 'https:') return false;
  return (
    (url.hostname === 'discord.com' || url.hostname === 'discordapp.com') &&
    url.pathname.startsWith('/api/webhooks/')
  );
}
