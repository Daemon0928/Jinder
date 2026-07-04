import type { ScrapeProgress } from '../api/types';

function getPhaseLabel(phase: ScrapeProgress['phase']) {
  switch (phase) {
    case 'searching':
      return 'Searching portals...';
    case 'fetching':
      return 'Fetching job details...';
    case 'matching':
      return 'AI matching with CV...';
    case 'saving':
      return 'Saving to database...';
    case 'reevaluating':
      return 'Reevaluating jobs with CV...';
    case 'done':
      return 'Complete';
  }
}

export default function ScrapeProgressPanel({ progress }: { progress: ScrapeProgress }) {
  return (
    <div className="scrape-progress-panel" aria-live="polite">
      <div className="progress-header">
        <div className="progress-phase-row">
          <div className="progress-pulse" aria-hidden="true"></div>
          <span className="progress-phase-label">{getPhaseLabel(progress.phase)}</span>
          {progress.totalKeywords > 1 && (
            <span className="progress-keyword-badge">
              Keyword {progress.keywordIndex}/{progress.totalKeywords}: "{progress.currentKeyword}"
            </span>
          )}
        </div>
        {progress.currentJobTitle && (
          <div className="progress-current-job">
            <span className="progress-job-icon" aria-hidden="true">
              {progress.phase === 'matching' ? '🤖' : progress.phase === 'fetching' ? '🔍' : '💾'}
            </span>
            <span className="progress-job-title">{progress.currentJobTitle}</span>
          </div>
        )}
      </div>

      {progress.totalJobs > 0 && (
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.round((progress.currentJobIndex / progress.totalJobs) * 100)}%`,
            }}
          ></div>
          <span className="progress-bar-label">
            {progress.currentJobIndex} / {progress.totalJobs} jobs
          </span>
        </div>
      )}

      <div className="progress-stats-row">
        <div className="progress-stat">
          <span className="progress-stat-value stat-new">{progress.newJobs}</span>
          <span className="progress-stat-label">New</span>
        </div>
        <div className="progress-stat">
          <span className="progress-stat-value stat-matched">{progress.matched}</span>
          <span className="progress-stat-label">Matched</span>
        </div>
        <div className="progress-stat">
          <span className="progress-stat-value stat-skipped">{progress.skipped}</span>
          <span className="progress-stat-label">Skipped</span>
        </div>
        {progress.errors > 0 && (
          <div className="progress-stat">
            <span className="progress-stat-value stat-errors">{progress.errors}</span>
            <span className="progress-stat-label">Errors</span>
          </div>
        )}
      </div>
    </div>
  );
}
