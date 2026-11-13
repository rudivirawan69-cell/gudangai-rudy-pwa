/**
 * Skeleton.jsx — Placeholder loading per halaman.
 * Pakai sebagai fallback Suspense di App.jsx (mengganti spinner):
 *
 *   <Suspense fallback={<DashboardSkeleton />}> ...
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true" aria-label="Memuat dashboard">
      <div className="skeleton skeleton-block" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-line w-60" />
      <div className="skeleton skeleton-line w-40" />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-2.5 pt-2" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" style={{ height: 64 }} />
      ))}
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true" aria-label="Memuat form">
      <div className="skeleton skeleton-line w-60" />
      <div className="skeleton skeleton-block" style={{ height: 96 }} />
      <div className="skeleton skeleton-block" style={{ height: 96 }} />
      <div className="skeleton skeleton-card" style={{ height: 52 }} />
    </div>
  );
}
