// Landing + create crew. Owner: Frontend.
import CreateCrewForm from "./CreateCrewForm";
import Blobs from "./components/Blobs";
import BouncyTitle from "./components/BouncyTitle";

const SAMPLE_QUESTS = [
  "🎸 Vinyl Roulette",
  "🌮 Taco Truck Crawl",
  "🎨 Mural Scavenger Hunt",
  "🏓 Ping-Pong Showdown",
  "🌅 Sunset Picnic",
  "🧋 Boba Blind Taste Test",
  "🎳 Bowling in Costumes",
  "📚 Thrift-Book Swap",
];

const STEPS = [
  { emoji: "🎲", title: "Pull up", body: "AI picks 3 quests at real spots nearby. Your crew votes.", color: "bg-sun", tilt: "-3deg" },
  { emoji: "📸", title: "Prove it", body: "Snap a pic. The AI checks it and roasts you with a caption.", color: "bg-sky", tilt: "2deg" },
  { emoji: "💥", title: "Get the recap", body: "Your best shots become one story card. Drop it in the group chat.", color: "bg-white", tilt: "-1.5deg" },
];

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-10 px-4 pb-16 pt-12">
      <Blobs />

      <header className="animate-bounce-in text-center">
        <span className="sticker inline-block -rotate-3 bg-sky px-3 py-1 text-sm font-semibold">
          no app · no account · just vibes
        </span>
        <BouncyTitle text="PullUp" className="mt-4 text-7xl" />
        <p className="mt-3 text-xl font-medium">
          One wild side quest for your crew <span className="text-sun">every week.</span>
        </p>
      </header>

      <div className="sticker -mx-4 rotate-[-2deg] overflow-hidden bg-ink py-3 text-cream">
        <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-lg font-semibold">
          {[...SAMPLE_QUESTS, ...SAMPLE_QUESTS].map((q, i) => (
            <span key={i}>{q}</span>
          ))}
        </div>
      </div>

      <section className="flex flex-col gap-5">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="animate-bounce-in"
            style={{ rotate: s.tilt, animationDelay: `${0.2 + i * 0.12}s` }}
          >
            <div className={`sticker ${s.color} flex items-center gap-4 p-4 hover:animate-wiggle`}>
              <span className="text-4xl">{s.emoji}</span>
              <div>
                <h2 className="text-xl font-bold">{s.title}</h2>
                <p className="leading-snug">{s.body}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="sticker animate-bounce-in bg-white p-5" style={{ animationDelay: "0.6s" }}>
        <h2 className="mb-4 text-2xl font-bold">
          Start a crew <span className="inline-block animate-letter">👇</span>
        </h2>
        <CreateCrewForm />
      </section>
    </main>
  );
}
