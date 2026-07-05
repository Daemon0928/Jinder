import { BriefcaseIcon, BoardIcon, ChartIcon, DocumentIcon, GearIcon, RefreshIcon } from './ui/Icon';

export type Tab = 'jobs' | 'board' | 'analytics' | 'settings' | 'cv';

interface NavProps {
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  /** Called when the active jobs tab is tapped again (mobile: back to list). */
  onReselectJobs: () => void;
  isScraping: boolean;
  onStartScrape: () => void;
}

const NAV_ITEMS: Array<{ tab: Tab; label: string; mobileLabel: string; icon: typeof BriefcaseIcon }> = [
  { tab: 'jobs', label: 'Matched Jobs', mobileLabel: 'Jobs', icon: BriefcaseIcon },
  { tab: 'board', label: 'Application Board', mobileLabel: 'Board', icon: BoardIcon },
  { tab: 'analytics', label: 'Analytics', mobileLabel: 'Stats', icon: ChartIcon },
  { tab: 'cv', label: 'CV & Profile', mobileLabel: 'CV', icon: DocumentIcon },
  { tab: 'settings', label: 'Scraper Settings', mobileLabel: 'Settings', icon: GearIcon },
];

/** Desktop sidebar + mobile top bar; the mobile bottom nav is a sibling export. */
export function Sidebar({ activeTab, onSelectTab, isScraping, onStartScrape }: NavProps) {
  return (
    <>
      {/* Mobile Top Bar */}
      <header className="mobile-top-bar">
        <div className="mobile-logo-container">
          <div className="logo-icon" aria-hidden="true">J</div>
          <span className="logo-text">Jinder</span>
        </div>
        <div className="mobile-top-bar-actions">
          {activeTab === 'jobs' && (
            <button
              type="button"
              className={`btn-mobile-scrape ${isScraping ? 'scraping' : ''}`}
              onClick={onStartScrape}
              disabled={isScraping}
            >
              <RefreshIcon />
              <span>{isScraping ? 'Scanning' : 'Scrape'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon" aria-hidden="true">J</div>
          <span className="logo-text">Jinder</span>
        </div>

        <nav className="nav-menu" aria-label="Main navigation">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              className={`nav-item ${activeTab === tab ? 'active' : ''}`}
              aria-current={activeTab === tab ? 'page' : undefined}
              onClick={() => onSelectTab(tab)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">Jinder Local Client v1.0.0</div>
      </aside>
    </>
  );
}

export function MobileBottomNav({ activeTab, onSelectTab, onReselectJobs }: NavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ tab, mobileLabel, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          className={`bottom-nav-item ${activeTab === tab ? 'active' : ''}`}
          aria-current={activeTab === tab ? 'page' : undefined}
          onClick={() => {
            if (tab === 'jobs' && activeTab === 'jobs') {
              onReselectJobs();
            }
            onSelectTab(tab);
          }}
        >
          <Icon size={20} />
          <span>{mobileLabel}</span>
        </button>
      ))}
    </nav>
  );
}
