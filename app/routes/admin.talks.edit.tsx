import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useNavigation,
  useRevalidator,
} from "react-router";

import type { Route } from "./+types/admin.talks.edit";
import { BusyButton } from "~/components/Busy";
import { TalkFormFields, type TalkFormValues } from "~/components/TalkForm";
import { requireAdmin } from "~/lib/access.server";
import { env } from "cloudflare:workers";
import {
  deleteTalk,
  getTalkById,
  slugify,
  uniqueSlug,
  updateTalk,
} from "~/lib/db";
import { deleteTalkObjects } from "~/lib/r2";
import { validateTalkFields } from "~/lib/talk-input";
import {
  describeProgress,
  importDeckFromUrl,
  uploadTalk,
  type UploadProgress,
} from "~/lib/upload-talk.client";

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

  const talk = await getTalkById(env.DB, params.id);
  if (!talk) throw new Response("Not Found", { status: 404 });

  // An imported draft starts with a placeholder title, so its slug is a
  // placeholder too. Published talks keep theirs so existing links don't break.
  const slug =
    !talk.published && fields.value.title !== talk.title
      ? await uniqueSlug(
          env.DB,
          slugify(fields.value.title) || talk.id,
          talk.id,
        )
      : undefined;

  await updateTalk(env.DB, params.id, { ...fields.value, slug });

  return redirect("/admin");
}

export default function EditTalk({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { talk } = loaderData;
  const navigation = useNavigation();
  const pendingIntent = navigation.formData?.get("intent");
  const saving = navigation.state !== "idle" && pendingIntent !== "delete";

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
          className="text-sm text-[var(--muted)] underline hover:text-[var(--fg)]"
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
          <p className="text-sm text-red-600 dark:text-red-400">{actionData.error}</p>
        )}
        <BusyButton
          type="submit"
          busy={saving}
          busyLabel="Saving…"
          className="rounded bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-fg)] hover:opacity-90"
        >
          Save changes
        </BusyButton>
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
        <BusyButton
          type="submit"
          busy={pendingIntent === "delete"}
          busyLabel="Deleting…"
          className="text-sm text-red-600 dark:text-red-400 underline hover:text-red-500 dark:hover:text-red-300"
        >
          Delete talk
        </BusyButton>
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
  const [deckUrl, setDeckUrl] = useState("");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const revalidator = useRevalidator();

  async function run(work: () => Promise<unknown>) {
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await work();
      setDone(true);
      // Refresh so a follow-up replace targets the next version, not this one.
      revalidator.revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  const onReplace = () =>
    pdf &&
    run(() =>
      uploadTalk(
        { mode: "replace", talkId, uploadVersion: nextVersion, pdf },
        setProgress,
      ),
    );

  const onImportUrl = () =>
    run(() =>
      importDeckFromUrl(
        { talkId, uploadVersion: nextVersion, url: deckUrl },
        setProgress,
      ),
    );

  return (
    <section className="border-t border-[var(--border)] pt-8">
      <h2 className="mb-1 text-sm font-semibold text-[var(--fg)]">Slides</h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {slideCount} slide{slideCount === 1 ? "" : "s"} uploaded. Uploading a new
        PDF replaces them.
      </p>
      <input
        type="file"
        accept="application/pdf"
        disabled={busy}
        onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-[var(--fg)] file:mr-3 file:rounded file:border-0 file:bg-[var(--surface-strong)] file:px-3 file:py-2 file:text-[var(--fg)]"
      />
      <BusyButton
        type="button"
        onClick={onReplace}
        busy={busy && pdf !== null}
        busyLabel="Working…"
        disabled={!pdf}
        className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)]"
      >
        Replace slides
      </BusyButton>

      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--muted)]">
            …or import a deck from a URL
          </span>
          <input
            type="url"
            inputMode="url"
            placeholder="https://on.notist.cloud/pdf/deck-….pdf"
            value={deckUrl}
            disabled={busy}
            onChange={(e) => setDeckUrl(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] outline-none focus:border-[var(--muted)] disabled:opacity-50"
          />
        </label>
        <BusyButton
          type="button"
          onClick={onImportUrl}
          busy={busy && deckUrl.trim() !== ""}
          busyLabel="Working…"
          disabled={!deckUrl.trim()}
          className="mt-3 rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--muted)] disabled:opacity-50"
        >
          Import deck
        </BusyButton>
      </div>

      {busy && (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {progress ? describeProgress(progress) : "Starting…"}
        </p>
      )}
      {done && <p className="mt-2 text-sm text-green-600 dark:text-green-400">Slides updated.</p>}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
