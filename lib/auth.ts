import { supabaseServer } from './supabaseServer';

type ProfileRow = {
  user_id: string;
  organisation: string;
  role: 'admin' | 'submitter';
};

export async function getSessionProfile() {
  const supabase = supabaseServer();

  // Get the currently signed-in user (server-side)
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { user: null as const, profile: null as const };
  }

  // Fetch the matching profile row (RLS enforced)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle<ProfileRow>();

  return { user, profile: profile ?? null };
}
