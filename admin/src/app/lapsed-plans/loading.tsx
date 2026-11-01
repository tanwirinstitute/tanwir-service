import Image from "next/image";

/** Shown while the page pulls this year's orders from Squarespace (a few seconds). */
export default function LapsedPlansLoading() {
  return (
    <main className="dashboard-shell">
      <Image src="/logo.webp" alt="Tanwir Institute" width={37} height={40} className="brand-logo skel-logo" priority />
      <div className="skel skel-title" />
      <div className="skel skel-subtitle" />
      <div className="stat-grid">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="skel skel-stat" key={i} />
        ))}
      </div>
      <div className="skel skel-filterbar" />
      <div className="table-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="skel-row" key={i}>
            <div className="skel skel-avatar" />
            <div className="skel-row-lines">
              <div className="skel skel-line-short" />
              <div className="skel skel-line-long" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
