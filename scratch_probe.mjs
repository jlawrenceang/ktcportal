import { readFileSync } from 'fs';
import pg from 'pg';
const env = readFileSync('.env.local','utf8');
const url = env.split('\n').find(l=>l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (s,p)=> (await c.query(s,p)).rows;

// 1. job_orders dropped columns gone?
console.log('A. job_orders billing cols still present (should be empty):');
console.log(await q(`select column_name from information_schema.columns where table_name='job_orders' and column_name = any($1)`,
 [['payment_status','payment_proof_path','rps_payment_status','service_invoice_no','invoice_pad_no','has_open_supplement']]));

// 2. jo_supplements table gone?
console.log('B. jo_supplements table exists?:', await q(`select to_regclass('public.jo_supplements') as t`));

// 3. dead RPCs gone?
console.log('C. dead RPCs still present (should be empty):');
console.log(await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname = any($1)`,
 [['add_supplement','review_payment','submit_payment_proof','record_service_invoice','complete_on_payment_confirmed','enforce_invoice_before_confirm']]));

// 4. ACL: internal/trigger funcs must NOT be exec by authenticated/anon
console.log('D. ACL leak — internal funcs granted to authenticated/anon (should be empty):');
console.log(await q(`select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
  where n.nspname='public' and a.privilege_type='EXECUTE' and r.rolname in ('authenticated','anon')
    and p.proname = any($1)`,
 [['complete_jo_on_charge_confirmed','seed_job_order_billing','log_charge_audit','jo_ready_to_complete','enforce_two_gate_complete','effective_rate']]));

// 5. Does live confirm_payment_order exclude 'reversed'? (0222 marker)
console.log('E. confirm_payment_order body has reversed-exclusion (0222)?:',
 (await q(`select prosrc from pg_proc where proname='confirm_payment_order'`))[0].prosrc.includes("not in ('confirmed','reversed')"));
console.log('F. create_payment_order body excludes reversed (0222)?:',
 (await q(`select prosrc from pg_proc where proname='create_payment_order'`))[0].prosrc.includes("in ('confirmed','reversed')"));
console.log('G. update_job_order body has F2 charge-in-flight guard (0222)?:',
 (await q(`select prosrc from pg_proc where proname='update_job_order'`))[0].prosrc.includes("billing in progress"));

await c.end();
