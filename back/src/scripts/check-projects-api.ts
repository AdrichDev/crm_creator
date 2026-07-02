import { supabaseAdmin } from '../lib/auth.js';

const { data, error } = await supabaseAdmin.auth.signInWithPassword({
  email: process.argv[2], password: process.argv[3],
});
if (error || !data.session) { console.error('ERROR login:', error?.message); process.exit(1); }
console.log('Token obtenido, llamando /api/projects...');
const res = await fetch('http://localhost:4001/api/projects', {
  headers: { Authorization: `Bearer ${data.session.access_token}` },
});
console.log('Status:', res.status);
console.log(await res.text());
