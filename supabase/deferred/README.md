# Deferred migrations

Not in `supabase/migrations/`, so nothing applies them automatically. Apply each one by hand at the point it names.

- `0073_attempts_score_column.sql`: apply after official-launch deploy. Then run `supabase/tests/attempts_score_column.sql`.
