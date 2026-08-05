-- Replace the single pooled "Padel Reaction Shots" drill (migration 0006) with
-- four separate, individually named reaction exercises — one per shot — so each
-- is visible and searchable by name in the library. Each carries a one-entry
-- config.pool of its own call, so the Player announces that shot during its
-- work step.
--
-- Idempotent: the pooled row is removed by its stable external_id; the four new
-- rows upsert on the existing (source, external_id) unique index.
delete from exercises where source = 'padel' and external_id = 'padel_reaction_shots';

insert into exercises (name, type, source, media_url, external_id, config)
values
  ('Volley',       'reaction', 'padel', null, 'padel_volley',
     '{"pool": [{"call": "Volley", "media_url": null, "audio_url": null}]}'::jsonb),
  ('Low volley',   'reaction', 'padel', null, 'padel_low_volley',
     '{"pool": [{"call": "Low volley", "media_url": null, "audio_url": null}]}'::jsonb),
  ('Block',        'reaction', 'padel', null, 'padel_block',
     '{"pool": [{"call": "Block", "media_url": null, "audio_url": null}]}'::jsonb),
  ('Low chiquita', 'reaction', 'padel', null, 'padel_low_chiquita',
     '{"pool": [{"call": "Low chiquita", "media_url": null, "audio_url": null}]}'::jsonb)
on conflict (source, external_id) do update
  set name = excluded.name,
      type = excluded.type,
      media_url = excluded.media_url,
      config = excluded.config;
