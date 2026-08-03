export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading transcript">
      <div className="skeleton-card">
        <div className="skeleton-thumb">
          <div className="shimmer" />
        </div>
        <div className="skeleton-lines">
          <div className="skeleton-line w60">
            <div className="shimmer" />
          </div>
          <div className="skeleton-line w40">
            <div className="shimmer" />
          </div>
          <div className="skeleton-line w25">
            <div className="shimmer" />
          </div>
        </div>
      </div>
      <div className="skeleton-body">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skeleton-line w100" key={i} style={{ width: `${100 - (i % 3) * 12}%` }}>
            <div className="shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
