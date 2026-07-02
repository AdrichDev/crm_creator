import { supabaseAdmin } from '../lib/auth.js';

const userId = process.argv[2];
const password = process.argv[3];
const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
console.log(error ? 'ERROR: ' + error.message : 'OK, password actualizada para ' + data.user.email);
