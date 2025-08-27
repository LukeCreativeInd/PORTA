import datetime as dt
import streamlit as st
import pandas as pd
from supabase import Client
from lib.supabase_client import get_client

st.set_page_config(page_title="PORTA Portal", layout="wide")

def previous_month_code(today=None):
    if today is None:
        today = dt.date.today()
    first = today.replace(day=1)
    prev_last = first - dt.timedelta(days=1)
    return prev_last.strftime("%Y-%m")

def is_within_window(period_code: str):
    today = dt.date.today()
    return (1 <= today.day <= 7) and (previous_month_code(today) == period_code)

def fetch_profile(sb: Client, user_id: str):
    # maybe_single() returns None if no row; raises on 4xx/5xx (e.g., RLS blocked)
    res = sb.table("profiles").select("role, organisation").eq("user_id", user_id).maybe_single().execute()
    return res.data if res.data else None

def apply_user_jwt(sb: Client):
    # Ensure PostgREST uses the logged-in user's JWT, not just anon key
    token = st.session_state.get("access_token")
    if token:
        try:
            sb.postgrest.auth(token)
            return True
        except Exception:
            return False
    return False

def load_submission(sb: Client, org: str, period_code: str):
    return sb.table("submissions").select("id, status, values").eq("organisation", org).eq("period_code", period_code).maybe_single().execute().data

def persist_submission(sb: Client, sub_id: str | None, user_id: str, org: str, period_code: str, values: dict, status: str):
    payload = {"organisation": org, "period_code": period_code, "values": values, "status": status, "created_by": user_id}
    if sub_id:
        sb.table("submissions").update(payload).eq("id", sub_id).execute()
        return sub_id
    else:
        res = sb.table("submissions").insert(payload).select("id").single().execute()
        return res.data["id"] if res.data else None

# ---------- Auth ----------
sb = get_client()

st.title("PORTA Portal")

if "user" not in st.session_state:
    with st.form("login"):
        st.subheader("Login")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        ok = st.form_submit_button("Sign in")
    if ok:
        try:
            resp = sb.auth.sign_in_with_password({"email": email, "password": password})
            if resp.user and resp.session and getattr(resp.session, "access_token", None):
                # Persist token across reruns
                st.session_state["user"] = {"id": resp.user.id, "email": email}
                st.session_state["access_token"] = resp.session.access_token
                try:
                    sb.postgrest.auth(resp.session.access_token)
                except Exception:
                    pass
                st.rerun()
            else:
                st.error("Invalid credentials or missing session token.")
        except Exception as e:
            st.error(f"Login failed: {e}")
    st.stop()

# Re-apply JWT on every run
jwt_ok = apply_user_jwt(sb)

user = st.session_state["user"]

# Fetch profile with error handling that hints at RLS/setup issues
profile = None
try:
    profile = fetch_profile(sb, user["id"])
except Exception as e:
    st.error("Could not read your profile. This is usually one of:\n"
             "• RLS select policy missing on public.profiles\n"
             "• You're still using the anon key for PostgREST (JWT not applied)\n"
             "• The profiles table doesn't exist\n\n"
             "Quick check in Supabase SQL:\n"
             "  select policyname, cmd from pg_policies where tablename='profiles';\n"
             "  select user_id, role, organisation from public.profiles limit 5;")
    st.stop()

if not profile:
    st.error("No profile found for your account.\n\nCreate a row in **Table Editor → public.profiles** with:\n"
             f"• user_id = {user['id']}\n• role = 'admin' or 'submitter'\n• organisation = 'TestCo' (or yours)")
    st.stop()

role = profile["role"]
org = profile["organisation"]
is_admin = role == "admin"

with st.sidebar:
    st.markdown(f"**Signed in as:** {user['email']}")
    st.markdown(f"**Role:** {role}")
    page = st.radio("Navigate", ["Dashboard", "Reports"] + (["Admin"] if is_admin else []))
    if st.button("Sign out"):
        try:
            sb.auth.sign_out()
        except Exception:
            pass
        st.session_state.clear()
        st.rerun()

