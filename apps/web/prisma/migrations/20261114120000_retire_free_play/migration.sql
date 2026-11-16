-- Free Play was removed (November 2026). Old Free Play sessions, their
-- requests and pictures are kept as they are, read-only, so history, reports
-- and analytics still show them (labelled "Free Play"). Only a Free Play
-- session that is still running is ended, so the kiosk never starts in a
-- mode that no longer exists.
UPDATE "sessions"
SET "status" = 'ended',
    "ended_at" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
WHERE "activity_type" = 'free_play' AND "status" IN ('active', 'paused');
