-- Animated GIF for an exercise, hotlinked from the upstream CDN (never re-hosted).
-- media_url stays the static PNG used for list thumbnails; gif_url is the
-- animated asset shown in the player and the exercise preview.
-- Nullable: padel/reaction exercises have no upstream media, and a missing GIF
-- degrades gracefully to media_url.
alter table exercises add column gif_url text;
