import { useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AppConfig, ScrapeProgress } from '../api/types';
import { useToast } from '../context/toast';
import { DocumentIcon, UploadIcon } from './ui/Icon';

interface CvTabProps {
  config: AppConfig;
  onConfigChange: (partial: Partial<AppConfig>) => void;
  onSave: () => Promise<void>;
  onRefreshConfig: () => Promise<void>;
  isScraping: boolean;
  scrapePhase: ScrapeProgress['phase'];
  onStartReevaluation: (batchSize: number) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

export default function CvTab({
  config,
  onConfigChange,
  onSave,
  onRefreshConfig,
  isScraping,
  scrapePhase,
  onStartReevaluation,
}: CvTabProps) {
  const { showToast } = useToast();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'success' | 'error' | null>(null);
  const [reevalBatchSize, setReevalBatchSize] = useState<number>(config.batchSize || 10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.');
      setUploadStatus('error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 10 MB.');
      setUploadStatus('error');
      return;
    }

    setUploadStatus('uploading');
    setUploadError(null);
    setIsSummarizing(true);

    try {
      const data = await api.uploadCv(file);
      setUploadStatus('success');
      onConfigChange({ cvFilename: data.filename, cvSummary: data.summary || null });
      await onRefreshConfig(); // refresh CV text from server
      setTimeout(() => setUploadStatus('idle'), 4000);
    } catch (err) {
      setUploadStatus('error');
      setUploadError(err instanceof ApiError ? err.message : 'Network error during upload.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await onSave();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="settings-card">
      <h2>Your CV & Profile Details</h2>
      <p className="card-description">
        Upload a PDF or paste your CV text. Gemini will cross-reference this with job postings to
        calculate compatibility scores.
      </p>

      {/* PDF Upload Zone */}
      <div className="form-group">
        <label htmlFor="cv-file-input">Upload CV (PDF)</label>
        <input
          ref={fileInputRef}
          id="cv-file-input"
          type="file"
          accept=".pdf"
          className="visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handlePdfUpload(file);
            e.target.value = '';
          }}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload CV PDF: drag and drop or press Enter to browse"
          className={`pdf-dropzone ${isDragging ? 'dragging' : ''} ${uploadStatus === 'success' ? 'success' : ''} ${uploadStatus === 'error' ? 'error' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handlePdfUpload(file);
          }}
          onClick={openFilePicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFilePicker();
            }
          }}
        >
          {uploadStatus === 'uploading' ? (
            <>
              <div className="dropzone-spinner" aria-hidden="true"></div>
              <span className="dropzone-text">Extracting text from PDF...</span>
            </>
          ) : uploadStatus === 'success' ? (
            <>
              <span className="dropzone-icon" aria-hidden="true">✓</span>
              <span className="dropzone-text">Uploaded successfully!</span>
            </>
          ) : (
            <>
              <span className="dropzone-icon">
                <UploadIcon />
              </span>
              <span className="dropzone-text">Drag & drop your PDF here, or click to browse</span>
              <span className="dropzone-hint">PDF only • Max 10 MB</span>
            </>
          )}
        </div>

        {uploadError && (
          <div className="upload-error" role="alert">
            {uploadError}
          </div>
        )}

        {config.cvFilename && uploadStatus !== 'uploading' && (
          <div className="uploaded-file-info">
            <DocumentIcon size={16} />
            <span>
              Current file: <strong>{config.cvFilename}</strong>
            </span>
          </div>
        )}
      </div>

      {/* AI-Generated CV Summary */}
      {(isSummarizing || config.cvSummary) && (
        <div className="form-group">
          <label>🤖 AI-Generated Summary</label>
          {isSummarizing ? (
            <div className="cv-summary-card summarizing">
              <div className="summary-spinner-wrapper">
                <div className="dropzone-spinner" aria-hidden="true"></div>
                <span>Gemini is analyzing your CV...</span>
              </div>
            </div>
          ) : config.cvSummary ? (
            <div className="cv-summary-card">
              <div className="cv-summary-content">
                {config.cvSummary.split('\n').map((line, i) => {
                  if (!line.trim()) return <br key={i} />;
                  if (line.startsWith('## '))
                    return (
                      <h3 key={i} className="summary-heading">
                        {line.replace('## ', '')}
                      </h3>
                    );
                  if (line.startsWith('- '))
                    return (
                      <li key={i} className="summary-list-item">
                        {line.replace('- ', '')}
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
        <label htmlFor="cv-text">CV Text (auto-filled from PDF or edit manually)</label>
        <textarea
          id="cv-text"
          value={config.cv}
          onChange={(e) => onConfigChange({ cv: e.target.value })}
          placeholder={
            '# John Doe\n\n## Tech Stack\n- TypeScript, React, Node.js, Express, Postgres\n\n## Experience\n- Software Engineer at Company...'
          }
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button type="button" className="btn btn-primary" onClick={handleSave}>
          Save CV Details
        </button>

        {saveStatus === 'saving' && <span className="save-status">Saving...</span>}
        {saveStatus === 'success' && (
          <span className="save-status save-status-success">Saved successfully!</span>
        )}
        {saveStatus === 'error' && (
          <span className="save-status save-status-error">Error saving configuration.</span>
        )}
      </div>

      <div className="reevaluate-section">
        <h3>🔄 Reevaluate CV Matching</h3>
        <p className="card-description" style={{ marginBottom: '16px' }}>
          Re-run the Gemini matching logic on all existing jobs in the database. This is useful
          after you have updated your CV.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="reeval-batch-size" style={{ fontSize: '13px' }}>
              Reevaluation Batch Size:
            </label>
            <input
              id="reeval-batch-size"
              type="number"
              min="1"
              max="50"
              value={reevalBatchSize}
              onChange={(e) => setReevalBatchSize(Number(e.target.value))}
              style={{ width: '80px', padding: '8px', marginBottom: 0 }}
              disabled={isScraping}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (reevalBatchSize <= 0 || Number.isNaN(reevalBatchSize)) {
                showToast('Batch size must be a positive number.', 'error');
                return;
              }
              onStartReevaluation(reevalBatchSize);
            }}
            disabled={isScraping}
          >
            {isScraping && scrapePhase === 'reevaluating'
              ? 'Reevaluating...'
              : 'Run Reevaluation Now'}
          </button>
        </div>
      </div>
    </div>
  );
}
