-- Migration: add beta invite tracking to paperbrief_waitlist
-- Adds invited_at timestamp + invite_token for magic-link beta access

ALTER TABLE paperbrief_waitlist
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invite_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invite_sent_by TEXT DEFAULT NULL;

-- Unique index on invite_token (sparse — NULL rows don't conflict)
CREATE UNIQUE INDEX IF NOT EXISTS paperbrief_waitlist_invite_token_idx
  ON paperbrief_waitlist (invite_token)
  WHERE invite_token IS NOT NULL;

COMMENT ON COLUMN paperbrief_waitlist.invited_at IS 'When this user was sent a beta invite email (NULL = not yet invited)';
COMMENT ON COLUMN paperbrief_waitlist.invite_token IS 'Short-lived token embedded in the magic-link invite URL';
COMMENT ON COLUMN paperbrief_waitlist.invite_sent_by IS 'Admin identifier or "batch" for bulk invites';
