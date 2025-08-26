// Force Node runtime for PDF rendering on Vercel
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { supabaseServer } from '../../../../../lib/supabaseServer';
import { getSessionProfile } from '../../../../../lib/auth';
import { renderToStream } from '@react-pdf/renderer';
import ReportDocument from '../../../../components/pdf/ReportDocument';
import type { Readable } from 'stream';

type MetricRow = { id: string; code: string };
type SubmissionRow = { id: string; organisation: string };
type ValRow = { metric_id: string; value: number };

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin') return new NextResponse('Forbidden', { status: 403 });

  const sb = supabaseServer();

  const { data: period } = await sb.from('periods').select('*').eq('id', params.id).single();
  if (!period) return new NextResponse('Not found', { status: 404 });

  // Metrics
  const { data: metricsRaw } = await sb.from('metrics').select('id,code');
  const metrics: MetricRow[] = (metricsRaw ?? []) as MetricRow[];
  const metricById: Record<string, string> = {};
  const metricCodes: Record<string, string> = {};
  metrics.forEach((m: MetricRow) => {
    metricById[m.id] = m.code;
    metricCodes[m.code] = m.id;
  });

  // Submissions
  const { data: subsRaw } = await sb.from('submissions').select('id, organisation').eq('period_id', period.id);
  const subs: SubmissionRow[] = (subsRaw ?? []) as SubmissionRow[];

  // Values grouped by org
  const valuesByOrg: Record<string, Record<string, number>> = {};
  for (const s of subs) {
    const { data: valsRaw } = await sb.from('submission_values').select('metric_id, value').eq('submission_id', s.id);
    const vals: ValRow[] = (valsRaw ?? []) as ValRow[];
    const bag: Record<string, number> = {};
    vals.forEach((v: ValRow) => {
      const code = metricById[v.metric_id];
      if (code) bag[code] = Number(v.value);
    });
    valuesByOrg[s.organisation] = bag;
  }

  // Render PDF -> Node Readable stream
  const stream = (await renderToStream(
    ReportDocument({ periodCode: period.period_code, valuesByOrg })
  )) as unknown as Readable;

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const pdfBytes = Buffer.concat(chunks);

  // Upload to Supabase Storage
  const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
  const path = `reports/${period.period_code}.pdf`;
  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(path, pdfBytes, { upsert: true, contentType: 'application/pdf' });
  if (upErr) return new NextResponse(upErr.message, { status: 400 });

  await sb.from('periods').update({ status: 'finalised', report_pdf_path: path }).eq('id', period.id);
  return NextResponse.json({ ok: true, path });
}
