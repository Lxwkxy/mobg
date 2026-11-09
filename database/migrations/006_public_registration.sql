BEGIN;

-- Existing accounts remain explicitly provisioned; public clients cannot set this field.
ALTER TABLE auth_users ADD COLUMN registration_kind TEXT NOT NULL DEFAULT 'provisioned'
    CHECK (registration_kind IN ('provisioned', 'public'));

CREATE FUNCTION create_registered_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- Never claim an existing domain profile by matching an email address.
    IF EXISTS (SELECT 1 FROM users WHERE lower(btrim(email)) = lower(btrim(NEW.email))) THEN
        RAISE EXCEPTION 'Domain profile already exists' USING ERRCODE = '23505';
    END IF;
    INSERT INTO users (user_name, email, auth_user_id) VALUES (NEW.name, NEW.email, NEW.id);
    RETURN NEW;
END;
$$;

-- Runs inside Better Auth's PostgreSQL signup transaction, including credential creation.
CREATE TRIGGER create_registered_profile AFTER INSERT ON auth_users
    FOR EACH ROW WHEN (NEW.registration_kind = 'public') EXECUTE FUNCTION create_registered_profile();

COMMIT;
