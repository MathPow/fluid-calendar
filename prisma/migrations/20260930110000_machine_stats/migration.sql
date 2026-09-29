-- Machines get the address of their Netdata agent, read by the server to show
-- a live status on the dashboard. Tailscale addresses, not names: the app runs
-- in a container that does not resolve MagicDNS names.
ALTER TABLE "Machine" ADD COLUMN "statsUrl" TEXT;

UPDATE "Machine" SET "statsUrl" = 'http://100.88.98.44:19999'
  WHERE "name" = 'uguiso-ThinkCentre-M83' AND "statsUrl" IS NULL;
UPDATE "Machine" SET "statsUrl" = 'http://100.76.192.10:19999'
  WHERE "name" = 'mathpow' AND "statsUrl" IS NULL;

INSERT INTO "Machine" ("id", "name", "label", "ttydUrl", "statsUrl", "createdAt", "updatedAt")
VALUES (
  'machine_canardo', 'canardo', 'canardo',
  'https://canardo.taila15d52.ts.net:7681/', 'http://100.87.10.111:19999',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO UPDATE
  SET "statsUrl" = COALESCE("Machine"."statsUrl", EXCLUDED."statsUrl"),
      "ttydUrl" = COALESCE("Machine"."ttydUrl", EXCLUDED."ttydUrl");
