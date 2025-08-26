import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getSessionProfile } from '@/lib/auth';

export async function PUT(req: Request, { params }:{ params:{ id:string } }) {
  const { user } = await getSessionProfile();
  if (!user) return new NextResponse('Forbidden', { status: 403 });
  const payload = await req.json(); // [{metric_id, value}]
  const sb = supabaseServer();
  for (const row of payload) {
    const { error } = await sb.from('submission_values').upsert({ submission_id: params.id, metric_id: row.metric_id, value: row.value, updated_by: user.id });
    if (error) return new NextResponse(error.message, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
