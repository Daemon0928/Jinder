import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AnalyticsData } from '../api/types';
import Spinner from './ui/Spinner';

/**
 * Chart colors (validated against --bg-card #151824: lightness band, chroma,
 * CVD separation, >= 3:1 contrast). Categorical slots are assigned to entities
 * in fixed order and never cycled; magnitude charts use the single blue hue.
 */
const SERIES = { blue: '#3987e5', aqua: '#199e70', yellow: '#c98500' };
const PLATFORM_COLOR: Record<string, string> = {
  profession: SERIES.blue,
  nofluffjobs: SERIES.aqua,
  career: SERIES.yellow,
};

export default function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getAnalytics()
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load analytics'),
      );
  }, []);

  if (error) {
    return (
      <div className="settings-card">
        <div className="details-empty">
          <span className="details-empty-icon" aria-hidden="true">⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="settings-card">
        <div className="details-empty">
          <Spinner />
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  const { totals, scoreHistogram, platforms, topCompanies, runs } = data;
  const histogramMax = Math.max(...scoreHistogram.map((b) => b.count), 1);
  const peakBucket = scoreHistogram.reduce((a, b) => (b.count > a.count ? b : a));
  const platformMax = Math.max(...platforms.map((p) => p.count), 1);
  const companyMax = Math.max(...topCompanies.map((c) => c.count), 1);
  const runsMax = Math.max(...runs.map((r) => Math.max(r.newJobs, r.matched)), 1);

  return (
    <div className="analytics-grid">
      {/* Headline stat tiles */}
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-value">{totals.jobs}</span>
          <span className="stat-label">Jobs collected</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{totals.scored}</span>
          <span className="stat-label">AI-scored</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{totals.highMatches}</span>
          <span className="stat-label">Matches ≥ 80%</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{totals.avgScore ?? '—'}{totals.avgScore != null && '%'}</span>
          <span className="stat-label">Average score</span>
        </div>
      </div>

      {/* Score distribution — single-series histogram, single hue, no legend */}
      <div className="chart-card">
        <h3 className="chart-title">Match score distribution</h3>
        {totals.scored === 0 ? (
          <p className="card-description">No scored jobs yet — run a scrape first.</p>
        ) : (
          <>
            <div className="histogram" role="img" aria-label="Histogram of match scores in 10-point buckets">
              {scoreHistogram.map((b) => (
                <div key={b.bucket} className="histogram-col" title={`${b.bucket}%: ${b.count} job${b.count === 1 ? '' : 's'}`}>
                  {b === peakBucket && b.count > 0 && (
                    <span className="bar-value">{b.count}</span>
                  )}
                  <div
                    className="histogram-bar"
                    style={{
                      height: `${Math.round((b.count / histogramMax) * 100)}%`,
                      background: SERIES.blue,
                    }}
                  ></div>
                  <span className="histogram-x">{b.bucket.split('–')[0]}</span>
                </div>
              ))}
            </div>
            <p className="axis-note">score bucket (lower bound) → count; hover a bar for exact values</p>
          </>
        )}
      </div>

      {/* Jobs per platform — categorical identity, fixed color per platform */}
      <div className="chart-card">
        <h3 className="chart-title">Jobs per platform</h3>
        <div className="hbar-list">
          {platforms.map((p) => (
            <div key={p.platform} className="hbar-row" title={`${p.platform}: ${p.count} jobs, avg score ${p.avgScore ?? '—'}%`}>
              <span className="hbar-label">{p.platform}</span>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{
                    width: `${Math.round((p.count / platformMax) * 100)}%`,
                    background: PLATFORM_COLOR[p.platform] ?? SERIES.blue,
                  }}
                ></div>
              </div>
              <span className="hbar-value">
                {p.count}
                {p.avgScore != null && <span className="hbar-sub"> · avg {p.avgScore}%</span>}
              </span>
            </div>
          ))}
          {platforms.length === 0 && <p className="card-description">No data yet.</p>}
        </div>
      </div>

      {/* Scrape runs over time — two series, grouped bars, legend required */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">Scrape runs (last {runs.length})</h3>
        {runs.length === 0 ? (
          <p className="card-description">No scrape runs recorded yet.</p>
        ) : (
          <>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: SERIES.blue }}></span>New jobs
              </span>
              <span className="legend-item">
                <span className="legend-swatch" style={{ background: SERIES.aqua }}></span>Matched
              </span>
            </div>
            <div className="runs-chart" role="img" aria-label="New and matched jobs per scrape run">
              {runs.map((r, i) => (
                <div
                  key={i}
                  className="runs-group"
                  title={`${new Date(r.startedAt).toLocaleString()} (${r.trigger}): ${r.newJobs} new, ${r.matched} matched`}
                >
                  <div
                    className="runs-bar"
                    style={{ height: `${Math.round((r.newJobs / runsMax) * 100)}%`, background: SERIES.blue }}
                  ></div>
                  <div
                    className="runs-bar"
                    style={{ height: `${Math.round((r.matched / runsMax) * 100)}%`, background: SERIES.aqua }}
                  ></div>
                </div>
              ))}
            </div>
            <p className="axis-note">oldest → newest; hover a run for details</p>
          </>
        )}
      </div>

      {/* Top companies — magnitude ranking, single hue */}
      <div className="chart-card chart-card-wide">
        <h3 className="chart-title">Top companies by listings</h3>
        <div className="hbar-list">
          {topCompanies.map((c) => (
            <div key={c.company} className="hbar-row" title={`${c.company}: ${c.count} listings, avg score ${c.avgScore ?? '—'}%`}>
              <span className="hbar-label" >{c.company}</span>
              <div className="hbar-track">
                <div
                  className="hbar-fill"
                  style={{
                    width: `${Math.round((c.count / companyMax) * 100)}%`,
                    background: SERIES.blue,
                  }}
                ></div>
              </div>
              <span className="hbar-value">
                {c.count}
                {c.avgScore != null && <span className="hbar-sub"> · avg {c.avgScore}%</span>}
              </span>
            </div>
          ))}
          {topCompanies.length === 0 && <p className="card-description">No data yet.</p>}
        </div>
      </div>
    </div>
  );
}
