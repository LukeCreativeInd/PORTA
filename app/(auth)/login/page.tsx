'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string|null>(null);
  const router = useRouter();

  const onSubmit = async (e:any) => {
    e.preventDefault();
    setError(null);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
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
