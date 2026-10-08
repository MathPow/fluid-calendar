-- Local recurring events were saved with isMaster = false, so the calendar
-- showed them only on their first date. They are their own master.
UPDATE "CalendarEvent" e
SET "isMaster" = true
FROM "CalendarFeed" f
WHERE f.id = e."feedId"
  AND f.type = 'LOCAL'
  AND e."isRecurring" = true
  AND e."recurrenceRule" IS NOT NULL
  AND e."masterEventId" IS NULL
  AND e."isMaster" = false;
