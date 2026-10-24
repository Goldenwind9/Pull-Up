// Placeholder for pages that aren't built yet.
import Blobs from "./Blobs";
import BouncyTitle from "./BouncyTitle";

export default function ComingSoon({ title, emoji }: { title: string; emoji: string }) {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <Blobs />
      <BouncyTitle text={title} className="text-5xl" />
      <div className="sticker animate-bounce-in rotate-2 bg-sky p-6">
        <span className="inline-block animate-spin-slow text-6xl">{emoji}</span>
        <p className="mt-3 text-xl font-semibold">Cooking something up…</p>
      </div>
    </main>
  );
}
