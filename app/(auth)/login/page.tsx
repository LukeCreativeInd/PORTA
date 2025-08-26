'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string|null>(null);
  const router = useRouter();

  const onSubmit = async (e: any) => {
  e.preventDefault();
  setError(null);

  const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
  if (error) { setError(error.message); return; }

  // Get the session from the browser client…
  const { data: sess } = await supabaseBrowser.auth.getSession();
  const access_token = sess?.session?.access_token;
  const refresh_token = sess?.session?.refresh_token;

  // …and sync it to the server via our API so server components can see the user.
  if (access_token && refresh_token) {
    await fetch('/api/auth/set-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token, refresh_token }),
    });
  }

  router.push('/dashboard');
};

  return (
    <div className="max-w-sm mx-auto">
      <h1>VMA Portal Login</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div>
          <label>Email</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full"/>
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full"/>
        </div>
        {error && <div style={{color:'crimson'}}>{error}</div>}
        <button type="submit">Sign in</button>
      </form>
    </div>
  );
}
