-- Projects can be ordered within their organisation.
ALTER TABLE "AgentProject" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
