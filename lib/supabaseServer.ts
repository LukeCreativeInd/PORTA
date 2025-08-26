import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/auth-helpers-nextjs';

export function supabaseServer() {
  return createServerClient({ cookies, headers }, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
  });
}
