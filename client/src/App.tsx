import { useState, useEffect } from "react";

interface Job {
  id: number;
  job_id: string;
  platform: string;
  title: string;
  company: string;
  location: string;
  link: string;
  description: string;
  parsed_json: {
    title: string;
    company: string;
    location: string;
    description: string;
    techStack: string[];
    salary: string;
  } | null;
  match_score: number;
  match_pros: string[];
  match_cons: string[];
  match_justification: string;
  status: "new" | "bookmarked" | "applied" | "rejected";
  created_at: string;
}

interface ScrapeProgress {
  isScraping: boolean;
  phase: "searching" | "fetching" | "matching" | "saving" | "done" | "reevaluating";
  currentJobIndex: number;
  totalJobs: number;
  currentJobTitle: string;
  currentKeyword: string;
  keywordIndex: number;
  totalKeywords: number;
  newJobs: number;
  matched: number;
  skipped: number;
  errors: number;
}

const defaultProgress: ScrapeProgress = {
  isScraping: false,
  phase: "done",
  currentJobIndex: 0,
  totalJobs: 0,
  currentJobTitle: "",
  currentKeyword: "",
  keywordIndex: 0,
  totalKeywords: 0,
  newJobs: 0,
  matched: 0,
  skipped: 0,
  errors: 0,
};

interface LocationOption {
  key: string;
  name: string;
  slug: string;
  id: string;
  homeOfficeId?: string;
}

