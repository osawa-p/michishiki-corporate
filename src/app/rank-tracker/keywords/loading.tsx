// キーワード管理のスケルトン（BigQuery待ちの間に骨格を即時表示）
export default function KeywordsLoading() {
  return (
    <>
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Keywords</p>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold">キーワード管理</h1>
        </div>
      </section>
      <section className="py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="border border-line bg-white p-6 space-y-4">
            <div className="h-10 w-2/3 bg-line/40 animate-pulse motion-reduce:animate-none" />
            <div className="h-10 w-1/2 bg-line/40 animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="border border-line divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-4 bg-white">
                <div className="h-6 bg-line/40 animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
