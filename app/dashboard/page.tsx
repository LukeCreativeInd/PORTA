import { getSessionProfile } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabaseServer';
import SubmissionForm from '@/app/components/SubmissionForm';
import Link from 'next/link';

export default async function Dashboard() {
  const { user, profile } = await getSessionProfile();
  if (!user) return <div>Not signed in. <a href="/login">Login</a></div>;

  const supabase = supabaseServer();
  const { data: periods } = await supabase
    .from('periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1>Dashboard</h1>
        {profile?.role === 'admin' && <Link href="/admin" className="badge">Admin</Link>}
      </div>

      <section>
        <h2>Your Submissions</h2>
        <SubmissionForm />
      </section>

      <section>
        <h2>Finalised Reports</h2>
        <ul>
          {(periods||[]).filter(p=>p.status==='finalised' && p.report_pdf_path).map(p=> (
            <li key={p.id}>
              <a href={`/api/reports/${p.period_code}`} target="_blank">Download report {p.period_code}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
