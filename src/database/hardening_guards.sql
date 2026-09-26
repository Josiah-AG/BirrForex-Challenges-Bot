-- Existing historical duplicates are retained. Every new/reassigned active identity is serialized.
CREATE OR REPLACE FUNCTION wp_guard_registration_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE normalized_account TEXT; new_identity BOOLEAN; challenge RECORD;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM 'removed' THEN RETURN NEW; END IF;
  normalized_account := regexp_replace(COALESCE(NEW.account_number,''),'[^0-9]','','g');
  new_identity := TG_OP='INSERT';
  IF TG_OP='UPDATE' THEN
    new_identity := OLD.status IS NOT DISTINCT FROM 'removed' OR OLD.challenge_id IS DISTINCT FROM NEW.challenge_id
      OR OLD.account_type IS DISTINCT FROM NEW.account_type
      OR regexp_replace(COALESCE(OLD.account_number,''),'[^0-9]','','g') IS DISTINCT FROM normalized_account;
  END IF;
  IF TG_OP='UPDATE' AND new_identity AND (EXISTS(SELECT 1 FROM wp_trades WHERE registration_id=OLD.id)
      OR EXISTS(SELECT 1 FROM wp_deals WHERE registration_id=OLD.id)
      OR EXISTS(SELECT 1 FROM wp_balance_ops WHERE registration_id=OLD.id)) THEN
    RAISE EXCEPTION 'This registration has collected trade history. Remove it and register the replacement account separately to preserve the audit history.' USING ERRCODE='23514';
  END IF;
  IF new_identity THEN
    SELECT status,type,start_date,registration_deadline,configuration_frozen_at INTO challenge FROM trading_challenges WHERE id=NEW.challenge_id FOR UPDATE;
    IF NOT FOUND OR challenge.start_date<=NOW() OR challenge.registration_deadline<=NOW() OR challenge.configuration_frozen_at IS NOT NULL OR
       NOT (challenge.status='registration_open' OR (NEW.source='csv' AND challenge.status IN ('draft','pending_approval'))) THEN
      RAISE EXCEPTION 'Registration is closed' USING ERRCODE='23514';
    END IF;
    IF NEW.connection_verified IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Successful VPS verification is required' USING ERRCODE='23514';
    END IF;
    IF challenge.type<>'hybrid' AND challenge.type IS DISTINCT FROM NEW.account_type THEN
      RAISE EXCEPTION 'Account category does not match challenge' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(26092602, NEW.challenge_id);
  IF new_identity AND normalized_account<>'' AND EXISTS(
    SELECT 1 FROM trading_registrations r WHERE r.challenge_id=NEW.challenge_id AND r.id IS DISTINCT FROM NEW.id
    AND r.status IS DISTINCT FROM 'removed' AND regexp_replace(COALESCE(r.account_number,''),'[^0-9]','','g')=normalized_account
  ) THEN RAISE EXCEPTION 'Account already registered' USING ERRCODE='23505'; END IF;
  IF new_identity AND normalized_account<>'' AND EXISTS(
    SELECT 1 FROM trading_registrations r WHERE r.challenge_id=NEW.challenge_id AND r.id IS DISTINCT FROM NEW.id
      AND r.status='removed' AND regexp_replace(COALESCE(r.account_number,''),'[^0-9]','','g')=normalized_account
      AND (EXISTS(SELECT 1 FROM wp_trades t WHERE t.registration_id=r.id) OR EXISTS(SELECT 1 FROM wp_deals d WHERE d.registration_id=r.id))
  ) THEN RAISE EXCEPTION 'This account has archived trading history in this challenge. Restore its original registration instead of mixing histories.' USING ERRCODE='23514'; END IF;
  IF NEW.nickname IS NOT NULL AND EXISTS(
    SELECT 1 FROM trading_registrations r WHERE r.challenge_id=NEW.challenge_id AND r.id IS DISTINCT FROM NEW.id
    AND r.status IS DISTINCT FROM 'removed' AND lower(trim(r.nickname))=lower(trim(NEW.nickname))
  ) THEN RAISE EXCEPTION 'Nickname already registered' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wp_registration_identity ON trading_registrations;
CREATE TRIGGER wp_registration_identity BEFORE INSERT OR UPDATE OF account_number,account_type,nickname,status,challenge_id
ON trading_registrations FOR EACH ROW EXECUTE FUNCTION wp_guard_registration_identity();

CREATE OR REPLACE FUNCTION wp_guard_challenge_reopen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active','reviewing','completed','submission_open') OR NEW.status IN ('active','reviewing','completed','submission_open') THEN
    NEW.configuration_frozen_at := COALESCE(OLD.configuration_frozen_at,NOW());
  END IF;
  IF OLD.status IN ('pending_approval','rejected','deleted') AND NEW.status IN ('registration_open','active','reviewing','completed') THEN
    RAISE EXCEPTION 'Challenge must be approved before opening or starting';
  END IF;
  IF NEW.configuration_frozen_at IS NOT NULL AND NEW.status IN ('draft','pending_approval','registration_open','scheduled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Started challenge cannot reopen registration';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS wp_challenge_reopen ON trading_challenges;
CREATE TRIGGER wp_challenge_reopen BEFORE UPDATE ON trading_challenges
FOR EACH ROW EXECUTE FUNCTION wp_guard_challenge_reopen();
