export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div className="skeleton-line title"></div>
        <div className="skeleton-line subtitle"></div>
      </div>
      <div className="skeleton-score"></div>
    </div>
  );
}
