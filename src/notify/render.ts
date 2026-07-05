/** Pure rendering helpers for digest delivery (no I/O — unit-testable). */
import type { DigestPayload, DigestJob } from './types';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render one digest job as an HTML table row. */
function renderJobRow(job: DigestJob): string {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:13px;color:#6366f1;font-weight:700;">${job.score}% match</div>
        <div style="font-size:16px;font-weight:700;color:#111827;margin:2px 0;">
          <a href="${escapeHtml(job.link)}" style="color:#111827;text-decoration:none;">${escapeHtml(job.title)}</a>
        </div>
        <div style="font-size:13px;color:#6b7280;">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</div>
        <div style="font-size:13px;color:#374151;margin-top:6px;">${escapeHtml(job.justification.substring(0, 400))}</div>
      </td>
    </tr>`;
}

/** Build the full HTML body for a digest email. */
export function renderDigestHtml(digest: DigestPayload): string {
  const rows = digest.jobs.map(renderJobRow).join('');
  const jobWord = digest.jobs.length === 1 ? 'match' : 'matches';
  const dayWord = digest.periodDays === 1 ? 'day' : 'days';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
      <h1 style="font-size:20px;color:#111827;margin:0 0 4px;">📬 Your Jinder digest</h1>
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">
        Top ${digest.jobs.length} ${jobWord} from the last ${digest.periodDays} ${dayWord}.
      </p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>
  </body>
</html>`;
}

/** Plain-text fallback for clients that don't render HTML. */
export function renderDigestText(digest: DigestPayload): string {
  const jobWord = digest.jobs.length === 1 ? 'match' : 'matches';
  const dayWord = digest.periodDays === 1 ? 'day' : 'days';
  const lines = digest.jobs.map(
    (j) => `- ${j.score}% — ${j.title} @ ${j.company} (${j.location})\n  ${j.link}`,
  );
  return [
    `Your Jinder digest — top ${digest.jobs.length} ${jobWord} from the last ${digest.periodDays} ${dayWord}`,
    '',
    ...lines,
  ].join('\n');
}
