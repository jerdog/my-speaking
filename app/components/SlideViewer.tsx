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
      <div className="flex aspect-video items-center justify-center rounded-lg bg-neutral-900 text-neutral-500">
        No slides uploaded yet.
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-neutral-900">
        <img
          src={slideUrls[index]}
          alt={`${title} — slide ${index + 1} of ${count}`}
          className="h-full w-full object-contain"
        />
        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
            >
              ›
            </button>
          </>
        )}
      </div>
      {/* Equal side columns so the dots sit centred under the slide however
          wide the counter grows. */}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-neutral-400">
        <span className="justify-self-start whitespace-nowrap">
          Slide {index + 1} of {count}
        </span>
        <div className="flex flex-wrap justify-center gap-1">
          {slideUrls.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={`h-1.5 w-4 rounded-full transition-colors ${
                i === index ? "bg-white" : "bg-neutral-700 hover:bg-neutral-500"
              }`}
            />
          ))}
        </div>
        <span aria-hidden="true" />
      </div>
    </div>
  );
}
