// Floating colored shapes behind each page. Purely decorative.
const SHAPES = [
  { className: "bg-sun -left-16 top-10 h-48 w-48 rounded-full animate-float", delay: "0s" },
  { className: "bg-sky -right-20 top-48 h-64 w-64 rounded-[40%] animate-float-slow", delay: "-3s" },
  { className: "bg-ink/80 left-[10%] bottom-24 h-20 w-20 rounded-2xl animate-float", delay: "-5s" },
  { className: "bg-sun/70 right-[12%] bottom-8 h-28 w-28 rounded-full animate-float-slow", delay: "-7s" },
  { className: "bg-sky/80 left-[45%] -top-10 h-24 w-24 rotate-12 rounded-3xl animate-float", delay: "-2s" },
];

export default function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {SHAPES.map((s, i) => (
        <div
          key={i}
          className={`absolute opacity-60 blur-[2px] ${s.className}`}
          style={{ animationDelay: s.delay }}
        />
      ))}
    </div>
  );
}
