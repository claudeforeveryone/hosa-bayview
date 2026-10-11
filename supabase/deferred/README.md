# Deferred migrations

Not in `supabase/migrations/`, so nothing applies them automatically. Apply each one by hand at the point it names.

- `0073_attempts_score_column.sql`: superseded by `supabase/migrations/0200_attempt_scores_hidden.sql` (same change, column list computed from the live table). Do not apply 0073 as well.
