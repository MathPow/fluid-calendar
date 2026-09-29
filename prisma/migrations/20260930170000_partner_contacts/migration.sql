-- Fiscalité: each associé linked to a contact (same order as "partners").
ALTER TABLE "TaxProfile" ADD COLUMN "partnerContactIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
