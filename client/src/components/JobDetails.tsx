import type { Job } from '../api/types';
import { BackArrowIcon } from './ui/Icon';

interface JobDetailsProps {
  job: Job;
  onBack: () => void;
  onUpdateStatus: (id: number, status: Job['status']) => void;
  onDelete: (id: number) => void;
}

export default function JobDetails({ job, onBack, onUpdateStatus, onDelete }: JobDetailsProps) {
  return (
    <>
      <div className="details-header">
        <button type="button" className="btn-back-mobile" onClick={onBack}>
          <BackArrowIcon />
          <span>Back to Job Matches</span>
        </button>

        <div className="details-actions-top">
          <span className={`platform-badge ${job.platform}`}>{job.platform}</span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              className="btn btn-secondary"
              href={job.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ padding: '6px 12px' }}
            >
              Open Posting ↗
            </a>
            <button
              type="button"
              className="btn btn-secondary btn-danger-outline"
              onClick={() => onDelete(job.id)}
              style={{ padding: '6px 12px' }}
            >
              Delete
            </button>
          </div>
        </div>

        <h2 className="details-title">{job.title}</h2>
        <div className="details-company">{job.company}</div>

        <div className="details-meta-items">
          <div>📍 {job.location || 'Hungary'}</div>
          <div>📅 Found: {new Date(job.created_at).toLocaleDateString()}</div>
          {job.parsed_json?.salary && <div>💰 {job.parsed_json.salary}</div>}
        </div>
      </div>

      <div className="details-body">
        {/* Match Analysis */}
        {job.match_score >= 0 && (
          <div>
            <div className="section-title">🤖 AI Match Assessment</div>
            <div className="justification-card">
              <strong>Gemini score: {job.match_score}%</strong> — {job.match_justification}
            </div>
          </div>
        )}

        {/* Pros & Cons */}
        {job.match_score >= 0 && (
          <div className="pro-con-grid">
            {job.match_pros.length > 0 && (
              <div className="pro-con-list pros">
                <div className="section-title">✔️ Strengths & Fits</div>
                {job.match_pros.map((pro, index) => (
                  <div key={index} className="list-item">
                    <span className="icon-check" aria-hidden="true">✓</span>
                    <span>{pro}</span>
                  </div>
                ))}
              </div>
            )}

            {job.match_cons.length > 0 && (
              <div className="pro-con-list cons">
                <div className="section-title">⚠️ Gaps or Requirements</div>
                {job.match_cons.map((con, index) => (
                  <div key={index} className="list-item">
                    <span className="icon-alert" aria-hidden="true">!</span>
                    <span>{con}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tech Stack */}
        {job.parsed_json?.techStack && job.parsed_json.techStack.length > 0 && (
          <div>
            <div className="section-title">🛠️ Technology Stack</div>
            <div className="tag-cloud">
              {job.parsed_json.techStack.map((tech, idx) => (
                <span key={idx} className="tech-tag">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <div className="section-title">📝 Job Summary</div>
          <p className="details-description">
            {job.parsed_json?.description || job.description.substring(0, 300) + '...'}
          </p>
        </div>
      </div>

      <div className="details-footer">
        <button
          type="button"
          className={`btn ${job.status === 'bookmarked' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onUpdateStatus(job.id, 'bookmarked')}
        >
          Bookmark
        </button>
        <button
          type="button"
          className={`btn ${job.status === 'applied' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onUpdateStatus(job.id, 'applied')}
        >
          Applied
        </button>
        <button
          type="button"
          className={`btn ${job.status === 'rejected' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onUpdateStatus(job.id, 'rejected')}
        >
          Reject
        </button>
      </div>
    </>
  );
}
