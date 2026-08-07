export interface Talk {
  id: string;
  slug: string;
  title: string;
  conferenceName: string;
  conferenceUrl: string | null;
  location: string | null;
  eventDate: string;
  abstract: string | null;
  videoUrl: string | null;
  slidesPdfKey: string | null;
  slideCount: number;
  sessionizeEventId: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TalkRow {
  id: string;
  slug: string;
  title: string;
  conference_name: string;
  conference_url: string | null;
  location: string | null;
  event_date: string;
  abstract: string | null;
  video_url: string | null;
  slides_pdf_key: string | null;
  slide_count: number;
  sessionize_event_id: string | null;
  published: number;
  created_at: string;
  updated_at: string;
}

function fromRow(row: TalkRow): Talk {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    conferenceName: row.conference_name,
    conferenceUrl: row.conference_url,
    location: row.location,
    eventDate: row.event_date,
    abstract: row.abstract,
    videoUrl: row.video_url,
    slidesPdfKey: row.slides_pdf_key,
    slideCount: row.slide_count,
    sessionizeEventId: row.sessionize_event_id,
    published: row.published === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPublishedTalks(db: D1Database): Promise<Talk[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM talks WHERE published = 1 ORDER BY event_date DESC",
    )
    .all<TalkRow>();
  return results.map(fromRow);
}

export async function listAllTalks(db: D1Database): Promise<Talk[]> {
  const { results } = await db
    .prepare("SELECT * FROM talks ORDER BY event_date DESC")
    .all<TalkRow>();
  return results.map(fromRow);
}

export async function getTalkBySlug(
  db: D1Database,
  slug: string,
): Promise<Talk | null> {
  const row = await db
    .prepare("SELECT * FROM talks WHERE slug = ?1")
    .bind(slug)
    .first<TalkRow>();
  return row ? fromRow(row) : null;
}

export async function getTalkById(
  db: D1Database,
  id: string,
): Promise<Talk | null> {
  const row = await db
    .prepare("SELECT * FROM talks WHERE id = ?1")
    .bind(id)
    .first<TalkRow>();
  return row ? fromRow(row) : null;
}

export interface NewTalkInput {
  id: string;
  slug: string;
  title: string;
  conferenceName: string;
  conferenceUrl: string | null;
  location: string | null;
  eventDate: string;
  abstract: string | null;
  videoUrl: string | null;
  sessionizeEventId: string | null;
}

export async function insertTalk(
  db: D1Database,
  input: NewTalkInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO talks
        (id, slug, title, conference_name, conference_url, location, event_date, abstract, video_url, sessionize_event_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      input.id,
      input.slug,
      input.title,
      input.conferenceName,
      input.conferenceUrl,
      input.location,
      input.eventDate,
      input.abstract,
      input.videoUrl,
      input.sessionizeEventId,
    )
    .run();
}

export type UpdateTalkInput = Partial<NewTalkInput>;

export async function updateTalk(
  db: D1Database,
  id: string,
  input: UpdateTalkInput,
): Promise<void> {
  const columns: Record<keyof NewTalkInput, string> = {
    id: "id",
    slug: "slug",
    title: "title",
    conferenceName: "conference_name",
    conferenceUrl: "conference_url",
    location: "location",
    eventDate: "event_date",
    abstract: "abstract",
    videoUrl: "video_url",
    sessionizeEventId: "sessionize_event_id",
  };

  const entries = Object.entries(input).filter(
    ([, value]) => value !== undefined,
  ) as [keyof NewTalkInput, string | null][];
  if (entries.length === 0) return;

  const setClauses = entries.map(
    ([key], i) => `${columns[key]} = ?${i + 2}`,
  );
  const values = entries.map(([, value]) => value);

  await db
    .prepare(
      `UPDATE talks SET ${setClauses.join(", ")}, updated_at = datetime('now') WHERE id = ?1`,
    )
    .bind(id, ...values)
    .run();
}

export async function setTalkSlideCount(
  db: D1Database,
  id: string,
  slideCount: number,
  slidesPdfKey: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE talks
       SET slide_count = ?2, slides_pdf_key = ?3, published = 1, updated_at = datetime('now')
       WHERE id = ?1`,
    )
    .bind(id, slideCount, slidesPdfKey)
    .run();
}

export async function deleteTalk(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM talks WHERE id = ?1").bind(id).run();
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
