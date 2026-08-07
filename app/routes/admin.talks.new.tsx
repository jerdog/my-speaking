import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { TalkFormFields, type TalkFormValues } from "~/components/TalkForm";
import { uploadTalk, type UploadProgress } from "~/lib/upload-talk.client";

export default function NewTalk() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [values, setValues] = useState<TalkFormValues>({
    title: searchParams.get("title") ?? "",
    conferenceName: searchParams.get("conferenceName") ?? "",
    conferenceUrl: searchParams.get("conferenceUrl") ?? "",
    location: searchParams.get("location") ?? "",
    eventDate: searchParams.get("eventDate") ?? "",
    abstract: "",
    videoUrl: "",
  });
  const [pdf, setPdf] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = progress !== null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pdf) {
      setError("Choose a PDF of your slides.");
      return;
    }

    setError(null);
    try {
      const { slug } = await uploadTalk(
        {
          metadata: {
            ...values,
            sessionizeEventId: searchParams.get("sessionizeEventId") ?? "",
          },
          pdf,
        },
        setProgress,
      );
      navigate(`/talks/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <h1 className="text-2xl font-semibold">Add talk</h1>

      <TalkFormFields values={values} onChange={setValues} disabled={busy} />

      <label className="block">
        <span className="mb-1 block text-sm text-neutral-400">
          Slides (PDF) <span className="text-neutral-600">*</span>
        </span>
        <input
          type="file"
          accept="application/pdf"
          required
          disabled={busy}
          onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-100"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          Export from Keynote, PowerPoint or Google Slides as PDF. Each page is
          converted to an image in your browser.
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {progress && (
        <p className="text-sm text-neutral-400">{describe(progress)}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {busy ? "Working…" : "Upload talk"}
      </button>
    </form>
  );
}

function describe(progress: UploadProgress): string {
  switch (progress.step) {
    case "creating":
      return "Creating talk…";
    case "rendering":
      return progress.total
        ? `Rendering slide ${progress.done} of ${progress.total}…`
        : "Reading PDF…";
    case "uploading":
      return `Uploading slide ${progress.done} of ${progress.total}…`;
    case "finishing":
      return "Finishing up…";
  }
}
