-- Calendar layers: weekly routine blocks drawn behind the calendar.
CREATE TABLE "CalendarLayer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutineBlock" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "color" TEXT,
    "days" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "schedulable" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarLayer_userId_idx" ON "CalendarLayer"("userId");
CREATE INDEX "RoutineBlock_layerId_idx" ON "RoutineBlock"("layerId");

ALTER TABLE "CalendarLayer" ADD CONSTRAINT "CalendarLayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineBlock" ADD CONSTRAINT "RoutineBlock_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "CalendarLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
