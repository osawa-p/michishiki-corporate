import Link from "next/link";

type Props = {
  title?: string;
  description?: string;
};

export default function CtaSection({
  title = "まずは、現状の課題からお聞かせください。",
  description = "「何から手をつけるべきか」の整理からで構いません。サイトの状況を拝見し、伸びしろと優先順位を率直にお伝えします。",
}: Props) {
  return (
    <section className="bg-night text-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-24">
        <p className="text-xs tracking-[0.3em] uppercase text-bronze mb-5">Contact</p>
        <div className="md:flex md:items-end md:justify-between gap-10">
          <div className="max-w-2xl">
            <h2 className="font-serif text-2xl md:text-4xl font-semibold leading-snug mb-5">
              {title}
            </h2>
            <p className="text-stone-400 text-sm md:text-base leading-relaxed">{description}</p>
          </div>
          <div className="mt-8 md:mt-0 shrink-0">
            <Link
              href="/contact"
              className="inline-block px-10 py-4 bg-paper text-ink text-sm font-semibold hover:bg-bronze hover:text-paper transition-colors"
            >
              無料相談する →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
