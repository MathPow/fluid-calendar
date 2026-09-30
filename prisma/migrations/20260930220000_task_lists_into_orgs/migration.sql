-- Data only: file the task lists that have no Projets project under the
-- organisation of the same name ("StayChum" → StayChum), and "Personal" /
-- "Perso" under the personal organisation.
UPDATE "Project" p
SET "organisationId" = o."id"
FROM "Organisation" o
WHERE p."organisationId" IS NULL
  AND p."agentProjectId" IS NULL
  AND lower(trim(p."name")) = lower(trim(o."name"));

UPDATE "Project" p
SET "organisationId" = (SELECT o."id" FROM "Organisation" o WHERE o."kind" = 'perso' ORDER BY o."isDefault" DESC LIMIT 1)
WHERE p."organisationId" IS NULL
  AND p."agentProjectId" IS NULL
  AND lower(trim(p."name")) IN ('personal', 'perso', 'personnel', 'personnelle');
