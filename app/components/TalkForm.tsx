export interface TalkFormValues {
  title: string;
  conferenceName: string;
  conferenceUrl: string;
  location: string;
  eventDate: string;
  abstract: string;
  videoUrl: string;
  repoUrl: string;
}

interface TalkFormFieldsProps {
  values: TalkFormValues;
  onChange: (values: TalkFormValues) => void;
  disabled?: boolean;
}

export function TalkFormFields({
  values,
  onChange,
  disabled,
}: TalkFormFieldsProps) {
  function set<K extends keyof TalkFormValues>(key: K, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="space-y-4">
      <Field label="Title" required>
        <input
          type="text"
          required
          disabled={disabled}
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conference" required>
          <input
            type="text"
            required
            disabled={disabled}
            value={values.conferenceName}
            onChange={(e) => set("conferenceName", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Date" required>
          <input
            type="date"
            required
            disabled={disabled}
            value={values.eventDate}
            onChange={(e) => set("eventDate", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location">
          <input
            type="text"
            disabled={disabled}
            value={values.location}
            onChange={(e) => set("location", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Conference URL">
          <input
            type="url"
            disabled={disabled}
            value={values.conferenceUrl}
            onChange={(e) => set("conferenceUrl", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Abstract">
        <textarea
          rows={5}
          disabled={disabled}
          value={values.abstract}
          onChange={(e) => set("abstract", e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Video URL">
          <input
            type="url"
            disabled={disabled}
            value={values.videoUrl}
            onChange={(e) => set("videoUrl", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="GitHub URL" hint="Demo repo, sample code or deck source">
          <input
            type="url"
            inputMode="url"
            placeholder="https://github.com/user/repo"
            disabled={disabled}
            value={values.repoUrl}
            onChange={(e) => set("repoUrl", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] outline-none focus:border-[var(--muted)] disabled:opacity-50";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-[var(--muted)]">
        {label}
        {required && <span className="text-[var(--muted)]"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>
      )}
    </label>
  );
}
