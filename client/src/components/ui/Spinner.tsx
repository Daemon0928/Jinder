export default function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrapper" role="status" aria-label={label || 'Loading'}>
      <span className="dropzone-spinner" aria-hidden="true"></span>
      {label && <span>{label}</span>}
    </span>
  );
}
