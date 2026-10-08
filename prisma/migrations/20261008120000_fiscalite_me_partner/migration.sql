-- Fiscalité: I'm an associé of every SENC I keep the books for. Put "moi"
-- first in the associés; a share list that matched gets the rest up to 100 %.
UPDATE "TaxProfile"
SET
  "partnerShares" = CASE
    WHEN cardinality("partnerShares") = cardinality("partners")
      AND cardinality("partners") > 0
      AND (SELECT COALESCE(SUM(s), 0) FROM unnest("partnerShares") s) < 100
    THEN ARRAY[100 - (SELECT SUM(s) FROM unnest("partnerShares") s)] || "partnerShares"
    ELSE ARRAY[]::DOUBLE PRECISION[]
  END,
  "partnerContactIds" = CASE
    WHEN cardinality("partnerContactIds") = cardinality("partners")
    THEN ARRAY['']::TEXT[] || "partnerContactIds"
    ELSE ARRAY[]::TEXT[]
  END,
  "partners" = ARRAY['moi']::TEXT[] || "partners"
WHERE "legalForm" = 'senc'
  AND NOT ('moi' = ANY("partners"));
