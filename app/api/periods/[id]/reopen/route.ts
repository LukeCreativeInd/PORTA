import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getSessionProfile } from '@/lib/auth';

export async function POST(_req: Request, { params }:{ params:{ id:string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin') return new NextResponse('Forbidden', { status: 403 });
  const sb = supabaseServer();
  await sb.from('periods').update({ status: 'open', report_pdf_path: null }).eq('id', params.id);
  return NextResponse.json({ ok: true });
}
