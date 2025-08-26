import { getSessionProfile } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabaseServer';

export default async function AdminPage() {
  const { user, profile } = await getSessionProfile();
  if (!user) return <div>Not signed in. <a href="/login">Login</a></div>;
  if (profile?.role !== 'admin') return <div>Not authorised.</div>;

  const supabase = supabaseServer();
  const { data: periods } = await supabase
    .from('periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  const rows = (periods ?? []) as {
    id: string;
    period_code: string;
    status: string;
    report_pdf_path?: string | null;
  }[];

  return (
    <div className="space-y-8">
      <h1>Admin</h1>
      <section>
        <h2>Periods</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th>Report</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.period_code}</td>
                <td>{p.status}</td>
                <td>{p.report_pdf_path ? 'Exists' : '-'}</td>
                <td style={{ textAlign: 'left' }}>
                  <form action={`/api/periods/${p.id}/finalise`} method="post">
                    <button>Finalise</button>
                  </form>
                  {p.status === 'finalised' && (
                    <form
                      action={`/api/periods/${p.id}/reopen`}
                      method="post"
                      style={{ display: 'inline-block', marginLeft: 8 }}
                    >
                      <button>Reopen</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
