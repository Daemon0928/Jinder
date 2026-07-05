import { useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AppConfig, SchedulerStatus } from '../api/types';
import { LOCATION_OPTIONS } from '../constants';
import { useToast } from '../context/toast';
import { useDigest } from '../hooks/useDigest';
import TagManager from './ui/TagManager';

interface SettingsTabProps {
  config: AppConfig;
  onConfigChange: (partial: Partial<AppConfig>) => void;
  onSave: () => Promise<void>;
  schedulerStatus: SchedulerStatus | null;
  onSchedulerChanged: () => void;
}

export default function SettingsTab({
  config,
  onConfigChange,
  onSave,
  schedulerStatus,
  onSchedulerChanged,
}: SettingsTabProps) {
  const { showToast } = useToast();
  const { status: digestStatus, refresh: refreshDigest } = useDigest(true);
  const [intervalHours, setIntervalHours] = useState<number | null>(null);
  const schedulerEnabled = schedulerStatus?.enabled ?? false;
  const effectiveInterval = intervalHours ?? schedulerStatus?.intervalHours ?? 4;
  const lastSummary = schedulerStatus?.lastRunSummary ?? null;

  const handleToggleScheduler = async () => {
    try {
      await api.setSchedulerEnabled(!schedulerEnabled);
      onSchedulerChanged();
      showToast(`Scheduler ${schedulerEnabled ? 'disabled' : 'enabled'}.`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to toggle scheduler', 'error');
    }
  };

  const handleUpdateInterval = async () => {
    if (Number.isNaN(effectiveInterval) || effectiveInterval <= 0) {
      showToast('Please enter a valid number of hours.', 'error');
      return;
    }
    try {
      await api.updateSchedulerInterval(effectiveInterval);
      onSchedulerChanged();
      showToast('Scheduler interval updated.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update interval', 'error');
    }
  };

  const handleSave = async () => {
    try {
      await onSave();
      showToast('Settings saved successfully.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Error saving settings', 'error');
    }
  };

  const updateEmail = (partial: Partial<AppConfig['email']>) => {
    onConfigChange({ email: { ...config.email, ...partial } });
  };

  const handleDigestConfig = async (
    patch: Partial<{ enabled: boolean; intervalDays: number; minScore: number; maxJobs: number }>,
  ) => {
    try {
      await api.updateDigestConfig(patch);
      void refreshDigest();
      showToast('Digest settings updated.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to update digest', 'error');
    }
  };

  const handleSendDigest = async () => {
    try {
      const res = await api.sendDigest();
      void refreshDigest();
      showToast(
        res.sent
          ? `Digest sent with ${res.jobCount} job${res.jobCount === 1 ? '' : 's'}.`
          : 'No new matches to include in a digest right now.',
        res.sent ? 'success' : 'error',
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to send digest', 'error');
    }
  };

  const digestEnabled = digestStatus?.enabled ?? false;

  const workStyles = LOCATION_OPTIONS.filter((opt) => opt.isWorkStyle);
  const cities = LOCATION_OPTIONS.filter((opt) => !opt.isWorkStyle);

  const toggleLocation = (key: string) => {
    onConfigChange({
      locations: config.locations.includes(key)
        ? config.locations.filter((loc) => loc !== key)
        : [...config.locations, key],
    });
  };

  const renderLocationButton = (opt: (typeof LOCATION_OPTIONS)[number], extraClass = '') => {
    const isSelected = config.locations.includes(opt.key);
    return (
      <button
        key={opt.key}
        type="button"
        className={`location-card ${extraClass} ${isSelected ? 'selected' : ''}`}
        aria-pressed={isSelected}
        onClick={() => toggleLocation(opt.key)}
      >
        <span className="location-checkbox" aria-hidden="true">
          {isSelected ? '✓' : ''}
        </span>
        <span className="location-name">{opt.name}</span>
      </button>
    );
  };

  return (
    <div className="settings-card">
      <h2>Scraper Settings</h2>

      <TagManager
        label="Search Keywords"
        description="Add search queries for job scraping on Profession.hu."
        placeholder="E.g., frontend developer, react, szoftverfejlesztő"
        values={config.keywords}
        onChange={(keywords) => onConfigChange({ keywords })}
      />

      <TagManager
        label="Exclude Keywords"
        description="Filter out job postings that contain any of these keywords in their title or description."
        placeholder="E.g., intern, senior, PHP"
        values={config.excludeKeywords}
        onChange={(excludeKeywords) => onConfigChange({ excludeKeywords })}
      />

      <TagManager
        label="Target Companies"
        description={
          'Add names of companies to scrape jobs directly (e.g., OTP Bank, Morgan Stanley). You can manually specify the career page URL using the format "Company Name|https://..." or just "https://..." to bypass search.'
        }
        placeholder="E.g., OTP Bank, Morgan Stanley, Lufthansa Systems"
        values={config.companies}
        onChange={(companies) => onConfigChange({ companies })}
      />

      <div className="form-group" style={{ marginBottom: '32px' }}>
        <label>Target Locations & Working Styles</label>
        <p className="card-description" style={{ marginBottom: '16px' }}>
          Select one or more locations and working styles. If none are selected, the scraper
          defaults to searching all of Hungary.
        </p>

        <div className="location-selector-group">
          <h4 className="location-group-heading">Working Styles</h4>
          <div className="location-grid styles" style={{ marginBottom: '16px' }}>
            {workStyles.map((opt) => renderLocationButton(opt, 'style-card'))}
          </div>
        </div>

        <div className="location-selector-group">
          <h4 className="location-group-heading">Cities & Counties</h4>
          <div className="location-grid">{cities.map((opt) => renderLocationButton(opt))}</div>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '32px' }}>
        <label htmlFor="batch-size">Scraping Batch Size</label>
        <p className="card-description" style={{ marginBottom: '12px' }}>
          Number of job postings to analyze in a single Gemini LLM call. Higher numbers reduce
          token usage and cost.
        </p>
        <input
          id="batch-size"
          type="number"
          min="1"
          max="50"
          value={config.batchSize}
          onChange={(e) => onConfigChange({ batchSize: Number(e.target.value) })}
          style={{ maxWidth: '150px' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: '32px' }}>
        <label htmlFor="discord-webhook">Discord Webhook URL</label>
        <p className="card-description" style={{ marginBottom: '12px' }}>
          Receive notifications when highly matched jobs are found.
          {config.discordWebhookSet && ' A webhook is configured — paste a new URL to replace it.'}
        </p>
        <input
          id="discord-webhook"
          type="text"
          placeholder="https://discord.com/api/webhooks/..."
          value={config.discordWebhook}
          onChange={(e) => onConfigChange({ discordWebhook: e.target.value })}
        />
      </div>

      <div className="form-group scheduler-section">
        <label>🕒 Scheduled Scraping Service</label>
        <p className="card-description" style={{ marginBottom: '16px' }}>
          Configure automatic background job scanning at regular intervals.
        </p>

        <div className="scheduler-settings-box">
          <div className="scheduler-status-row">
            <div>
              <span style={{ fontSize: '14px', fontWeight: 'bold', marginRight: '8px' }}>
                Automatic Scheduler:
              </span>
              <span className={`scheduler-badge ${schedulerEnabled ? 'enabled' : 'disabled'}`}>
                {schedulerEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>

            <button
              type="button"
              className={`btn ${schedulerEnabled ? 'btn-secondary' : 'btn-primary'}`}
              onClick={handleToggleScheduler}
            >
              {schedulerEnabled ? 'Disable Scheduler' : 'Enable Scheduler'}
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label htmlFor="scheduler-interval" style={{ fontSize: '13px', marginBottom: '6px' }}>
              Scraping Interval (Hours)
            </label>
            <div style={{ display: 'flex', gap: '8px', maxWidth: '250px' }}>
              <input
                id="scheduler-interval"
                type="number"
                min="1"
                max="168"
                value={effectiveInterval}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                style={{ marginBottom: 0 }}
              />
              <button type="button" className="btn btn-secondary" onClick={handleUpdateInterval}>
                Update
              </button>
            </div>
          </div>

          <div className="scheduler-info">
            {schedulerEnabled && schedulerStatus?.nextRunAt && (
              <div>
                📅 <strong>Next Scan:</strong>{' '}
                {new Date(schedulerStatus.nextRunAt).toLocaleString()}
              </div>
            )}
            {schedulerStatus?.lastRunAt && (
              <div>
                🔄 <strong>Last Scan:</strong>{' '}
                {new Date(schedulerStatus.lastRunAt).toLocaleString()}
              </div>
            )}
            {lastSummary && (
              <div className="scheduler-summary-card">
                <div className="scheduler-summary-title">Last Scan Summary:</div>
                <div className="scheduler-summary-grid">
                  <div>
                    📋 Scraped: <strong>{lastSummary.totalScraped}</strong>
                  </div>
                  <div>
                    ✨ New: <strong>{lastSummary.newJobs}</strong>
                  </div>
                  <div>
                    🤝 Matched: <strong>{lastSummary.matched}</strong>
                  </div>
                  <div>
                    ⚠️ Errors: <strong>{lastSummary.errors?.length || 0}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '32px' }}>
        <label>📧 Email (SMTP) for Digests</label>
        <p className="card-description" style={{ marginBottom: '12px' }}>
          Configure an SMTP server to receive the weekly digest by email. Saved with the button
          below.
        </p>
        <div className="smtp-grid">
          <div className="form-group">
            <label htmlFor="smtp-host" className="sub-label">Host</label>
            <input
              id="smtp-host"
              type="text"
              placeholder="smtp.gmail.com"
              value={config.email.smtpHost}
              onChange={(e) => updateEmail({ smtpHost: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="smtp-port" className="sub-label">Port</label>
            <input
              id="smtp-port"
              type="text"
              placeholder="587"
              value={config.email.smtpPort}
              onChange={(e) => updateEmail({ smtpPort: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="smtp-user" className="sub-label">Username</label>
            <input
              id="smtp-user"
              type="text"
              placeholder="you@gmail.com"
              value={config.email.smtpUser}
              onChange={(e) => updateEmail({ smtpUser: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="smtp-pass" className="sub-label">
              Password {config.email.smtpPassSet && '(set — leave blank to keep)'}
            </label>
            <input
              id="smtp-pass"
              type="password"
              placeholder={config.email.smtpPassSet ? '••••••••' : 'app password'}
              value={config.email.smtpPass ?? ''}
              onChange={(e) => updateEmail({ smtpPass: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email-from" className="sub-label">From</label>
            <input
              id="email-from"
              type="text"
              placeholder="Jinder <you@gmail.com>"
              value={config.email.from}
              onChange={(e) => updateEmail({ from: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="email-to" className="sub-label">To</label>
            <input
              id="email-to"
              type="text"
              placeholder="you@gmail.com"
              value={config.email.to}
              onChange={(e) => updateEmail({ to: e.target.value })}
            />
          </div>
        </div>
        <label className="smtp-secure-row">
          <input
            type="checkbox"
            checked={config.email.smtpSecure}
            onChange={(e) => updateEmail({ smtpSecure: e.target.checked })}
          />
          Use TLS on connect (port 465)
        </label>
      </div>

      <div className="form-group scheduler-section">
        <label>📬 Weekly Match Digest</label>
        <p className="card-description" style={{ marginBottom: '16px' }}>
          Periodically send a roundup of your top new matches to every configured channel
          (Discord and/or Email).
        </p>

        <div className="scheduler-settings-box">
          <div className="scheduler-status-row">
            <div>
              <span style={{ fontSize: '14px', fontWeight: 'bold', marginRight: '8px' }}>
                Digest:
              </span>
              <span className={`scheduler-badge ${digestEnabled ? 'enabled' : 'disabled'}`}>
                {digestEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            <button
              type="button"
              className={`btn ${digestEnabled ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => handleDigestConfig({ enabled: !digestEnabled })}
            >
              {digestEnabled ? 'Disable Digest' : 'Enable Digest'}
            </button>
          </div>

          <div className="digest-fields">
            <div className="form-group">
              <label htmlFor="digest-interval" className="sub-label">Every (days)</label>
              <input
                id="digest-interval"
                type="number"
                min="1"
                max="90"
                defaultValue={digestStatus?.intervalDays ?? 7}
                onBlur={(e) => handleDigestConfig({ intervalDays: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="digest-minscore" className="sub-label">Min score</label>
              <input
                id="digest-minscore"
                type="number"
                min="0"
                max="100"
                defaultValue={digestStatus?.minScore ?? 80}
                onBlur={(e) => handleDigestConfig({ minScore: Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="digest-maxjobs" className="sub-label">Max jobs</label>
              <input
                id="digest-maxjobs"
                type="number"
                min="1"
                max="50"
                defaultValue={digestStatus?.maxJobs ?? 10}
                onBlur={(e) => handleDigestConfig({ maxJobs: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="scheduler-info">
            <div>
              📡 <strong>Channels:</strong>{' '}
              {digestStatus && digestStatus.channels.length > 0
                ? digestStatus.channels.join(', ')
                : 'none configured'}
            </div>
            <div>
              📥 <strong>Pending matches:</strong> {digestStatus?.pendingCount ?? 0}
            </div>
            {digestEnabled && digestStatus?.nextRunAt && (
              <div>
                📅 <strong>Next digest:</strong>{' '}
                {new Date(digestStatus.nextRunAt).toLocaleString()}
              </div>
            )}
            {digestStatus?.lastSentAt && (
              <div>
                ✅ <strong>Last sent:</strong> {new Date(digestStatus.lastSentAt).toLocaleString()}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '12px' }}
            onClick={handleSendDigest}
          >
            Send Digest Now
          </button>
        </div>
      </div>

      <div className="settings-save-row">
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
