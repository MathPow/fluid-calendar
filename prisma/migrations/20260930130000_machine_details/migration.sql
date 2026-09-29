-- Machines tab: local machines and VPS with their access details (no secrets).
ALTER TABLE "Machine" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'local',
ADD COLUMN "host" TEXT,
ADD COLUMN "ip" TEXT,
ADD COLUMN "sshUser" TEXT,
ADD COLUMN "sshKey" TEXT,
ADD COLUMN "provider" TEXT,
ADD COLUMN "notes" TEXT;
