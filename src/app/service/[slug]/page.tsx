import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { services, getServiceBySlug, serviceFlow } from "@/lib/services";
import CtaSection from "@/components/CtaSection";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) return {};
  return {
    title: service.title,
    description: service.short,
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  const others = services.filter((s) => s.slug !== service.slug);

  return (
    <>
      {/* Page Header */}
      <section className="border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <nav className="text-xs text-ink-faint mb-8 flex items-center gap-2">
            <Link href="/service" className="hover:text-bronze-deep transition-colors">
              サービス
            </Link>
            <span>/</span>
            <span>{service.title}</span>
          </nav>
          <div className="flex items-baseline gap-5 mb-6">
            <span className="font-serif text-4xl text-bronze">{service.num}</span>
            <p className="text-xs tracking-[0.3em] uppercase text-ink-faint">{service.en}</p>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-semibold mb-8">{service.title}</h1>
          <p className="text-ink-soft text-sm md:text-base leading-relaxed max-w-3xl">
            {service.lead}
          </p>
        </div>
      </section>

      {/* Pains */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Issues</p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-10">
            こんな課題はありませんか
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-line border border-line">
            {service.pains.map((pain) => (
              <div key={pain} className="bg-paper p-6 md:p-8 flex gap-4 items-start">
                <span className="text-bronze font-serif text-lg leading-none mt-0.5" aria-hidden>
                  ―
                </span>
                <p className="text-sm leading-relaxed">{pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="bg-white/60 border-y border-line py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">What We Do</p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-12">提供内容</h2>
          <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-12 md:gap-y-12 md:gap-x-10">
            {service.items.map((item, i) => (
              <div key={item.title} className="md:col-span-6 flex gap-6">
                <span className="font-serif text-2xl text-bronze shrink-0 w-10">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-serif text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-ink-soft leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-4">Flow</p>
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-12">支援の進め方</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-6">
            {serviceFlow.map((f) => (
              <div key={f.step} className="border-t border-line pt-5">
                <span className="font-serif text-xl text-bronze">{f.step}</span>
                <h3 className="font-semibold mt-3 mb-2 text-sm">{f.title}</h3>
                <p className="text-xs text-ink-soft leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Other services */}
      <section className="border-t border-line py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-8">Other Services</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-line border border-line">
            {others.map((s) => (
              <Link
                key={s.slug}
                href={`/service/${s.slug}`}
                className="group bg-paper p-6 md:p-8 hover:bg-white transition-colors"
              >
                <span className="font-serif text-xl text-bronze">{s.num}</span>
                <h3 className="font-serif text-base font-semibold mt-3 mb-2 group-hover:text-bronze-deep transition-colors">
                  {s.title}
                </h3>
                <p className="text-xs text-ink-soft leading-relaxed line-clamp-2">{s.short}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={`${service.title}について相談する`}
        description="現状の共有だけでも構いません。課題を整理し、取り組むべき優先順位を率直にお伝えします。"
      />
    </>
  );
}
