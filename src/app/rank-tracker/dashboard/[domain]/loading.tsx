// サイト別ダッシュボードのスケルトン（BigQuery待ちの間に骨格を即時表示）
export default function DomainDashboardLoading() {
  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <div className="h-3 w-20 bg-line/40 animate-pulse motion-reduce:animate-none" />
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mt-3 mb-2">Dashboard</p>
          <div className="h-8 w-64 bg-line/50 animate-pulse motion-reduce:animate-none" />
        </div>
      </section>
      <section className="py-8 md:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-5">
          <div className="flex gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-28 border border-line bg-white p-3">
                <div className="h-full w-full bg-line/40 animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
          <div className="bg-white border border-line grid lg:grid-cols-[19rem_minmax(0,1fr)]">
            <div className="border-b lg:border-b-0 lg:border-r border-line p-4 space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-line/40 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
            <div className="p-6">
              <div className="h-6 w-48 bg-line/50 animate-pulse motion-reduce:animate-none" />
              <div className="mt-6 h-[300px] bg-line/30 animate-pulse motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
