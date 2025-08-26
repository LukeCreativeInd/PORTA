import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_req: Request, { params }:{ params:{ period_code:string } }) {
  const sb = supabaseServer();
  const { data: period } = await sb.from('periods').select('*').eq('period_code', params.period_code).single();
  if (!period || period.status !== 'finalised' || !period.report_pdf_path) return new NextResponse('Not found', { status: 404 });
  const signed = await sb.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).createSignedUrl(period.report_pdf_path, 60);
  if ((signed as any).error) return new NextResponse('Cannot sign URL', { status: 500 });
  return NextResponse.redirect((signed as any).data.signedUrl);
}
