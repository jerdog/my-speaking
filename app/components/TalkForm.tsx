export interface TalkFormValues {
  title: string;
  conferenceName: string;
  conferenceUrl: string;
  location: string;
  eventDate: string;
  abstract: string;
  videoUrl: string;
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

      <Field label="Video URL">
        <input
          type="url"
          disabled={disabled}
          value={values.videoUrl}
          onChange={(e) => set("videoUrl", e.target.value)}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

const inputClass =
  "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none focus:border-neutral-500 disabled:opacity-50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-400">
        {label}
        {required && <span className="text-neutral-600"> *</span>}
      </span>
      {children}
    </label>
  );
}
