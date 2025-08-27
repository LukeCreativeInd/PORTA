import os
import datetime as dt
from typing import Optional

import requests
import streamlit as st
import pandas as pd
from supabase import Client
from lib.supabase_client import get_client

st.set_page_config(page_title="PORTA Portal", layout="wide")

# ---------------- Helpers ----------------
def previous_month_code(today: Optional[dt.date] = None) -> str:
    if today is None:
        today = dt.date.today()
    first = today.replace(day=1)
    prev_last = first - dt.timedelta(days=1)
    return prev_last.strftime("%Y-%m")

def is_within_window(period_code: str) -> bool:
    today = dt.date.today()
    return (1 <= today.day <= 7) and (previous_month_code(today) == period_code)

def apply_user_jwt(sb: Client) -> bool:
    """Ensure PostgREST uses the logged-in user's JWT, not just anon key."""
    token = st.session_state.get("access_token")
    if token:
        try:
            sb.postgrest.auth(token)
            return True
        except Exception:
            return False
    return False

def fetch_profile(sb: Client, user_id: str):
    res = (
        sb.table("profiles")
        .select("role, organisation")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return res.data if res.data else None

def fetch_profile_via_http(user_id: str):
    """Fallback: query PostgREST directly with the user's JWT."""
    url = st.secrets.get("SUPABASE_URL", os.getenv("SUPABASE_URL", ""))
    anon = st.secrets.get("SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
    token = st.session_state.get("access_token")
    if not (url and anon and token):
        return None
    endpoint = f"{url}/rest/v1/profiles"
    params = {"select": "role,organisation", "user_id": f"eq.{user_id}"}
    headers = {"apikey": anon, "Authorization": f"Bearer {token}"}
    try:
        r = requests.get(endpoint, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        return (data[0] if isinstance(data, list) and data else None)
    except Exception:
        return None

def load_submission(sb: Client, org: str, period_code: str):
    res = (
        sb.table("submissions")
        .select("id, status, values")
        .eq("organisation", org)
        .eq("period_code", period_code)
        .maybe_single()
        .execute()
    )
    return res.data if res.data else None

def persist_submission(
    sb: Client,
    sub_id: Optional[str],
    user_id: str,
    org: str,
    period_code: str,
    values: dict,
    status: str,
) -> Optional[str]:
    payload = {
        "organisation": org,
        "period_code": period_code,
        "values": values,
        "status": status,
        "created_by": user_id,
    }
    if sub_id:
        sb.table("submissions").update(payload).eq("id", sub_id).execute()
        return sub_id
    else:
        res = sb.table("submissions").insert(payload).select("id").single().execute()
        return res.data["id"] if res.data else None

# ---------------- App ----------------
sb = get_client()
st.title("PORTA Portal")

# Login
if "user" not in st.session_state:
    with st.form("login"):
        st.subheader("Login")
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        ok = st.form_submit_button("Sign in")
    if ok:
        try:
            resp = sb.auth.sign_in_with_password({"email": email, "password": password})
            if getattr(resp, "user", None) and getattr(resp, "session", None) and getattr(resp.session, "access_token", None):
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

# Re-apply JWT each run
apply_user_jwt(sb)

user = st.session_state["user"]

# Read profile (with fallback)
profile = None
try:
    profile = fetch_profile(sb, user["id"])
except Exception:
    profile = None
if not profile:
    profile = fetch_profile_via_http(user["id"])

if not profile:
    st.error(
        "Could not read your profile. Likely causes:\n"
        "• RLS SELECT policy missing on public.profiles, or\n"
        "• Your request isn't carrying the user JWT.\n\n"
        "Fix now: Ensure policies exist and that Streamlit secrets contain SUPABASE_URL and SUPABASE_ANON_KEY.\n"
        "Then re-run."
    )
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

# Dashboard
if page == "Dashboard":
    st.header("Dashboard")
    period = previous_month_code()
    st.caption(f"Organisation: **{org}** · Period: **{period}**")

    if is_admin:
        st.info("Admin mode: load any organisation and period below.")
        c1, c2, c3 = st.columns(3)
        with c1:
            rows = sb.table("profiles").select("organisation").execute().data or []
            orgs = sorted({r["organisation"] for r in rows if r.get("organisation")})
            idx = orgs.index(org) if org in orgs else (0 if orgs else 0)
            org_pick = st.selectbox("Organisation", options=orgs, index=idx if orgs else 0)
        with c2:
            period_pick = st.text_input("Period (YYYY-MM)", value=period)
        with c3:
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
        _ = persist_submission(sb, sub.get("id"), user["id"], org, period, payload_vals, status)
        st.success(f"{'Submitted' if submit else 'Saved draft'} for {org} / {period}")
        st.experimental_rerun()

# Reports
if page == "Reports":
    st.header("Reports")
    st.info("Placeholder for monthly report downloads.")
    months = sb.table("submissions").select("period_code").order("period_code").execute().data or []
    uniq = sorted({m["period_code"] for m in months if m.get("period_code")})
    if uniq:
        st.write("Available months:", ", ".join(uniq))
    else:
        st.write("No data yet.")

# Admin
if page == "Admin":
    st.header("Admin")
    colA, colB, colC, colD = st.columns([2,1,1,1])
    with colA:
        rows = sb.table("profiles").select("organisation").execute().data or []
        orgs = sorted({r["organisation"] for r in rows if r.get("organisation")})
        admin_org = st.selectbox("Organisation", options=orgs) if orgs else None
    with colB:
        admin_period = st.text_input("Period (YYYY-MM)", value=previous_month_code())
    with colC:
        if st.button("Load submission") and admin_org:
            st.session_state["admin_load"] = True
    with colD:
        if st.button("Export CSV (month)"):
            data = (
                sb.table("submissions")
                .select("organisation,period_code,values,status")
                .eq("period_code", admin_period)
                .execute()
                .data
                or []
            )
            flat = []
            for r in data:
                v = r.get("values") or {}
                flat.append({
                    "organisation": r["organisation"],
                    "period_code": r["period_code"],
                    "status": r["status"],
                    "dist_nsw": v.get("dist_nsw",0),
                    "dist_qld": v.get("dist_qld",0),
                    "dist_sant": v.get("dist_sant",0),
                    "dist_victas": v.get("dist_victas",0),
                    "dist_wa": v.get("dist_wa",0),
                    "dist_total": v.get("dist_total",0),
                })
            if flat:
                df = pd.DataFrame(flat)
                st.download_button("Download CSV", df.to_csv(index=False).encode("utf-8"),
                                   file_name=f"porta-{admin_period}.csv", mime="text/csv")
            else:
                st.warning("No data for that month.")

    if st.session_state.get("admin_load") and admin_org:
        sub = load_submission(sb, admin_org, admin_period) or {"id": None, "status": "draft", "values": {}}
        vals = {k: int(sub["values"].get(k, 0)) for k in ["dist_nsw","dist_qld","dist_sant","dist_victas","dist_wa"]}
        st.subheader(f"Edit — {admin_org} / {admin_period}")
        with st.form("admin_edit"):
            c = st.columns(5)
            vals["dist_nsw"]   = c[0].number_input("dist_nsw", min_value=0, value=vals["dist_nsw"])
            vals["dist_qld"]   = c[1].number_input("dist_qld", min_value=0, value=vals["dist_qld"])
            vals["dist_sant"]  = c[2].number_input("dist_sant", min_value=0, value=vals["dist_sant"])
            vals["dist_victas"]= c[3].number_input("dist_victas", min_value=0, value=vals["dist_victas"])
            vals["dist_wa"]    = c[4].number_input("dist_wa", min_value=0, value=vals["dist_wa"])
            total = sum(vals.values())
            st.text_input("dist_total", value=str(total), disabled=True)
            left, right = st.columns(2)
            save_admin = left.form_submit_button("Save draft")
            submit_admin = right.form_submit_button("Submit")
        if save_admin or submit_admin:
            status = "submitted" if submit_admin else "draft"
            _ = persist_submission(sb, sub.get("id"), user["id"], admin_org, admin_period, vals | {"dist_total": total}, status)
            st.success(f"{'Submitted' if submit_admin else 'Saved draft'} for {admin_org} / {admin_period}")
            st.session_state["admin_load"] = False
            st.experimental_rerun()
