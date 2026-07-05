import { useCallback, useState } from 'react';
import { api, ApiError } from './api/client';
import type { Job } from './api/types';
import { defaultProgress } from './api/types';
import { useJobs } from './hooks/useJobs';
import { useConfig } from './hooks/useConfig';
import { useScrapeStatus } from './hooks/useScrapeStatus';
import { useScheduler } from './hooks/useScheduler';
import { ToastProvider } from './context/ToastContext';
import { useToast } from './context/toast';
import { Sidebar, MobileBottomNav } from './components/Nav';
import type { Tab } from './components/Nav';
import ScrapeProgressPanel from './components/ScrapeProgressPanel';
import JobsTab from './components/JobsTab';
import BoardTab from './components/BoardTab';
import AnalyticsTab from './components/AnalyticsTab';
import CvTab from './components/CvTab';
import SettingsTab from './components/SettingsTab';
import ConfirmDialog from './components/ui/ConfirmDialog';
import { RefreshIcon } from './components/ui/Icon';

const TAB_HEADERS: Record<Tab, { title: string; subtitle: string }> = {
  jobs: { title: 'Your Job Matches', subtitle: 'AI-scored job postings scraped from Hungarian portals' },
  board: { title: 'Application Board', subtitle: 'Drag jobs through your application pipeline' },
  analytics: { title: 'Analytics', subtitle: 'Match quality and scraping activity at a glance' },
  cv: { title: 'My CV & Profile', subtitle: 'Upload CV details used for semantic similarity checks' },
  settings: {
    title: 'Scraper Configuration',
    subtitle: 'Define search target terms and trigger active scraping runs',
  },
};

function AppShell() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('jobs');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [filters, setFilters] = useState({ searchQuery: '', statusFilter: 'all', minScore: 0 });

  const { jobs, loading, error, refresh: refreshJobs } = useJobs(
    filters.statusFilter,
    filters.minScore,
  );
  const { config, update: updateConfig, save: saveConfig, refresh: refreshConfig } = useConfig();
  const { progress, setProgress, isScraping } = useScrapeStatus(() => void refreshJobs());
  const { status: schedulerStatus, refresh: refreshScheduler } = useScheduler(
    activeTab === 'settings',
  );

  // Derive the displayed job from fresh list data (falls back to the stored
  // snapshot when the job drops out of the current filter view).
  const displayedJob = selectedJob
    ? (jobs.find((j) => j.id === selectedJob.id) ?? selectedJob)
    : null;

  const handleStartScraping = useCallback(async () => {
    if (isScraping) return;
    setProgress({ ...defaultProgress, isScraping: true, phase: 'searching' });
    try {
      await api.startScrape();
    } catch (err) {
      setProgress(defaultProgress);
      showToast(err instanceof ApiError ? err.message : 'Failed to start scraping', 'error');
    }
  }, [isScraping, setProgress, showToast]);

  const handleStartReevaluation = useCallback(
    async (batchSize: number) => {
      if (isScraping) return;
      setProgress({ ...defaultProgress, isScraping: true, phase: 'reevaluating' });
      try {
        await api.startReevaluation(batchSize);
      } catch (err) {
        setProgress(defaultProgress);
        showToast(err instanceof ApiError ? err.message : 'Failed to start reevaluation', 'error');
      }
    },
    [isScraping, setProgress, showToast],
  );

  const handleUpdateStatus = useCallback(
    async (id: number, status: Job['status']) => {
      try {
        await api.updateJobStatus(id, status);
        void refreshJobs();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to update job status', 'error');
      }
    },
    [refreshJobs, showToast],
  );

  const handleUpdateNotes = useCallback(
    async (id: number, notes: string) => {
      try {
        await api.updateJobNotes(id, notes);
        void refreshJobs();
        showToast('Notes saved.', 'success');
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to save notes', 'error');
      }
    },
    [refreshJobs, showToast],
  );

  const handleOpenJobFromBoard = useCallback((job: Job) => {
    setSelectedJob(job);
    setActiveTab('jobs');
  }, []);

  const confirmDeleteJob = useCallback(async () => {
    if (pendingDeleteId === null) return;
    try {
      await api.deleteJob(pendingDeleteId);
      setSelectedJob(null);
      void refreshJobs();
      showToast('Job deleted.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to delete job', 'error');
    } finally {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, refreshJobs, showToast]);

  const handleSaveConfig = useCallback(async () => {
    await saveConfig(config);
  }, [saveConfig, config]);

  const header = TAB_HEADERS[activeTab];

  return (
    <div className={`app-container ${selectedJob ? 'has-selected-job' : ''}`}>
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onReselectJobs={() => setSelectedJob(null)}
        isScraping={isScraping}
        onStartScrape={handleStartScraping}
      />

      <main className="main-content">
        <header className="main-header">
          <div className="header-title">
            <h1>{header.title}</h1>
            <p>{header.subtitle}</p>
          </div>

          <div className="header-actions">
            {!isScraping && (
              <div className="scraper-status-bar">
                <span className="status-dot" aria-hidden="true"></span>
                <span>Idle</span>
              </div>
            )}

            {activeTab === 'jobs' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartScraping}
                disabled={isScraping}
              >
                <RefreshIcon />
                {isScraping ? 'Running Scan...' : 'Scrape Portals Now'}
              </button>
            )}
          </div>
        </header>

        {isScraping && <ScrapeProgressPanel progress={progress} />}

        {activeTab === 'jobs' && (
          <JobsTab
            jobs={jobs}
            loading={loading}
            error={error}
            filters={filters}
            onFiltersChange={(partial) => setFilters((prev) => ({ ...prev, ...partial }))}
            selectedJob={displayedJob}
            onSelectJob={setSelectedJob}
            onRetry={refreshJobs}
            onUpdateStatus={handleUpdateStatus}
            onUpdateNotes={handleUpdateNotes}
            onDeleteJob={setPendingDeleteId}
          />
        )}

        {activeTab === 'board' && <BoardTab onOpenJob={handleOpenJobFromBoard} />}

        {activeTab === 'analytics' && <AnalyticsTab />}

        {activeTab === 'cv' && (
          <CvTab
            config={config}
            onConfigChange={updateConfig}
            onSave={handleSaveConfig}
            onRefreshConfig={refreshConfig}
            isScraping={isScraping}
            scrapePhase={progress.phase}
            onStartReevaluation={handleStartReevaluation}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            config={config}
            onConfigChange={updateConfig}
            onSave={handleSaveConfig}
            schedulerStatus={schedulerStatus}
            onSchedulerChanged={refreshScheduler}
          />
        )}
      </main>

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onReselectJobs={() => setSelectedJob(null)}
        isScraping={isScraping}
        onStartScrape={handleStartScraping}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete job listing"
        message="Are you sure you want to delete this job listing from your database?"
        confirmLabel="Delete"
        onConfirm={confirmDeleteJob}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
