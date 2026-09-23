import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
for (let line of raw.split(/\r?\n/)) {
  line = line.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 0) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: accounts, error } = await sb
  .from('accounts')
  .select('id, name, plan, plan_status, razorpay_payment_id');
if (error) { console.error('ERR', error.message); process.exit(1); }
console.log('=== accounts ===');
for (const a of accounts) {
  console.log(`- ${a.name} | plan=${a.plan} | status=${a.plan_status} | payment_id=${a.razorpay_payment_id ?? '(none)'}`);
}