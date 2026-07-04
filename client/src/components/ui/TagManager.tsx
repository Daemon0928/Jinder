import { useId, useState } from 'react';

interface TagManagerProps {
  label: string;
  description: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}

/** Shared add/remove tag editor (keywords, exclude keywords, companies). */
export default function TagManager({
  label,
  description,
  placeholder,
  values,
  onChange,
}: TagManagerProps) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const add = () => {
    const value = draft.trim();
    if (value && !values.includes(value)) {
      onChange([...values, value]);
      setDraft('');
    }
  };

  return (
    <div className="form-group" style={{ marginBottom: '32px' }}>
      <label htmlFor={inputId}>{label}</label>
      <p className="card-description" style={{ marginBottom: '12px' }}>
        {description}
      </p>

      <div className="keyword-manager">
        <div className="keyword-input-wrapper">
          <input
            id={inputId}
            type="text"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button type="button" className="btn btn-secondary" onClick={add}>
            Add
          </button>
        </div>

        <div className="keyword-tags">
          {values.map((value) => (
            <span key={value} className="keyword-tag">
              {value}
              <button
                type="button"
                className="keyword-tag-remove"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((v) => v !== value))}
              >
                ×
              </button>
            </span>
          ))}
          {values.length === 0 && <span className="keyword-tags-empty">None added yet.</span>}
        </div>
      </div>
    </div>
  );
}
