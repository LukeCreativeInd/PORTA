'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient'; // instance

type Role = 'admin' | 'submitter';
type Status = 'draft' | 'submitted' | 'locked';
const KEYS = ['dist_nsw','dist_qld','dist_sant','dist_victas','dist_wa'] as const;
type Key = typeof KEYS[number];
type Values = Record<Key, number>;

function previousMonthCode(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isWithinEditWindow(periodCode: string, now = new Date()) {
  const day = now.getUTCDate();
  if (day > 7) return false;
  return periodCode === previousMonthCode(now);
}

export default function SubmissionForm() {
  const supabase = supabaseBrowser;

  const [role, setRole] = useState<Role>('submitter');
  const [organisation, setOrganisation] = useState<string>('');
  const [periodCode, setPeriodCode] = useState<string>(previousMonthCode());
  const [status, setStatus] = useState<Status>('draft');
  const [values, setValues] = useState<Partial<Values>>({});
  const [submissionId, setSubmissionId] = useState<string>();
  const [loading, setLoading] = useState<boolean>(true);
  const [dirty, setDirty] = useState<boolean>(false);

  // Admin controls
  const [adminOrg, setAdminOrg] = useState<string>('');
  const [adminPeriod, setAdminPeriod] = useState<string>(previousMonthCode());
  const [orgOptions, setOrgOptions] = useState<string[]>([]);

  const total = useMemo(
    () => KEYS.reduce((sum, k) => sum + Number(values[k] ?? 0), 0),
    [values]
  );

  const isAdmin = role === 'admin';
  const canEdit = (isAdmin || isWithinEditWindow(periodCode)) && status !== 'locked';

  // Centralised loader that uses **profiles** for role/org (not auth metadata)
  async function loadData(targetOrg?: string, targetPeriod?: string) {
    setLoading(true);

    // 1) Get authenticated user id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // 2) Read role/org from public.profiles
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, organisation')
      .eq('user_id', user.id)
      .single();

    const resolvedRole: Role = (prof?.role as Role) ?? 'submitter';
    const resolvedOrg = prof?.organisation ?? '';
    setRole(resolvedRole);

    // 3) If admin, preload organisations for selector
    if (resolvedRole === 'admin') {
      const { data: orgs } = await supabase
        .from('profiles')
        .select('organisation')
        .order('organisation');
      const uniq = Array.from(new Set((orgs ?? []).map(o => o.organisation).filter(Boolean)));
      setOrgOptions(uniq);
      if (!adminOrg && uniq.length) setAdminOrg(uniq[0]);
    }

    // 4) Compute target org/period using **local** isAdmin flag to avoid stale state
    const isAdminLocal = resolvedRole === 'admin';
    const finalOrg = isAdminLocal ? (targetOrg || adminOrg || resolvedOrg) : resolvedOrg;
    const finalPeriod = isAdminLocal ? (targetPeriod || adminPeriod || previousMonthCode()) : previousMonthCode();

    // 5) Fetch or init submission for that org+period
    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status, values')
      .eq('organisation', finalOrg)
      .eq('period_code', finalPeriod)
      .maybeSingle();

    if (sub) {
      setSubmissionId(sub.id);
      setStatus((sub.status as Status) ?? 'draft');
      setValues({
        dist_nsw: 0, dist_qld: 0, dist_sant: 0, dist_victas: 0, dist_wa: 0,
        ...(sub.values as Partial<Values>),
      });
    } else {
      setSubmissionId(undefined);
      setStatus('draft');
      setValues({ dist_nsw: 0, dist_qld: 0, dist_sant: 0, dist_victas: 0, dist_wa: 0 });
    }

    // 6) Reflect selection in UI
    setOrganisation(finalOrg);
    setPeriodCode(finalPeriod);

    setDirty(false);
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch(() => setLoading(false));
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
      const { data } = await supabase
        .from('submissions')
        .insert(payload)
        .select('id')
        .single();
      if (data?.id) setSubmissionId(data.id);
    }

    setStatus(newStatus);
    setDirty(false);
    setLoading(false);
  }

  const canSave = canEdit && dirty && !loading;
  const canSubmit = canEdit && !loading;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-4xl font-bold mb-6">Dashboard</h1>

      {/* Admin selection controls */}
      {isAdmin && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50 flex flex-wrap gap-4 items-end">
          <div className="text-xs text-gray-700 w-full">
            <b>Admin mode</b> — switch organisation/period and click <i>Load</i> to edit.
          </div>
          <div>
            <label className="block text-xs mb-1">Organisation</label>
            <select
              className="border rounded px-2 py-1 min-w-[220px]"
              value={adminOrg}
              onChange={(e) => setAdminOrg(e.target.value)}
            >
              {orgOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1">Period (YYYY-MM)</label>
            <input
              className="border rounded px-2 py-1 w-32"
              value={adminPeriod}
              onChange={(e) => setAdminPeriod(e.target.value)}
              placeholder="YYYY-MM"
            />
          </div>
          <button
            className="px-3 py-2 border rounded bg-white hover:bg-gray-100"
            onClick={() => loadData(adminOrg, adminPeriod)}
          >
            Load
          </button>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-3">Your Submissions</h2>
        <div className="text-sm mb-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-3">Finalised Reports</h2>
        {/* Add your reports listing here if needed */}
      </section>
    </div>
  );
}
