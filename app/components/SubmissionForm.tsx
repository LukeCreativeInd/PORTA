'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { isWithinEditWindow } from '@/lib/timeWindow';

const METRIC_CODES = ['dist_nsw','dist_qld','dist_sant','dist_victas','dist_wa','dist_total'] as const;
type MetricCode = typeof METRIC_CODES[number];
const TOTAL_KEY: MetricCode = 'dist_total';
const STATE_KEYS = METRIC_CODES.filter(k => k !== TOTAL_KEY) as Exclude<MetricCode, 'dist_total'>[];

type Status = 'draft' | 'submitted' | 'locked';

type Values = Record<MetricCode, number>;

function z(n: unknown): number {
  const x = typeof n === 'string' ? n.replace(/[^\d.-]/g, '') : n;
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

export default function SubmissionForm() {
  const supabase = supabaseBrowser();

  const [periodCode, setPeriodCode] = useState<string>('');     // e.g. '2025-07'
  const [periodId, setPeriodId]     = useState<string>('');     // uuid for the period row
  const [submissionId, setSubmissionId] = useState<string | undefined>();
  const [organisation, setOrganisation] = useState<string>(''); // e.g. 'TestCo'
  const [status, setStatus]         = useState<Status>('draft');
  const [values, setValues]         = useState<Partial<Values>>({});
  const [loading, setLoading]       = useState<boolean>(true);
  const [canEdit, setCanEdit]       = useState<boolean>(true);
  const [dirty, setDirty]           = useState<boolean>(false);
  const [finalisedReports, setFinalisedReports] = useState<Array<{period_code: string, url: string}>>([]);

  // ---- derived total (always computed from STATE_KEYS) ----
  const computedTotal = useMemo(
    () => STATE_KEYS.reduce((sum, k) => sum + z(values[k] ?? 0), 0),
    [values]
  );

  // Ensure state always includes all metrics (with zeros) and total synced.
  useEffect(() => {
    setValues(prev => {
      const next: Partial<Values> = { ...prev };
      STATE_KEYS.forEach(k => { if (typeof next[k] !== 'number') next[k] = 0; });
      next[TOTAL_KEY] = computedTotal; // keep in sync
      return next as Values;
    });
  }, [computedTotal]);

  // ---- initial load (period/org/submission) ----
  useEffect(() => {
    (async () => {
      setLoading(true);

      // Example: derive current period + org from your session / context.
      // Replace these with your actual lookups if needed.
      const { data: period } = await supabase
        .from('periods')
        .select('id, code')
        .order('code', { ascending: false })
        .limit(1)
        .single();

      if (period) {
        setPeriodId(period.id);
        setPeriodCode(period.code);
      }

      // Example org (replace with real organisation resolution)
      const { data: profile } = await supabase.auth.getUser();
      const org = profile?.data?.user?.user_metadata?.organisation ?? 'TestCo';
      setOrganisation(org);

      // Gate editing by time window + status later
      setCanEdit(isWithinEditWindow(period?.code ?? ''));

      // Fetch or create user submission for the period/org
      if (period?.id && org) {
        const { data: sub } = await supabase
          .from('submissions')
          .select('id, status, values')
          .eq('period_id', period.id)
          .eq('organisation', org)
          .limit(1)
          .maybeSingle();

        if (sub) {
          setSubmissionId(sub.id);
          setStatus((sub.status as Status) ?? 'draft');
          setValues((sub.values as Values) ?? {});
        } else {
          // initialise zeros
          const init: Values = {
            dist_nsw: 0, dist_qld: 0, dist_sant: 0, dist_victas: 0, dist_wa: 0, dist_total: 0,
          };
          setValues(init);
        }
      }

      // (Optional) list of finalised reports to render below
      const { data: reports } = await supabase
        .from('reports')
        .select('period_code, url')
        .order('period_code', { ascending: false });
      setFinalisedReports(reports ?? []);

      setDirty(false);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recompute whether we can edit (status + window)
  useEffect(() => {
    setCanEdit(isWithinEditWindow(periodCode) && status !== 'locked' && status !== 'submitted');
  }, [periodCode, status]);

  function handleChange(code: Exclude<MetricCode, 'dist_total'>, v: string) {
    if (!canEdit) return;
    setValues(prev => ({ ...prev, [code]: z(v) }));
    setDirty(true);
  }

  async function saveDraft() {
    if (!canEdit) return;
    setLoading(true);

    const payload: Values = {
      dist_nsw: z(values.dist_nsw), dist_qld: z(values.dist_qld), dist_sant: z(values.dist_sant),
      dist_victas: z(values.dist_victas), dist_wa: z(values.dist_wa), dist_total: computedTotal,
    };

    if (submissionId) {
      await supabase.from('submissions').update({
        status: 'draft',
        values: payload,
        updated_at: new Date().toISOString(),
      }).eq('id', submissionId);
    } else {
      const { data, error } = await supabase.from('submissions').insert({
        period_id: periodId,
        organisation,
        status: 'draft',
        values: payload,
      }).select('id').single();
      if (!error && data?.id) setSubmissionId(data.id);
    }

    setValues(payload);
    setStatus('draft');
    setDirty(false);
    setLoading(false);
  }

  async function submit() {
    if (!canEdit) return;
    setLoading(true);

    const payload: Values = {
      dist_nsw: z(values.dist_nsw), dist_qld: z(values.dist_qld), dist_sant: z(values.dist_sant),
      dist_victas: z(values.dist_victas), dist_wa: z(values.dist_wa), dist_total: computedTotal,
    };

    if (submissionId) {
      await supabase.from('submissions').update({
        status: 'submitted',
        values: payload,
        submitted_at: new Date().toISOString(),
      }).eq('id', submissionId);
    } else {
      const { data } = await supabase.from('submissions').insert({
        period_id: periodId,
        organisation,
        status: 'submitted',
        values: payload,
        submitted_at: new Date().toISOString(),
      }).select('id').single();
      if (data?.id) setSubmissionId(data.id);
    }

    setValues(payload);
    setStatus('submitted');
    setDirty(false);
    setLoading(false);
  }

  const canSave = canEdit && dirty && !loading;
  const canSubmit =
    canEdit &&
    !loading &&
    // (optional) add any validation rules here:
    STATE_KEYS.every(k => z(values[k]) >= 0);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Your Submissions</h2>
        <div className="text-sm mb-4">
          <div><strong>Period:</strong> {periodCode || '—'}</div>
          <div><strong>Organisation:</strong> {organisation || '—'}</div>
          <div><strong>Status:</strong> {status}</div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2">Metric</th>
                <th className="text-right px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {STATE_KEYS.map(code => (
                <tr key={code} className="border-t">
                  <td className="px-4 py-2 font-mono">{code}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="w-28 text-right border rounded px-2 py-1"
                      value={values[code] ?? 0}
                      onChange={(e) => handleChange(code, e.target.value)}
                      disabled={!canEdit}
                      min={0}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-gray-50">
                <td className="px-4 py-2 font-mono font-medium">{TOTAL_KEY}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="w-28 text-right border rounded px-2 py-1 bg-gray-100"
                    value={computedTotal}
                    disabled
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            className={`px-3 py-2 rounded border ${canSave ? 'bg-white hover:bg-gray-50' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            onClick={saveDraft}
            disabled={!canSave}
          >
            Save draft
          </button>
          <button
            className={`px-3 py-2 rounded border ${canSubmit ? 'bg-black text-white hover:opacity-90' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            onClick={submit}
            disabled={!canSubmit}
          >
            Submit
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Finalised Reports</h2>
        <ul className="list-disc pl-6">
          {finalisedReports.map(r => (
            <li key={r.period_code}>
              <a className="text-indigo-600 underline" href={r.url}>Download report {r.period_code}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
