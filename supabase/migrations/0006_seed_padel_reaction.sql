-- Seed a padel reaction drill. A reaction exercise carries a call-out pool in
-- config.pool ([{call, media_url, audio_url}]); the Player shouts one at random
-- each interval during the step. TTS-only for now (no clips), so media/audio null.
--
-- Idempotent: a stable external_id lets re-applying update in place via the
-- existing (source, external_id) unique index instead of inserting a duplicate.
insert into exercises (name, type, source, media_url, external_id, config)
values (
  'Padel Reaction Shots',
  'reaction',
  'padel',
  null,
  'padel_reaction_shots',
  '{"pool": [
    {"call": "Volley", "media_url": null, "audio_url": null},
    {"call": "Low volley", "media_url": null, "audio_url": null},
    {"call": "Block", "media_url": null, "audio_url": null},
    {"call": "Low chiquita", "media_url": null, "audio_url": null}
  ]}'::jsonb
)
on conflict (source, external_id) do update
  set name = excluded.name,
      type = excluded.type,
      media_url = excluded.media_url,
      config = excluded.config;
