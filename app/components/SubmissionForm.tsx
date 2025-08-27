'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient'; // this is an INSTANCE in your repo

type Role = 'admin' | 'submitter';
type Status = 'draft' | 'submitted' | 'locked';
const KEYS = ['dist_nsw','dist_qld','dist_sant','dist_victas','dist_wa'] as const;
type Key = typeof KEYS[number];
type Values = Record<Key, number>;

function previousMonthCode(now = new Date()) {
  // UTC to avoid TZ edge cases
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isWithinEditWindow(periodCode: string, now = new Date()) {
  // Submitters can edit only days 1–7 for the PREVIOUS month
  const day = now.getUTCDate();
  if (day > 7) return false;
  return periodCode === previousMonthCode(now);
}

export default function SubmissionForm() {
  const supabase = supabaseBrowser; // <- NOTE: no parentheses
  const [role, setRole] = useState<Role>('submitter');
  const [organisation, setOrganisation] = useState<string>('TestCo');
  const [periodCode, setPeriodCode] = useState<string>(previousMonthCode());
  const [status, setStatus] = useState<Status>('draft');
  const [values, setValues] = useState<Partial<Values>>({});
  const [submissionId, setSubmissionId] = useState<string>();
  const [loading, setLoading] = useState<boolean>(true);
  const [dirty, setDirty] = useState<boolean>(false);

  const total = useMemo(
    () => KEYS.reduce((sum, k) => sum + Number(values[k] ?? 0), 0),
    [values]
  );

  const isAdmin = role === 'admin';
  const canEdit = (isAdmin || isWithinEditWindow(periodCode)) && status !== 'locked';

  // Initial load: get user, org, role, then fetch/create this period’s submission
  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      const meta = (user?.user_metadata ?? {}) as { role?: Role; organisation?: string };
      setRole((meta.role as Role) ?? 'submitter');
      setOrganisation(meta.organisation ?? 'TestCo');

      // Load submission for org + period
      const { data: sub } = await supabase
        .from('submissions')
        .select('id, status, values')
        .eq('organisation', meta.organisation ?? 'TestCo')
        .eq('period_code', periodCode)
        .maybeSingle();

      if (sub) {
        setSubmissionId(sub.id);
        setStatus((sub.status as Status) ?? 'draft');
        setValues({
          dist_nsw: 0, dist_qld: 0, dist_sant: 0, dist_victas: 0, dist_wa: 0,
          ...(sub.values as Partial<Values>),
        });
      } else {
        setValues({ dist_nsw: 0, dist_qld: 0, dist_sant: 0, dist_victas: 0, dist_wa: 0 });
        setStatus('draft');
      }

      setDirty(false);
      setLoading(false);
    })();
    // periodCode is fixed to previous month; if you ever add a period selector, add it to deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange(k: Key, v: string) {
    if (!canEdit) return;
    const n = Math.max(0, Number(v) || 0);
    setValues(prev => ({ ...prev, [k]: n }));
    setDirty(true);
  }

  async function persist(newStatus: Status) {
    if (!canEdit) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      period_code: periodCode,
      organisation,
      values: { ...values, dist_total: total },
      status: newStatus,
      created_by: user?.id,
    };

    if (submissionId) {
      await supabase.from('submissions').update(payload).eq('id', submissionId);
    } else {
      const { data, error } = await supabase
        .from('submissions')
        .insert(payload)
        .select('id')
        .single();
      if (!error && data?.id) setSubmissionId(data.id);
    }

    setStatus(newStatus);
    setDirty(false);
    setLoading(false);
  }

  const canSave = canEdit && dirty && !loading;
  const canSubmit = canEdit && !loading;

  return (
    <div className="max-w-3xl">
      <h1 className="text-4xl font-bold mb-6">Dashboard</h1>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-3">Your Submissions</h2>
        <div className="text-sm mb-4">
          <div><strong>Period:</strong> {periodCode || '—'}</div>
          <div><strong>Organisation:</strong> {organisation}</div>
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
              {KEYS.map(code => (
                <tr key={code} className="border-t">
                  <td className="px-4 py-2 font-mono">{code}</td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="w-28 text-right border rounded px-2 py-1"
                      value={values[code] ?? 0}
                      onChange={(e) => onChange(code, e.target.value)}
                      disabled={!canEdit || loading}
                    />
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-gray-50">
                <td className="px-4 py-2 font-mono font-medium">dist_total</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="w-28 text-right border rounded px-2 py-1 bg-gray-100"
                    value={total}
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
            onClick={() => persist('draft')}
            disabled={!canSave}
          >
            Save draft
          </button>
          <button
            className={`px-3 py-2 rounded border ${canSubmit ? 'bg-black text-white hover:opacity-90' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            onClick={() => persist('submitted')}
            disabled={!canSubmit}
          >
            Submit
          </button>
          {isAdmin && <a className="ml-auto underline" href="/admin">Admin →</a>}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-3">Finalised Reports</h2>
        {/* Keep using your existing reports listing/table here if you have one */}
      </section>
    </div>
  );
}
