import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  const { access_token, refresh_token } = await req.json();

  if (!access_token || !refresh_token) {
    return new NextResponse('Missing tokens', { status: 400 });
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) return new NextResponse(error.message, { status: 401 });

  // Cookies are set by the SSR client via next/headers -> cookies()
  return NextResponse.json({ ok: true, user: data.user });
}
