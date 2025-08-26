import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ user: null });
  const { data: profile } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  return NextResponse.json({ user, profile });
}
