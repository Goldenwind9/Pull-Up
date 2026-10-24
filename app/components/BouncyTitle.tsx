// Title whose letters hop one after another, alternating theme colors.
const COLORS = ["text-sun", "text-ink", "text-sky"];

export default function BouncyTitle({ text, className = "" }: { text: string; className?: string }) {
  return (
    <h1 aria-label={text} className={`font-bold tracking-tight ${className}`}>
      {[...text].map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className={`inline-block animate-letter [-webkit-text-stroke:2px_var(--color-ink)] ${COLORS[i % COLORS.length]}`}
          style={{ animationDelay: `${i * 0.12}s` }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </h1>
  );
}
