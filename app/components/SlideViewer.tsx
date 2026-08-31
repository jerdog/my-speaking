import { useCallback, useEffect, useState } from "react";

interface SlideViewerProps {
  slideUrls: string[];
  title: string;
}

export function SlideViewer({ slideUrls, title }: SlideViewerProps) {
  const [index, setIndex] = useState(0);
  const count = slideUrls.length;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goTo(index + 1);
      if (event.key === "ArrowLeft") goTo(index - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, index]);

  if (count === 0) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]">
        No slides uploaded yet.
      </div>
    );
  }

  return (
    <div>
      <div className="group relative aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <img
          src={slideUrls[index]}
          alt={`${title} — slide ${index + 1} of ${count}`}
          className="size-full object-contain"
          // The first slide is the page's main image; the rest load on demand.
          loading={index === 0 ? "eager" : "lazy"}
        />
        {count > 1 && (
          <>
            <NavButton side="left" label="Previous slide" onClick={() => goTo(index - 1)} />
            <NavButton side="right" label="Next slide" onClick={() => goTo(index + 1)} />
          </>
        )}
      </div>

      {/* Equal side columns so the dots sit centred under the slide however
          wide the counter grows. */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-[var(--muted)]">
        <span className="justify-self-start whitespace-nowrap tabular-nums">
          Slide {index + 1} of {count}
        </span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {slideUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={`h-1.5 w-5 rounded-full transition-colors ${
                i === index
                  ? "bg-[var(--fg)]"
                  : "bg-[var(--border)] hover:bg-[var(--muted)]"
              }`}
            />
          ))}
        </div>
        <span className="hidden justify-self-end whitespace-nowrap sm:block">
          Use ← → to navigate
        </span>
      </div>
    </div>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-lg text-white opacity-0 transition-opacity hover:bg-black/65 focus-visible:opacity-100 group-hover:opacity-100 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <span aria-hidden="true">{side === "left" ? "‹" : "›"}</span>
    </button>
  );
}
