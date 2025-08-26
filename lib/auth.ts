import { supabaseServer } from './supabaseServer';

export async function getSessionProfile() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user:null, profile:null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  return { user, profile };
}
