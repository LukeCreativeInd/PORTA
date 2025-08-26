export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getSessionProfile } from '@/lib/auth';
import { renderToStream } from '@react-pdf/renderer';
import ReportDocument from '@/app/components/pdf/ReportDocument';

export async function POST(_req: Request, { params }:{ params:{ id:string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin') return new NextResponse('Forbidden', { status: 403 });
  const sb = supabaseServer();
  const { data: period } = await sb.from('periods').select('*').eq('id', params.id).single();
  if (!period) return new NextResponse('Not found', { status: 404 });

  const { data: metrics } = await sb.from('metrics').select('id,code');
  const metricById: Record<string,string> = {};
  const metricCodes: Record<string,string> = {};
  metrics?.forEach(m=> { metricById[m.id]=m.code; metricCodes[m.code]=m.id; });

  const { data: subs } = await sb.from('submissions').select('id, organisation').eq('period_id', period.id);
  const valuesByOrg: Record<string, Record<string, number>> = {};
  for (const s of (subs||[])) {
    const { data: vals } = await sb.from('submission_values').select('metric_id,value').eq('submission_id', s.id);
    const bag: Record<string, number> = {};
    vals?.forEach(v => {
      const code = metricById[v.metric_id];
      if (code) bag[code] = Number(v.value);
    });
    valuesByOrg[s.organisation] = bag;
  }

  const stream = await renderToStream(ReportDocument({ periodCode: period.period_code, valuesByOrg }));
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    done = d;
    if (value) chunks.push(value);
  }
  const pdfBytes = Buffer.concat(chunks);

  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const path = `reports/${period.period_code}.pdf`;
  const { error: upErr } = await sb.storage.from(bucket).upload(path, pdfBytes, { upsert: true, contentType: 'application/pdf' });
  if (upErr) return new NextResponse(upErr.message, { status: 400 });

  await sb.from('periods').update({ status: 'finalised', report_pdf_path: path }).eq('id', period.id);
  return NextResponse.json({ ok: true, path });
}