const LOCATION_OPTIONS: LocationOption[] = [
  { key: "budapest", name: "Budapest", slug: "budapest", id: "23" },
  { key: "pest", name: "Pest megye", slug: "pest", id: "37" },
  { key: "debrecen", name: "Debrecen", slug: "debrecen", id: "32" },
  { key: "szeged", name: "Szeged", slug: "szeged", id: "29" },
  { key: "miskolc", name: "Miskolc", slug: "miskolc", id: "28" },
  { key: "pecs", name: "Pécs", slug: "pecs", id: "26" },
  { key: "gyor", name: "Győr", slug: "gyor", id: "31" },
  { key: "nyiregyhaza", name: "Nyíregyháza", slug: "nyiregyhaza", id: "39" },
  { key: "kecskemet", name: "Kecskemét", slug: "kecskemet", id: "25" },
  { key: "szekesfehervar", name: "Székesfehérvár", slug: "szekesfehervar", id: "30" },
  { key: "szombathely", name: "Szombathely", slug: "szombathely", id: "41" },
  { key: "szolnok", name: "Szolnok", slug: "jasz-nagykun-szolnok", id: "34" },
  { key: "tatabanya", name: "Tatabánya", slug: "tatabanya", id: "35" },
  { key: "kaposvar", name: "Kaposvár", slug: "kaposvar", id: "38" },
  { key: "bekescsaba", name: "Békéscsaba", slug: "bekescsaba", id: "27" },
  { key: "veszprem", name: "Veszprém", slug: "veszprem", id: "42" },
  { key: "zalaegerszeg", name: "Zalaegerszeg", slug: "zalaegerszeg", id: "43" },
  { key: "eger", name: "Eger (Heves)", slug: "heves", id: "33" },
  { key: "salgotarjan", name: "Salgótarján", slug: "salgotarjan", id: "36" },
  { key: "szekszard", name: "Szekszárd", slug: "szekszard", id: "40" },
  { key: "tavmunka", name: "Távmunka / Remote", slug: "", id: "0", homeOfficeId: "6" },
  { key: "home_office", name: "Hibrid / Home office", slug: "", id: "0", homeOfficeId: "5" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"jobs" | "settings" | "cv">(
    "jobs",
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Config state
  const [cvText, setCvText] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newExcludeKeyword, setNewExcludeKeyword] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [batchSize, setBatchSize] = useState<number>(10);
  const [reevalBatchSize, setReevalBatchSize] = useState<number>(10);

  // PDF upload state
  const [cvFilename, setCvFilename] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cvSummary, setCvSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Scraping state
  const [scrapeProgress, setScrapeProgress] =
    useState<ScrapeProgress>(defaultProgress);
  const isScraping = scrapeProgress.isScraping;
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Scheduler state
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [schedulerIntervalHours, setSchedulerIntervalHours] = useState(4);
  const [schedulerNextRun, setSchedulerNextRun] = useState<string | null>(null);
  const [schedulerLastRun, setSchedulerLastRun] = useState<string | null>(null);
  const [schedulerLastSummary, setSchedulerLastSummary] = useState<any | null>(null);

  // Fetch jobs list
  const fetchJobs = async () => {
    try {
      let url = "/api/jobs";
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (minScore > 0) params.append("minScore", minScore.toString());

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setJobs(data);

        // Re-select currently selected job to get updated state
        if (selectedJob) {
          const updated = data.find((j: Job) => j.id === selectedJob.id);
          if (updated) setSelectedJob(updated);
        }
      }
    } catch (err) {
      console.error("Error fetching jobs:", err);
    }
  };

  // Fetch CV and keywords
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setCvText(data.cv);
        setKeywords(data.keywords || []);
        setExcludeKeywords(data.excludeKeywords || []);
        setLocations(data.locations || []);
        setCompanies(data.companies || []);
        setCvFilename(data.cvFilename || null);
        setCvSummary(data.cvSummary || null);
        setDiscordWebhook(data.discordWebhook || "");
        setBatchSize(data.batchSize || 10);
        setReevalBatchSize(prev => prev === 10 ? (data.batchSize || 10) : prev);
      }
    } catch (err) {
      console.error("Error fetching config:", err);
    }
  };

  // Check backend scraping status
  const checkScrapingStatus = async () => {
    try {
      const res = await fetch("/api/scrape/status");
      if (res.ok) {
        const data: ScrapeProgress = await res.json();
        setScrapeProgress(data);
      }
    } catch (err) {
      console.error("Error checking scrape status:", err);
    }
  };

  // Fetch Scheduler Status
  const fetchSchedulerStatus = async () => {
    try {
      const res = await fetch("/api/scheduler/status");
      if (res.ok) {
        const data = await res.json();
        setSchedulerEnabled(data.enabled);
        setSchedulerIntervalHours(data.intervalHours);
        setSchedulerNextRun(data.nextRunAt);
        setSchedulerLastRun(data.lastRunAt);
        setSchedulerLastSummary(data.lastRunSummary);
      }
    } catch (err) {
      console.error("Error fetching scheduler status:", err);
    }
  };

  // Toggle Scheduler start/stop
  const handleToggleScheduler = async () => {
    try {
      const endpoint = schedulerEnabled ? "/api/scheduler/stop" : "/api/scheduler/start";
      const res = await fetch(endpoint, { method: "POST" });
      if (res.ok) {
        fetchSchedulerStatus();
      }
    } catch (err) {
      console.error("Error toggling scheduler:", err);
    }
  };

  // Update Scheduler interval
  const handleUpdateSchedulerConfig = async (hours: number) => {
    if (isNaN(hours) || hours <= 0) {
      alert("Please enter a valid number of hours.");
      return;
    }
    try {
      const res = await fetch("/api/scheduler/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalHours: hours }),
      });
      if (res.ok) {
        fetchSchedulerStatus();
        alert("Scheduler interval updated successfully.");
      } else {
        const data = await res.json();
        alert(`Error: ${data.error || "Failed to update interval"}`);
      }
    } catch (err) {
      console.error("Error updating scheduler config:", err);
    }
  };

  // Initial loads & polling
  useEffect(() => {
    fetchJobs();
    fetchConfig();
    checkScrapingStatus();
    fetchSchedulerStatus();
  }, [statusFilter, minScore]);

  // Poll scheduler status when Settings tab is active
  useEffect(() => {
    let interval: any;
    if (activeTab === "settings") {
      fetchSchedulerStatus();
      interval = setInterval(() => {
        fetchSchedulerStatus();
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  // Poll scraping status when running (poll faster for smooth progress updates)
  useEffect(() => {
    let interval: any;
    if (isScraping) {
      interval = setInterval(() => {
        checkScrapingStatus();
        fetchJobs(); // refresh list to show newly scraped matching jobs in real time
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScraping]);

  // Update a job's status
  const handleUpdateStatus = async (
    id: number,
    status: "new" | "bookmarked" | "applied" | "rejected",
  ) => {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchJobs();
      }
    } catch (err) {
      console.error("Error updating job status:", err);
    }
  };

  // Delete a job listing
  const handleDeleteJob = async (id: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this job listing from your database?",
      )
    )
      return;
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSelectedJob(null);
        fetchJobs();
      }
    } catch (err) {
      console.error("Error deleting job:", err);
    }
  };

  // Save CV and keywords to DB
  const handleSaveConfig = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: cvText, keywords, excludeKeywords, discordWebhook, locations, companies, batchSize }),
      });
      if (res.ok) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      setSaveStatus("error");
    }
  };

  // Trigger scraper execution
  const handleStartScraping = async () => {
    if (isScraping) return;
    setScrapeProgress({
      ...defaultProgress,
      isScraping: true,
      phase: "searching",
    });
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      if (!res.ok) {
        setScrapeProgress(defaultProgress);
      }
    } catch (err) {
      setScrapeProgress(defaultProgress);
      console.error("Error launching scraper:", err);
    }
  };

  // Helper to get a human-readable phase label
  const getPhaseLabel = (phase: ScrapeProgress["phase"]) => {
    switch (phase) {
      case "searching":
        return "Searching portals...";
      case "fetching":
        return "Fetching job details...";
      case "matching":
        return "AI matching with CV...";
      case "saving":
        return "Saving to database...";
      case "reevaluating":
        return "Reevaluating jobs with CV...";
      case "done":
        return "Complete";
    }
  };

  // Handle PDF file upload
  const handlePdfUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are supported.");
      setUploadStatus("error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File is too large. Maximum size is 10 MB.");
      setUploadStatus("error");
      return;
    }

    setUploadStatus("uploading");
    setUploadError(null);
    setIsSummarizing(true);

    try {
      const formData = new FormData();
      formData.append("cv", file);

      const res = await fetch("/api/config/cv-upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setUploadStatus("success");
        setCvFilename(data.filename);
        setCvSummary(data.summary || null);
        // Refresh CV text from server
        await fetchConfig();
        setTimeout(() => setUploadStatus("idle"), 4000);
      } else {
        setUploadStatus("error");
        setUploadError(data.error || "Upload failed");
      }
    } catch (err) {
      setUploadStatus("error");
      setUploadError("Network error during upload.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePdfUpload(file);
  };

  // Add search keyword
  const handleAddKeyword = () => {
    if (newKeyword && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword("");
    }
  };

  // Remove search keyword
  const handleRemoveKeyword = (kwToRemove: string) => {
    setKeywords(keywords.filter((kw) => kw !== kwToRemove));
  };

  // Add exclude keyword
  const handleAddExcludeKeyword = () => {
    if (newExcludeKeyword && !excludeKeywords.includes(newExcludeKeyword.trim())) {
      setExcludeKeywords([...excludeKeywords, newExcludeKeyword.trim()]);
      setNewExcludeKeyword("");
    }
  };

  // Remove exclude keyword
  const handleRemoveExcludeKeyword = (kwToRemove: string) => {
    setExcludeKeywords(excludeKeywords.filter((kw) => kw !== kwToRemove));
  };

  // Add target company
  const handleAddCompany = () => {
    if (newCompany && !companies.includes(newCompany.trim())) {
      setCompanies([...companies, newCompany.trim()]);
      setNewCompany("");
    }
  };

  // Remove target company
  const handleRemoveCompany = (companyToRemove: string) => {
    setCompanies(companies.filter((c) => c !== companyToRemove));
  };

  // Trigger CV Reevaluation
  const handleTriggerReevaluate = async () => {
    if (isScraping) return;
    setScrapeProgress({
      ...defaultProgress,
      isScraping: true,
      phase: "reevaluating",
    });
    try {
      const res = await fetch("/api/scrape/reevaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: reevalBatchSize }),
      });
      if (!res.ok) {
        setScrapeProgress(defaultProgress);
        const errData = await res.json();
        alert(`Error: ${errData.error || "Failed to trigger reevaluation"}`);
      }
    } catch (err) {
      setScrapeProgress(defaultProgress);
      console.error("Error launching reevaluation:", err);
      alert("Failed to launch reevaluation.");
    }
  };

  // Toggle selected location
  const handleToggleLocation = (key: string) => {
    if (locations.includes(key)) {
      setLocations(locations.filter((loc) => loc !== key));
    } else {
      setLocations([...locations, key]);
    }
  };

  // Filter local jobs by query text
  const filteredJobs = jobs.filter((job) => {
    const query = searchQuery.toLowerCase();
    return (
      job.title.toLowerCase().includes(query) ||
      job.company.toLowerCase().includes(query) ||
      (job.location && job.location.toLowerCase().includes(query)) ||
      (job.parsed_json?.techStack &&
        job.parsed_json.techStack.some((t) => t.toLowerCase().includes(query)))
    );
  });

  return (
    <div className={`app-container ${selectedJob ? "has-selected-job" : ""}`}>
      {/* Mobile Top Bar */}
      <header className="mobile-top-bar">
        <div className="mobile-logo-container">
          <div className="logo-icon">J</div>
          <span className="logo-text">Jinder</span>
        </div>
        <div className="mobile-top-bar-actions">
          {activeTab === "jobs" && (
            <button
              className={`btn-mobile-scrape ${isScraping ? "scraping" : ""}`}
              onClick={handleStartScraping}
              disabled={isScraping}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>{isScraping ? "Scanning" : "Scrape"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">J</div>
          <span className="logo-text">Jinder</span>
        </div>

        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === "jobs" ? "active" : ""}`}
            onClick={() => setActiveTab("jobs")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Matched Jobs
          </button>

          <button
            className={`nav-item ${activeTab === "cv" ? "active" : ""}`}
            onClick={() => setActiveTab("cv")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            CV & Profile
          </button>

          <button
            className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Scraper Settings
          </button>
        </nav>

        <div className="sidebar-footer">Jinder Local Client v1.0.0</div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-title">
            {activeTab === "jobs" && (
              <>
                <h1>Your Job Matches</h1>
                <p>AI-scored job postings scraped from Hungarian portals</p>
              </>
            )}
            {activeTab === "cv" && (
              <>
                <h1>My CV & Profile</h1>
                <p>Upload CV details used for semantic similarity checks</p>
              </>
            )}
            {activeTab === "settings" && (
              <>
                <h1>Scraper Configuration</h1>
                <p>
                  Define search target terms and trigger active scraping runs
                </p>
              </>
            )}
          </div>

          <div className="header-actions">
            {!isScraping && (
              <div className="scraper-status-bar">
                <span className="status-dot"></span>
                <span>Idle</span>
              </div>
            )}

            {activeTab === "jobs" && (
              <button
                className="btn btn-primary"
                onClick={handleStartScraping}
                disabled={isScraping}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                {isScraping ? "Running Scan..." : "Scrape Portals Now"}
              </button>
            )}
          </div>
        </header>

        {/* Scraping Progress Panel */}
        {isScraping && (
          <div className="scrape-progress-panel">
            <div className="progress-header">
              <div className="progress-phase-row">
                <div className="progress-pulse"></div>
                <span className="progress-phase-label">
                  {getPhaseLabel(scrapeProgress.phase)}
                </span>
                {scrapeProgress.totalKeywords > 1 && (
                  <span className="progress-keyword-badge">
                    Keyword {scrapeProgress.keywordIndex}/
                    {scrapeProgress.totalKeywords}: "
                    {scrapeProgress.currentKeyword}"
                  </span>
                )}
              </div>
              {scrapeProgress.currentJobTitle && (
                <div className="progress-current-job">
                  <span className="progress-job-icon">
                    {scrapeProgress.phase === "matching"
                      ? "🤖"
                      : scrapeProgress.phase === "fetching"
                        ? "🔍"
                        : "💾"}
                  </span>
                  <span className="progress-job-title">
                    {scrapeProgress.currentJobTitle}
                  </span>
                </div>
              )}
            </div>

            {scrapeProgress.totalJobs > 0 && (
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.round((scrapeProgress.currentJobIndex / scrapeProgress.totalJobs) * 100)}%`,
                  }}
                ></div>
                <span className="progress-bar-label">
                  {scrapeProgress.currentJobIndex} / {scrapeProgress.totalJobs}{" "}
                  jobs
                </span>
              </div>
            )}

            <div className="progress-stats-row">
              <div className="progress-stat">
                <span className="progress-stat-value stat-new">
                  {scrapeProgress.newJobs}
                </span>
                <span className="progress-stat-label">New</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value stat-matched">
                  {scrapeProgress.matched}
                </span>
                <span className="progress-stat-label">Matched</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value stat-skipped">
                  {scrapeProgress.skipped}
                </span>
                <span className="progress-stat-label">Skipped</span>
              </div>
              {scrapeProgress.errors > 0 && (
                <div className="progress-stat">
                  <span className="progress-stat-value stat-errors">
                    {scrapeProgress.errors}
                  </span>
                  <span className="progress-stat-label">Errors</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab View: Jobs Feed */}
        {activeTab === "jobs" && (
          <>
            {/* Filters Bar */}
            <div className="filters-panel">
              <div className="filter-group">
                <label>Search Text</label>
                <input
                  type="text"
                  placeholder="Filter by title, company, stack..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-group">
                <label>Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Jobs</option>
                  <option value="new">New Matches</option>
                  <option value="bookmarked">Bookmarked</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Not Interested</option>
                </select>
              </div>

              <div className="filter-group">
                <label>Min Match Score</label>
                <div className="score-slider-container">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                  />
                  <span className="score-value">{minScore}%</span>
                </div>
              </div>
            </div>

            {/* Main Split Panels */}
            <div className="jobs-layout">
              {/* Left Column: Jobs List */}
              <div className="jobs-list-container">
                {filteredJobs.length === 0 ? (
                  <div className="details-empty">
                    <span className="details-empty-icon">📭</span>
                    <p>
                      No job matches found. Click "Scrape Portals Now" to fetch
                      new jobs.
                    </p>
                  </div>
                ) : (
                  filteredJobs.map((job) => {
                    const score = job.match_score;
                    let scoreClass = "none";
                    if (score >= 75) scoreClass = "high";
                    else if (score >= 45) scoreClass = "medium";
                    else if (score >= 0) scoreClass = "low";

                    return (
                      <div
                        key={job.id}
                        className={`job-card ${selectedJob?.id === job.id ? "selected" : ""}`}
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="job-card-info">
                          <div className="job-card-header">
                            <span className={`platform-badge ${job.platform}`}>
                              {job.platform}
                            </span>
                            {job.status !== "new" && (
                              <span
                                className={`platform-badge`}
                                style={{ opacity: 0.6 }}
                              >
                                {job.status}
                              </span>
                            )}
                          </div>
                          <div className="job-card-title">{job.title}</div>
                          <div className="job-card-meta">
                            <span>{job.company}</span>
                            <span className="meta-separator">•</span>
                            <span>{job.location || "Hungary"}</span>
                          </div>
                        </div>

                        <div className={`score-badge ${scoreClass}`}>
                          {score >= 0 ? `${score}%` : "N/A"}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Job Detailed Description */}
              <div className="job-details-container">
                {selectedJob ? (
                  <>
                    <div className="details-header">
                      <button
                        className="btn-back-mobile"
                        onClick={() => setSelectedJob(null)}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="19" y1="12" x2="5" y2="12"></line>
                          <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>Back to Job Matches</span>
                      </button>

                      <div className="details-actions-top">
                        <span
                          className={`platform-badge ${selectedJob.platform}`}
                        >
                          {selectedJob.platform}
                        </span>

                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() =>
                              window.open(selectedJob.link, "_blank")
                            }
                            style={{ padding: "6px 12px" }}
                          >
                            Open Posting ↗
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleDeleteJob(selectedJob.id)}
                            style={{
                              padding: "6px 12px",
                              borderColor: "var(--color-danger-glow)",
                              color: "var(--color-danger)",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <h2 className="details-title">{selectedJob.title}</h2>
                      <div className="details-company">
                        {selectedJob.company}
                      </div>

                      <div className="details-meta-items">
                        <div>📍 {selectedJob.location || "Hungary"}</div>
                        <div>
                          📅 Found:{" "}
                          {new Date(
                            selectedJob.created_at,
                          ).toLocaleDateString()}
                        </div>
                        {selectedJob.parsed_json?.salary && (
                          <div>💰 {selectedJob.parsed_json.salary}</div>
                        )}
                      </div>
                    </div>

                    <div className="details-body">
                      {/* Match Analysis */}
                      {selectedJob.match_score >= 0 && (
                        <div>
                          <div className="section-title">
                            🤖 AI Match Assessment
                          </div>
                          <div className="justification-card">
                            <strong>
                              Gemini score: {selectedJob.match_score}%
                            </strong>{" "}
                            — {selectedJob.match_justification}
                          </div>
                        </div>
                      )}

                      {/* Pros & Cons */}
                      {selectedJob.match_score >= 0 && (
                        <div className="pro-con-grid">
                          {selectedJob.match_pros.length > 0 && (
                            <div className="pro-con-list pros">
                              <div className="section-title">
                                ✔️ Strengths & Fits
                              </div>
                              {selectedJob.match_pros.map((pro, index) => (
                                <div key={index} className="list-item">
                                  <span className="icon-check">✓</span>
                                  <span>{pro}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {selectedJob.match_cons.length > 0 && (
                            <div className="pro-con-list cons">
                              <div className="section-title">
                                ⚠️ Gaps or Requirements
                              </div>
                              {selectedJob.match_cons.map((con, index) => (
                                <div key={index} className="list-item">
                                  <span className="icon-alert">!</span>
                                  <span>{con}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Tech Stack */}
                      {selectedJob.parsed_json?.techStack &&
                        selectedJob.parsed_json.techStack.length > 0 && (
                          <div>
                            <div className="section-title">
                              🛠️ Technology Stack
                            </div>
                            <div className="tag-cloud">
                              {selectedJob.parsed_json.techStack.map(
                                (tech, idx) => (
                                  <span key={idx} className="tech-tag">
                                    {tech}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {/* Description */}
                      <div>
                        <div className="section-title">📝 Job Summary</div>
                        <p
                          style={{
                            fontSize: "14px",
                            lineHeight: "1.6",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {selectedJob.parsed_json?.description ||
                            selectedJob.description.substring(0, 300) + "..."}
                        </p>
                      </div>
                    </div>

                    <div className="details-footer">
                      <button
                        className={`btn ${selectedJob.status === "bookmarked" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() =>
                          handleUpdateStatus(selectedJob.id, "bookmarked")
                        }
                      >
                        Bookmark
                      </button>
                      <button
                        className={`btn ${selectedJob.status === "applied" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() =>
                          handleUpdateStatus(selectedJob.id, "applied")
                        }
                      >
                        Applied
                      </button>
                      <button
                        className={`btn ${selectedJob.status === "rejected" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() =>
                          handleUpdateStatus(selectedJob.id, "rejected")
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="details-empty">
                    <span className="details-empty-icon">👈</span>
                    <h3>Select a Job</h3>
                    <p>
                      Select a job from the list to view the AI match details
                      and apply.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Tab View: CV Details */}
        {activeTab === "cv" && (
          <div className="settings-card">
            <h2>Your CV & Profile Details</h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "14px",
                marginBottom: "24px",
              }}
            >
              Upload a PDF or paste your CV text. Gemini will cross-reference
              this with job postings to calculate compatibility scores.
            </p>

            {/* PDF Upload Zone */}
            <div className="form-group">
              <label>Upload CV (PDF)</label>
              <div
                className={`pdf-dropzone ${isDragging ? "dragging" : ""} ${uploadStatus === "success" ? "success" : ""} ${uploadStatus === "error" ? "error" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".pdf";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handlePdfUpload(file);
                  };
                  input.click();
                }}
              >
                {uploadStatus === "uploading" ? (
                  <>
                    <div className="dropzone-spinner"></div>
                    <span className="dropzone-text">
                      Extracting text from PDF...
                    </span>
                  </>
                ) : uploadStatus === "success" ? (
                  <>
                    <span className="dropzone-icon">✓</span>
                    <span className="dropzone-text">
                      Uploaded successfully!
                    </span>
                  </>
                ) : (
                  <>
                    <span className="dropzone-icon">
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M12 18v-6" />
                        <path d="M9 15l3-3 3 3" />
                      </svg>
                    </span>
                    <span className="dropzone-text">
                      Drag & drop your PDF here, or click to browse
                    </span>
                    <span className="dropzone-hint">PDF only • Max 10 MB</span>
                  </>
                )}
              </div>

              {uploadError && <div className="upload-error">{uploadError}</div>}

              {cvFilename && uploadStatus !== "uploading" && (
                <div className="uploaded-file-info">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>
                    Current file: <strong>{cvFilename}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* AI-Generated CV Summary */}
            {(isSummarizing || cvSummary) && (
              <div className="form-group">
                <label>🤖 AI-Generated Summary</label>
                {isSummarizing ? (
                  <div className="cv-summary-card summarizing">
                    <div className="summary-spinner-wrapper">
                      <div className="dropzone-spinner"></div>
                      <span>Gemini is analyzing your CV...</span>
                    </div>
                  </div>
                ) : cvSummary ? (
                  <div className="cv-summary-card">
                    <div className="cv-summary-content">
                      {cvSummary.split("\n").map((line, i) => {
                        if (!line.trim()) return <br key={i} />;
                        if (line.startsWith("## "))
                          return (
                            <h3 key={i} className="summary-heading">
                              {line.replace("## ", "")}
                            </h3>
                          );
                        if (line.startsWith("- "))
                          return (
                            <li key={i} className="summary-list-item">
                              {line.replace("- ", "")}
                            </li>
                          );
                        return (
                          <p key={i} className="summary-paragraph">
                            {line}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="section-divider">
              <span>or edit extracted text manually</span>
            </div>

            {/* Manual Text Editing */}
            <div className="form-group">
              <label>CV Text (auto-filled from PDF or edit manually)</label>
              <textarea
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder="# John Doe&#10;&#10;## Tech Stack&#10;- TypeScript, React, Node.js, Express, Postgres&#10;&#10;## Experience&#10;- Software Engineer at Company..."
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <button className="btn btn-primary" onClick={handleSaveConfig}>
                Save CV Details
              </button>

              {saveStatus === "saving" && (
                <span
                  style={{ fontSize: "14px", color: "var(--text-secondary)" }}
                >
                  Saving...
                </span>
              )}
              {saveStatus === "success" && (
                <span
                  style={{ fontSize: "14px", color: "var(--color-success)" }}
                >
                  Saved successfully!
                </span>
              )}
              {saveStatus === "error" && (
                <span
                  style={{ fontSize: "14px", color: "var(--color-danger)" }}
                >
                  Error saving configuration.
                </span>
              )}
            </div>

            <div style={{ marginTop: "40px", borderTop: "1px solid var(--border-color)", paddingTop: "24px" }}>
              <h3>🔄 Reevaluate CV Matching</h3>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginTop: "8px",
                  marginBottom: "16px",
                }}
              >
                Re-run the Gemini matching logic on all existing jobs in the database. This is useful after you have updated your CV.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px" }}>Reevaluation Batch Size:</span>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={reevalBatchSize}
                    onChange={(e) => setReevalBatchSize(Number(e.target.value))}
                    style={{ width: "80px", padding: "8px", marginBottom: 0 }}
                    disabled={isScraping}
                  />
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handleTriggerReevaluate}
                  disabled={isScraping}
                  type="button"
                >
                  {isScraping && scrapeProgress.phase === "reevaluating" ? "Reevaluating..." : "Run Reevaluation Now"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab View: Settings */}
        {activeTab === "settings" && (
          <div className="settings-card">
            <h2>Scraper Settings</h2>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Search Keywords</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Add search queries for job scraping on Profession.hu.
              </p>

              <div className="keyword-manager">
                <div className="keyword-input-wrapper">
                  <input
                    type="text"
                    placeholder="E.g., frontend developer, react, szoftverfejlesztő"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleAddKeyword}
                  >
                    Add
                  </button>
                </div>

                <div className="keyword-tags">
                  {keywords.map((kw, idx) => (
                    <span key={idx} className="keyword-tag">
                      {kw}
                      <button
                        className="keyword-tag-remove"
                        onClick={() => handleRemoveKeyword(kw)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Exclude Keywords</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Filter out job postings that contain any of these keywords in their title or description.
              </p>

              <div className="keyword-manager">
                <div className="keyword-input-wrapper">
                  <input
                    type="text"
                    placeholder="E.g., intern, senior, PHP"
                    value={newExcludeKeyword}
                    onChange={(e) => setNewExcludeKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddExcludeKeyword()}
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleAddExcludeKeyword}
                  >
                    Add
                  </button>
                </div>

                <div className="keyword-tags">
                  {excludeKeywords.map((kw, idx) => (
                    <span key={idx} className="keyword-tag">
                      {kw}
                      <button
                        className="keyword-tag-remove"
                        type="button"
                        onClick={() => handleRemoveExcludeKeyword(kw)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Target Companies</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Add names of companies to scrape jobs directly (e.g., OTP Bank, Morgan Stanley). You can manually specify the career page URL using the format "Company Name|https://..." or just "https://..." to bypass search.
              </p>

              <div className="keyword-manager">
                <div className="keyword-input-wrapper">
                  <input
                    type="text"
                    placeholder="E.g., OTP Bank, Morgan Stanley, Lufthansa Systems"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCompany()}
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={handleAddCompany}
                  >
                    Add
                  </button>
                </div>

                <div className="keyword-tags">
                  {companies.map((company, idx) => (
                    <span key={idx} className="keyword-tag">
                      {company}
                      <button
                        className="keyword-tag-remove"
                        type="button"
                        onClick={() => handleRemoveCompany(company)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Target Locations & Working Styles</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                Select one or more locations and working styles. If none are selected, the scraper defaults to searching all of Hungary.
              </p>

              <div className="location-selector-group">
                <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px" }}>Working Styles</h4>
                <div className="location-grid styles" style={{ marginBottom: "16px" }}>
                  {LOCATION_OPTIONS.filter(opt => opt.homeOfficeId).map(opt => {
                    const isSelected = locations.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`location-card style-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleLocation(opt.key)}
                      >
                        <span className="location-checkbox">
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="location-name">{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="location-selector-group">
                <h4 style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "8px" }}>Cities & Counties</h4>
                <div className="location-grid">
                  {LOCATION_OPTIONS.filter(opt => !opt.homeOfficeId).map(opt => {
                    const isSelected = locations.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`location-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleLocation(opt.key)}
                      >
                        <span className="location-checkbox">
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="location-name">{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Scraping Batch Size</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Number of job postings to analyze in a single Gemini LLM call. Higher numbers reduce token usage and cost.
              </p>
              <input
                type="number"
                min="1"
                max="50"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                style={{ maxWidth: "150px" }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "32px" }}>
              <label>Discord Webhook URL</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "12px",
                }}
              >
                Receive notifications when highly matched jobs are found.
              </p>
              <input
                type="text"
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "32px", borderTop: "1px solid var(--border-color)", paddingTop: "24px" }}>
              <label>🕒 Scheduled Scraping Service</label>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                Configure automatic background job scanning at regular intervals.
              </p>

              <div className="scheduler-settings-box" style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                padding: "20px",
                marginBottom: "16px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <span style={{ fontSize: "14px", fontWeight: "bold", marginRight: "8px" }}>
                      Automatic Scheduler:
                    </span>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "bold",
                        backgroundColor: schedulerEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: schedulerEnabled ? "var(--color-success)" : "var(--color-danger)"
                      }}
                    >
                      {schedulerEnabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </div>

                  <button
                    className={`btn ${schedulerEnabled ? 'btn-secondary' : 'btn-primary'}`}
                    type="button"
                    onClick={handleToggleScheduler}
                  >
                    {schedulerEnabled ? "Disable Scheduler" : "Enable Scheduler"}
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: "20px" }}>
                  <label style={{ fontSize: "13px", marginBottom: "6px" }}>Scraping Interval (Hours)</label>
                  <div style={{ display: "flex", gap: "8px", maxWidth: "250px" }}>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={schedulerIntervalHours}
                      onChange={(e) => setSchedulerIntervalHours(Number(e.target.value))}
                      style={{ marginBottom: 0 }}
                    />
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => handleUpdateSchedulerConfig(schedulerIntervalHours)}
                    >
                      Update
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {schedulerEnabled && schedulerNextRun && (
                    <div>
                      📅 <strong>Next Scan:</strong> {new Date(schedulerNextRun).toLocaleString()}
                    </div>
                  )}
                  {schedulerLastRun && (
                    <div>
                      🔄 <strong>Last Scan:</strong> {new Date(schedulerLastRun).toLocaleString()}
                    </div>
                  )}
                  {schedulerLastSummary && (
                    <div style={{
                      marginTop: "12px",
                      padding: "12px",
                      backgroundColor: "rgba(255, 255, 255, 0.01)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                      borderRadius: "6px"
                    }}>
                      <div style={{ fontWeight: "bold", marginBottom: "6px", color: "var(--text-primary)" }}>Last Scan Summary:</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
                        <div>📋 Scraped: <strong>{schedulerLastSummary.totalScraped}</strong></div>
                        <div>✨ New: <strong>{schedulerLastSummary.newJobs}</strong></div>
                        <div>🤝 Matched: <strong>{schedulerLastSummary.matched}</strong></div>
                        <div>⚠️ Errors: <strong>{schedulerLastSummary.errors?.length || 0}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border-color)",
                paddingTop: "24px",
              }}
            >
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await handleSaveConfig();
                  alert("Settings saved successfully.");
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <button
          className={`bottom-nav-item ${activeTab === "jobs" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("jobs");
            if (activeTab === "jobs") {
              setSelectedJob(null);
            }
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <span>Jobs</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === "cv" ? "active" : ""}`}
          onClick={() => setActiveTab("cv")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>CV & Profile</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}
