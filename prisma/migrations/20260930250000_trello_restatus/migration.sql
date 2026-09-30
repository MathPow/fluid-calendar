-- Data only: Trello cards now read « Prêt (à prioriser) » as ready and
-- « Bloquant » as blocked. Forget when the Trello cards were last read so
-- the next sync takes their column again (local unsynced edits are pushed
-- first, as in every sync).
UPDATE "Task" SET "externalUpdatedAt" = NULL WHERE "source" = 'TRELLO';
