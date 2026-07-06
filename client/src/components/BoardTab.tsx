import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Job, JobStatus } from '../api/types';
import { JOB_STATUSES, STATUS_LABELS } from '../api/types';
import { useToast } from '../context/toast';
import Spinner from './ui/Spinner';

interface BoardTabProps {
  /** Open a card in the Jobs tab for full details / notes. */
  onOpenJob: (job: Job) => void;
  searchQuery: string;
  minScore: number;
  onFilteredCountChange: (count: number) => void;
}

function scoreClass(score: number): string {
  if (score >= 75) return 'high';
  if (score >= 45) return 'medium';
  if (score >= 0) return 'low';
  return 'none';
}

export default function BoardTab({
  onOpenJob,
  searchQuery,
  minScore,
  onFilteredCountChange,
}: BoardTabProps) {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);
  const loadedOnce = useRef(false);

  // Client-side text filter and score filter on the board
  const query = searchQuery.toLowerCase();
  const filteredJobs = jobs.filter((job) => {
    const matchesQuery =
      !query ||
      job.title.toLowerCase().includes(query) ||
      job.company.toLowerCase().includes(query) ||
      (job.location && job.location.toLowerCase().includes(query)) ||
      (job.parsed_json?.techStack &&
        job.parsed_json.techStack.some((t) => t.toLowerCase().includes(query)));
    const matchesScore = job.match_score >= minScore;
    return matchesQuery && matchesScore;
  });

  useEffect(() => {
    onFilteredCountChange(filteredJobs.length);
  }, [filteredJobs.length, onFilteredCountChange]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getJobs();
      setJobs(data);
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const moveJob = useCallback(
    async (id: number, status: JobStatus) => {
      const current = jobs.find((j) => j.id === id);
      if (!current || current.status === status) return;

      // Optimistic move; revert on failure.
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
      try {
        await api.updateJobStatus(id, status);
      } catch (err) {
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: current.status } : j)));
        showToast(err instanceof ApiError ? err.message : 'Failed to move job', 'error');
      }
    },
    [jobs, showToast],
  );

  if (loading) {
    return (
      <div className="details-empty">
        <Spinner />
        <p>Loading your application board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="details-empty">
        <span className="details-empty-icon" aria-hidden="true">Error</span>
        <p>{error}</p>
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="board-scroll">
      <div className="kanban-board">
        {JOB_STATUSES.map((status) => {
          const columnJobs = filteredJobs.filter((j) => j.status === status);
          return (
            <div
              key={status}
              className={`kanban-column ${dragOver === status ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== status) setDragOver(status);
              }}
              onDragLeave={(e) => {
                // Only clear when leaving the column, not moving over a child.
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                if (dragId !== null) void moveJob(dragId, status);
                setDragId(null);
              }}
            >
              <div className="kanban-column-header">
                <span className="kanban-column-title">{STATUS_LABELS[status]}</span>
                <span className="kanban-column-count">{columnJobs.length}</span>
              </div>

              <div className="kanban-column-body">
                {columnJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`kanban-card ${dragId === job.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDragId(job.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOver(null);
                    }}
                    onClick={() => onOpenJob(job)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenJob(job);
                      }
                    }}
                  >
                    <div className="kanban-card-top">
                      <span className={`platform-badge ${job.platform}`}>{job.platform}</span>
                      <span className={`score-badge sm ${scoreClass(job.match_score)}`}>
                        {job.match_score >= 0 ? `${job.match_score}%` : 'N/A'}
                      </span>
                    </div>
                    <div className="kanban-card-title">{job.title}</div>
                    <div className="kanban-card-company">{job.company}</div>
                    {job.notes && job.notes.trim() !== '' && (
                      <div className="kanban-card-note" title={job.notes}>
                        Note: {job.notes.trim().slice(0, 60)}
                        {job.notes.trim().length > 60 ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}

                {columnJobs.length === 0 && (
                  <div className="kanban-empty">Drop jobs here</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
