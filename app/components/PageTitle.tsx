// Title at the top of each crew tab.
export default function PageTitle({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <header className="animate-bounce-in">
      <h1 className="text-4xl font-bold">
        <span className="mr-2 inline-block animate-letter">{emoji}</span>
        {title}
      </h1>
      {subtitle && <p className="mt-1 text-lg">{subtitle}</p>}
    </header>
  );
}
