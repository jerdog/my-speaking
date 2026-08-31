-- Tracks talks brought over from Noti.st so re-running an import skips them,
-- and remembers where each deck can be fetched from. The deck is pulled later,
-- one talk per request, rather than during the bulk metadata import.
ALTER TABLE talks ADD COLUMN notist_id TEXT;
ALTER TABLE talks ADD COLUMN notist_download_url TEXT;