# ---------- Dashboard ----------
if page == "Dashboard":
    st.header("Dashboard")
    period = previous_month_code()
    st.caption(f"Organisation: **{org}** · Period: **{period}**")

    # Admin override
    if is_admin:
        st.info("Admin mode: you can load any organisation and period below.")
        cols = st.columns(3)
        with cols[0]:
            org_rows = sb.table("profiles").select("organisation").execute().data or []
            orgs = sorted({r["organisation"] for r in org_rows if r.get("organisation")})
            org_pick = st.selectbox("Organisation", options=orgs, index=orgs.index(org) if org in orgs else 0 if orgs else None)
        with cols[1]:
            period_pick = st.text_input("Period (YYYY-MM)", value=period)
        with cols[2]:
            do_load = st.button("Load")
        if do_load and orgs:
            org = org_pick
            period = period_pick

    sub = load_submission(sb, org, period) or {"id": None, "status": "draft", "values": {}}
    vals = {k: int(sub["values"].get(k, 0)) for k in ["dist_nsw","dist_qld","dist_sant","dist_victas","dist_wa"]}
    total = sum(vals.values())

    can_edit = is_admin or is_within_window(period)
    st.write(f"**Status:** {sub.get('status','draft')} · {'Editable' if can_edit else 'Locked (1–7 window only)'}")

    with st.form("submission_form", clear_on_submit=False):
        c1, c2 = st.columns(2)
        with c1:
            vals["dist_nsw"] = st.number_input("dist_nsw", min_value=0, value=vals["dist_nsw"])
            vals["dist_qld"] = st.number_input("dist_qld", min_value=0, value=vals["dist_qld"])
            vals["dist_sant"] = st.number_input("dist_sant", min_value=0, value=vals["dist_sant"])
        with c2:
            vals["dist_victas"] = st.number_input("dist_victas", min_value=0, value=vals["dist_victas"])
            vals["dist_wa"] = st.number_input("dist_wa", min_value=0, value=vals["dist_wa"])
            st.text_input("dist_total", value=str(sum(vals.values())), disabled=True)

        save = st.form_submit_button("Save draft", disabled=not can_edit)
        submit = st.form_submit_button("Submit", disabled=not can_edit)

    if save or submit:
        status = "submitted" if submit else "draft"
        payload_vals = vals | {"dist_total": sum(vals.values())}
        new_id = persist_submission(sb, sub.get("id"), user["id"], org, period, payload_vals, status)
        st.success(f"{'Submitted' if submit else 'Saved draft'} for {org} / {period}")
        st.experimental_rerun()

# ---------- Reports ----------
if page == "Reports":
    st.header("Reports")
    st.info("Placeholders for monthly report downloads (hook to your storage or reports table).")
    months = sb.table("submissions").select("period_code").order("period_code").execute().data or []
    uniq = sorted({m["period_code"] for m in months if m.get("period_code")})
    if uniq:
        st.write("Available months:", ", ".join(uniq))
    else:
        st.write("No data yet.")

# ---------- Admin ----------
if page == "Admin":
    st.header("Admin")
    cols = st.columns([2,1,1,1])
    with cols[0]:
        org_rows = sb.table("profiles").select("organisation").execute().data or []
        orgs = sorted({r["organisation"] for r in org_rows if r.get("organisation")})
        admin_org = st.selectbox("Organisation", options=orgs) if orgs else None
    with cols[1]:
        admin_period = st.text_input("Period (YYYY-MM)", value=previous_month_code())
    with cols[2]:
        if st.button("Load submission") and admin_org:
            st.session_state["admin_load"] = True
    with cols[3]:
        if st.button("Export CSV (month)"):
            rows = sb.table("submissions").select("organisation,period_code,values,status").eq("period_code", admin_period).execute().data or []
            flat = []
            for r in rows:
                v = r.get("values") or {}
                flat.append({
                    "organisation": r["organisation"], "period_code": r["period_code"], "status": r["status"],
                    "dist_nsw": v.get("dist_nsw",0), "dist_qld": v.get("dist_qld",0), "dist_sant": v.get("dist_sant",0),
                    "dist_victas": v.get("dist_victas",0), "dist_wa": v.get("dist_wa",0), "dist_total": v.get("dist_total",0),
                })
            if flat:
                import pandas as pd
                df = pd.DataFrame(flat)
                csv_bytes = df.to_csv(index=False).encode("utf-8")
                st.download_button("Download CSV", data=csv_bytes, file_name=f"porta-{admin_period}.csv", mime="text/csv")
            else:
                st.warning("No data for that month.")

    if st.session_state.get("admin_load") and admin_org:
        sub = load_submission(sb, admin_org, admin_period) or {"id": None, "status": "draft", "values": {}}
        vals = {k: int(sub["values"].get(k, 0)) for k in ["dist_nsw","dist_qld","dist_sant","dist_victas","dist_wa"]}
        st.subheader(f"Edit — {admin_org} / {admin_period}")
        with st.form("admin_edit"):
            cols = st.columns(5)
            vals["dist_nsw"] = cols[0].number_input("dist_nsw", min_value=0, value=vals["dist_nsw"])
            vals["dist_qld"] = cols[1].number_input("dist_qld", min_value=0, value=vals["dist_qld"])
            vals["dist_sant"] = cols[2].number_input("dist_sant", min_value=0, value=vals["dist_sant"])
            vals["dist_victas"] = cols[3].number_input("dist_victas", min_value=0, value=vals["dist_victas"])
            vals["dist_wa"] = cols[4].number_input("dist_wa", min_value=0, value=vals["dist_wa"])
            total = sum(vals.values())
            st.text_input("dist_total", value=str(total), disabled=True)
            c1, c2 = st.columns(2)
            do_save = c1.form_submit_button("Save draft")
            do_submit = c2.form_submit_button("Submit")
        if do_save or do_submit:
            status = "submitted" if do_submit else "draft"
            new_id = persist_submission(sb, sub.get("id"), user["id"], admin_org, admin_period, vals | {"dist_total": total}, status)
            st.success(f"{'Submitted' if do_submit else 'Saved draft'} for {admin_org} / {admin_period}")
            st.session_state["admin_load"] = False
            st.experimental_rerun()
