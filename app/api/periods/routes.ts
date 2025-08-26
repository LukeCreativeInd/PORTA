import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getSessionProfile } from '@/lib/auth';

export async function GET() {
  const sb = supabaseServer();
  const { data } = await sb.from('periods').select('*').order('year',{ascending:false}).order('month',{ascending:false});
  return NextResponse.json(data||[]);
}

export async function POST(req: Request) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin') return new NextResponse('Forbidden', { status: 403 });
  const body = await req.json();
  const sb = supabaseServer();
  const { data, error } = await sb.from('periods').insert({ year: body.year, month: body.month }).select('*').single();
  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json(data);
}
