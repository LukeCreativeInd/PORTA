import os
import streamlit as st
from supabase import create_client, Client

def get_client() -> Client:
    if "sb_client" not in st.session_state:
        url = st.secrets.get("SUPABASE_URL", os.getenv("SUPABASE_URL", ""))
        key = st.secrets.get("SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
        if not url or not key:
            raise RuntimeError("Missing SUPABASE_URL or SUPABASE_ANON_KEY in secrets/env.")
        st.session_state["sb_client"] = create_client(url, key)
    return st.session_state["sb_client"]
