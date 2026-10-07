-- ---------------------------------------------------------------------------
-- LeadFlow — Phase 4: store the AI's fit label
--
-- Phase 2 reserved every AI column on public.leads except one. Claude returns
-- a human-readable fit label alongside the 0-100 score ("Excellent Fit",
-- "Good Fit", "Possible Fit", "Poor Fit"), and the UI displays it. Deriving it
-- from the score in the UI instead would discard the label the model actually
-- produced, so it is stored.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists fit_label text;

-- Mirrors the existing range checks on fit_score and confidence: the column
-- accepts only the four labels the analysis schema allows, or null. The
-- application validates this too; the constraint is the backstop that holds
-- even if a row is written by some other path.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_fit_label_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_fit_label_check
      check (
        fit_label is null
        or fit_label in ('Excellent Fit', 'Good Fit', 'Possible Fit', 'Poor Fit')
      );
  end if;
end
$$;

-- Columns inherit the table's grants, so the revoke/grant block in the Phase 2
-- migration already covers this one. No policy changes: RLS on public.leads is
-- untouched.
