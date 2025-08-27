# PORTA Portal — Streamlit + Supabase (Clean Setup)

This repo implements a clean MVP for the PORTA Portal using **Streamlit** for the UI and **Supabase** for auth + DB + RLS.

## What you get
- Login (Supabase email/password)
- Submitter Dashboard: monthly distribution form (auto-sum) with 1–7 window
- Reports list (placeholder)
- Admin Console: switch org/period, edit any submission, export CSV
- Clean SQL schema + RLS for the new Supabase project

## Quick start
1. Create a new Supabase project.
2. In Supabase SQL editor, run [`/sql/porta_schema.sql`](sql/porta_schema.sql).
3. In Streamlit Cloud (or locally), set secrets:
   ```toml
   # .streamlit/secrets.toml
   SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
   SUPABASE_ANON_KEY = "YOUR-ANON-KEY"
   ```
4. Deploy this repo to Streamlit Cloud (or run locally):
   ```bash
   pip install -r requirements.txt
   streamlit run app.py
   ```

## Roles
- `profiles.role` is either `admin` or `submitter`.
- Submitters can write only for their own organisation and only during days 1–7 for the **previous** month.
- Admins can view/edit **all** organisations and months.

