import type { Job } from '../api/types';
import JobDetails from './JobDetails';
import SkeletonCard from './ui/SkeletonCard';

interface JobsTabProps {
  jobs: Job[];
  filteredJobs: Job[];
  loading: boolean;
  error: string | null;
  selectedJob: Job | null;
  onSelectJob: (job: Job | null) => void;
  onRetry: () => void;
  onUpdateStatus: (id: number, status: Job['status']) => void;
  onUpdateNotes: (id: number, notes: string) => void;
  onDeleteJob: (id: number) => void;
}

function scoreClass(score: number): string {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  if (score >= 0) return 'low';
  return 'none';
}

export default function JobsTab({
  jobs,
  filteredJobs,
  loading,
  error,
  selectedJob,
  onSelectJob,
  onRetry,
  onUpdateStatus,
  onUpdateNotes,
  onDeleteJob,
}: JobsTabProps) {
  // Listings of the same role from other platforms (cross-platform dedup)
  const siblingPlatforms = (job: Job): string[] =>
    job.dedupe_key
      ? [...new Set(
          jobs
            .filter((j) => j.dedupe_key === job.dedupe_key && j.id !== job.id)
            .map((j) => j.platform),
        )]
      : [];

  return (
    <div className="jobs-layout">
      {/* Left Column: Jobs List */}
      <div className="jobs-list-container">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div className="details-empty">
            <span className="details-empty-icon" aria-hidden="true">Error</span>
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="details-empty">
            <span className="details-empty-icon" aria-hidden="true">Empty</span>
            <p>No job matches found. Click "Scrape Portals Now" to fetch new jobs.</p>
          </div>
        ) : (
            filteredJobs.map((job) => (
              <button
                key={job.id}
                type="button"
                className={`job-card ${selectedJob?.id === job.id ? 'selected' : ''}`}
                onClick={() => onSelectJob(job)}
              >
                <div className="job-card-info">
                  <div className="job-card-header">
                    <span className={`platform-badge ${job.platform}`}>{job.platform}</span>
                    {siblingPlatforms(job).map((platform) => (
                      <span key={platform} className="platform-badge sibling-badge">
                        also on {platform}
                      </span>
                    ))}
                    {job.status !== 'new' && (
                      <span className="platform-badge" style={{ opacity: 0.6 }}>
                        {job.status}
                      </span>
                    )}
                  </div>
                  <div className="job-card-title">{job.title}</div>
                  <div className="job-card-meta">
                    <span>{job.company}</span>
                    <span className="meta-separator" aria-hidden="true">•</span>
                    <span>{job.location || 'Hungary'}</span>
                  </div>
                </div>

                <div className={`score-badge ${scoreClass(job.match_score)}`}>
                  {job.match_score >= 0 ? `${job.match_score}%` : 'N/A'}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right Column: Job Detailed Description */}
        <div className="job-details-container">
          {selectedJob ? (
            <JobDetails
              key={JSON.stringify([selectedJob.id, selectedJob.notes ?? ''])}
              job={selectedJob}
              onBack={() => onSelectJob(null)}
              onUpdateStatus={onUpdateStatus}
              onUpdateNotes={onUpdateNotes}
              onDelete={onDeleteJob}
            />
          ) : (
            <div className="details-empty">
              <h3>Select a Job</h3>
              <p>Select a job from the list to view the AI match details and apply.</p>
            </div>
          )}
        </div>
      </div>
  );
}
