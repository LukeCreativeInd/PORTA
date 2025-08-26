import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getSessionProfile } from '@/lib/auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const period_id = searchParams.get('period');
  const sb = supabaseServer();
  const { data } = await sb.from('submissions').select('*').match(period_id ? { period_id } : {});
  return NextResponse.json(data||[]);
}

export async function POST(req: Request) {
  const { user, profile } = await getSessionProfile();
  if (!user) return new NextResponse('Forbidden', { status: 403 });
  const body = await req.json();
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('submissions')
    .upsert({ period_id: body.period_id, organisation: body.organisation, owner_id: user.id }, { onConflict: 'period_id,organisation' })
    .select('*').single();
  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json(data);
}
