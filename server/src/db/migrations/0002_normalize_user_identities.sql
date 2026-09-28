-- Access assertions and password-login input are normalized before lookup. Bring legacy
-- identities under the same invariant, but stop with a useful error rather than letting
-- the unique constraint fail midway if old rows differ only by case or whitespace.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "users"
		GROUP BY lower(btrim("identity"))
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot normalize user identities: two or more identities differ only by case or surrounding whitespace';
	END IF;
END $$;--> statement-breakpoint
UPDATE "users"
SET "identity" = lower(btrim("identity"))
WHERE "identity" IS DISTINCT FROM lower(btrim("identity"));
