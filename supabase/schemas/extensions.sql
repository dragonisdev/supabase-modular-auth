-- Extensions required by the application or implicitly present in the Supabase platform baseline.
-- Declare them explicitly so pg-delta never interprets an omitted extension as a requested drop.

create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "uuid-ossp" with schema "extensions";
