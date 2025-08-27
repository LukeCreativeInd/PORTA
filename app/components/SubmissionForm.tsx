'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { isWithinEditWindow } from '@/lib/timeWindow';

const METRIC_CODES = ['dist_nsw','dist_qld','dist_sant','dist_victas','dist_wa','dist_total'];

export default function SubmissionForm() {
  const [periodCode, setPeriodCode] = useState<string>('');
  const [periodId, setPeriodId] = useState<string>('');
  const [submissionId, setSubmissionId] = useState<string|undefined>();
  const [organisation, setOrganisation] = useState<string>('');
  const [status, setStatus] = useState<'draft'|'submitted'|'locked'>('draft');
  const [values, setValues] = useState<Record<string, number>>({});
  const [canEdit, setCanEdit] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
  (async () => {
    setLoading(true);

    // 1) Pick the latest OPEN period
    const { data: pList, error: perr } = await supabaseBrowser
      .from('periods')
      .select('*')
      .eq('status', 'open')                // ← only open periods
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(1);

    const p = pList?.[0];
    if (!p) { setLoading(false); return; }

    setPeriodCode(p.period_code);
    setPeriodId(p.id);

    // 2) Profile (for organisation)
    const { data: { user } } = await supabaseBrowser.auth.getUser();
    const { data: prof } = await supabaseBrowser
      .from('profiles')
      .select('*')
      .eq('user_id', user?.id)
      .maybeSingle();
    const orgName = prof?.organisation || '';
    setOrganisation(orgName);

    // 3) Ensure submission exists for this user x period x organisation
    const { data: sub } = await supabaseBrowser
      .from('submissions')
      .upsert(
        { period_id: p.id, organisation: orgName, owner_id: user!.id },
        { onConflict: 'period_id,organisation' }
      )
      .select('*')
      .maybeSingle();

    setSubmissionId(sub?.id);
    const subStatus = (sub?.status as typeof status) || 'draft';
    setStatus(subStatus);

    // 4) Load metric values
    if (sub?.id) {
      const { data: metricRows } = await supabaseBrowser.from('metrics').select('id,code');
      const { data: valRows } = await supabaseBrowser
        .from('submission_values')
        .select('metric_id,value')
        .eq('submission_id', sub.id);

      const byCode: Record<string, number> = {};
      metricRows?.forEach(m => {
        const v = valRows?.find(v => v.metric_id === m.id);
        byCode[m.code] = Number(v?.value ?? 0);
      });
      setValues(byCode);
    }

    // 5) Compute editability based on window + submission status
    setCanEdit(isWithinEditWindow(p.period_code) && subStatus !== 'locked');
    setLoading(false);
  })();
}, []);


  const handleChange = (code:string, v:string) => {
    setValues(s => ({...s, [code]: Number(v||0)}));
  };

  const save = async () => {
    if (!submissionId) return;
    const { data: metrics } = await supabaseBrowser.from('metrics').select('id,code');
    const payload = metrics!.filter(m=>METRIC_CODES.includes(m.code)).map(m=>({ metric_id: m.id, value: values[m.code]||0 }));
    await Promise.all(payload.map(p=> supabaseBrowser.from('submission_values').upsert({ submission_id: submissionId, metric_id: p.metric_id, value: p.value })));
    alert('Saved');
  };

  const submit = async () => {
    if (!submissionId) return;
    await save();
    await supabaseBrowser.from('submissions').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', submissionId);
    setStatus('submitted');
    alert('Submitted');
  };

  if (loading) return <div>Loading…</div>;

  return (
    <div className="space-y-3">
      <div><strong>Period:</strong> {periodCode}</div>
      <div><strong>Organisation:</strong> {organisation}</div>
      <div><strong>Status:</strong> {status}</div>

      <table className="table">
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          {METRIC_CODES.map(code=> (
            <tr key={code}>
              <td>{code}</td>
              <td>
                <input type="number" value={values[code]||0} onChange={e=>handleChange(code, e.target.value)} disabled={!canEdit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-8">
        <button onClick={save} disabled={!canEdit}>Save draft</button>
        <button onClick={submit} disabled={!canEdit}>Submit</button>
      </div>
    </div>
  );
}
