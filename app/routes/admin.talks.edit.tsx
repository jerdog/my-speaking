import { useState } from "react";
import { Form, Link, redirect, useRevalidator } from "react-router";

import type { Route } from "./+types/admin.talks.edit";
import { TalkFormFields, type TalkFormValues } from "~/components/TalkForm";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import { deleteTalk, getTalkById, updateTalk } from "~/lib/db";
import { deleteTalkObjects } from "~/lib/r2";
import { validateTalkFields } from "~/lib/talk-input";
import { uploadTalk, type UploadProgress } from "~/lib/upload-talk.client";

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);

  const talk = await getTalkById(env.DB, params.id);
  if (!talk) throw new Response("Not Found", { status: 404 });

  return { talk };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);

  const formData = await request.formData();

  if (formData.get("intent") === "delete") {
    await deleteTalkObjects(env.SLIDES_BUCKET, params.id);
    await deleteTalk(env.DB, params.id);
    return redirect("/admin");
  }

  const fields = validateTalkFields(Object.fromEntries(formData));
  if (!fields.ok) {
    return { error: fields.error };
  }

  await updateTalk(env.DB, params.id, fields.value);

  return redirect("/admin");
}

export default function EditTalk({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { talk } = loaderData;

  const [values, setValues] = useState<TalkFormValues>({
    title: talk.title,
    conferenceName: talk.conferenceName,
    conferenceUrl: talk.conferenceUrl ?? "",
    location: talk.location ?? "",
    eventDate: talk.eventDate,
    abstract: talk.abstract ?? "",
    videoUrl: talk.videoUrl ?? "",
  });

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit talk</h1>
        <Link
          to={`/talks/${talk.slug}`}
          className="text-sm text-neutral-400 underline hover:text-neutral-200"
        >
          View page
        </Link>
      </div>

      <Form method="post" className="space-y-8">
        <TalkFormFields values={values} onChange={setValues} />
        {(Object.keys(values) as (keyof TalkFormValues)[]).map((key) => (
          <input key={key} type="hidden" name={key} value={values[key]} />
        ))}
        {actionData?.error && (
          <p className="text-sm text-red-400">{actionData.error}</p>
        )}
        <button
          type="submit"
          className="rounded bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200"
        >
          Save changes
        </button>
      </Form>

      <ReplaceSlides
        talkId={talk.id}
        slideCount={talk.slideCount}
        nextVersion={talk.slidesVersion + 1}
      />

      <Form
        method="post"
        onSubmit={(event) => {
          if (!confirm("Delete this talk and its slides? This can't be undone.")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <button
          type="submit"
          className="text-sm text-red-400 underline hover:text-red-300"
        >
          Delete talk
        </button>
      </Form>
    </div>
  );
}

function ReplaceSlides({
  talkId,
  slideCount,
  nextVersion,
}: {
  talkId: string;
  slideCount: number;
  nextVersion: number;
}) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const revalidator = useRevalidator();

  async function onReplace() {
    if (!pdf) return;
    setError(null);
    setDone(false);
    try {
      await uploadTalk(
        { mode: "replace", talkId, uploadVersion: nextVersion, pdf },
        setProgress,
      );
      setDone(true);
      // Refresh so a follow-up replace targets the next version, not this one.
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className="border-t border-neutral-800 pt-8">
      <h2 className="mb-1 text-sm font-semibold text-neutral-300">Slides</h2>
      <p className="mb-4 text-sm text-neutral-500">
        {slideCount} slide{slideCount === 1 ? "" : "s"} uploaded. Uploading a new
        PDF replaces them.
      </p>
      <input
        type="file"
        accept="application/pdf"
        disabled={progress !== null}
        onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-neutral-100"
      />
      <button
        type="button"
        onClick={onReplace}
        disabled={!pdf || progress !== null}
        className="mt-3 rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500 disabled:opacity-50"
      >
        Replace slides
      </button>
      {progress && (
        <p className="mt-2 text-sm text-neutral-400">
          {progress.step} {progress.done}/{progress.total}
        </p>
      )}
      {done && <p className="mt-2 text-sm text-green-400">Slides updated.</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
