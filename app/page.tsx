import Landing from "@/components/Landing";
import { searchMetros, US_METRO } from "@/lib/markets";

export const revalidate = 86400;

// Landing: the marquee shows real Zillow values for the biggest metros (data/metros.json)
export default function Home() {
  const cards = searchMetros("", 14).map((m) => ({ id: m.id, name: m.name, mid: m.mid, bottom: m.bottom, change: m.mid12moPct, asOf: m.midDate }));
  return <Landing cards={cards} us={{ mid: US_METRO.mid, bottom: US_METRO.bottom, asOf: US_METRO.midDate }} />;
}
