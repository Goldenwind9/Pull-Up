// Photo bingo: 5 prompts per quest, checked off by the photo checker as photos come in.
import type { BingoView } from "@/lib/services/crews";

export default function BingoBoard({ squares }: { squares: BingoView[] }) {
  if (!squares.length) return null;
  const checked = squares.filter((s) => s.by).length;
  const full = checked === squares.length;
  return (
    <div className={`sticker animate-bounce-in p-4 ${full ? "bg-sun" : "bg-white"}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-bold">🎯 Photo bingo</h3>
        <span key={checked} className="animate-pop rounded-full border-2 border-ink bg-cream px-3 py-0.5 text-sm font-bold">
          {full ? "BINGO! 🎉" : `${checked}/${squares.length}`}
        </span>
      </div>
      <p className="mt-1 text-sm">Snap these. The AI checks them off from your photos.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {squares.map((s, i) => (
          <div
            key={s.idx}
            className={`relative min-h-24 overflow-hidden rounded-xl border-2 border-ink p-2 text-sm font-semibold ${
              s.by ? "text-cream" : "bg-cream"
            } ${i === squares.length - 1 && squares.length % 2 ? "col-span-2" : ""}`}
          >
            {s.photoUrl && (
              // Signed storage links change every load, so next/image's cache doesn't help here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover brightness-50" />
            )}
            <span className="relative block">
              {s.by ? "✅ " : "⬜ "}
              {s.prompt}
            </span>
            {s.by && <span className="relative mt-1 block text-xs">by {s.by}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
