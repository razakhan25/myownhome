import { Logo, Footer } from "@/components/Brand";

// Shared frame for the privacy and terms pages
export default function Legal({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-ink">
      <div className="px-2 sm:px-4 lg:px-[1.8vw] pt-3 sm:pt-4 lg:pt-[1.8vw]">
        <section className="max-w-[2400px] mx-auto rounded-[32px] sm:rounded-[48px] bg-gradient-to-b from-[#eaf1f8] via-[#f3f7fb] to-white pb-10">
          <header className="px-5 sm:px-9 lg:px-[2.8vw] py-5 sm:py-6 lg:py-[1.9vw]"><Logo /></header>
          <div className="px-6 pt-6 text-center">
            <h1 className="font-serif text-[40px] sm:text-[56px] leading-none tracking-[-0.03em]">{title}</h1>
            <p className="mt-3 text-[14px] text-ink/50">Last updated {updated}</p>
          </div>
        </section>
      </div>
      <article className="max-w-[720px] mx-auto px-6 py-12 text-[16px] leading-[1.65] text-ink/80 [&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.4px] [&_h2]:text-ink [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1.5 [&_a]:text-[#0052FF] [&_a]:underline">
        {children}
      </article>
      <Footer />
    </div>
  );
}
