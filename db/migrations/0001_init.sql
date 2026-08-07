CREATE TABLE talks (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  conference_name TEXT NOT NULL,
  conference_url TEXT,
  location TEXT,
  event_date TEXT NOT NULL,
  abstract TEXT,
  video_url TEXT,
  slide_count INTEGER NOT NULL DEFAULT 0,
  -- Bumped on every deck upload. Slides live under talks/<id>/v<version>/, so
  -- a re-upload writes a fresh prefix and only becomes live once the version
  -- is committed here. That keeps replacements atomic and lets the objects be
  -- cached immutably.
  slides_version INTEGER NOT NULL DEFAULT 0,
  sessionize_event_id TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX talks_event_date_idx ON talks (event_date DESC);
