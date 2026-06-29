import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('C:/Users/jlawr/github/ktc-portal/.env.local','utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].trim().replace(/^["']|["']$/g,'');
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql) => {
  try { const r = await c.query(sql); console.log('\n=== '+label+' ('+r.rowCount+') ===');
    for (const row of r.rows) console.log(JSON.stringify(row)); }
  catch(e){ console.log('\n=== '+label+' ERROR: '+e.message+' ==='); }
};
await q('job_orders dropped-cols still present', `select column_name from information_schema.columns where table_schema='public' and table_name='job_orders' and column_name in ('payment_status','payment_proof_path','rps_payment_status','service_invoice_no','invoice_pad_no','has_open_supplement')`);
await q('jo_supplements table exists?', `select to_regclass('public.jo_supplements') as t`);
await q('FUNCTIONS referencing dropped objects', `
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (pg_get_functiondef(p.oid) ~* '(jo_supplements|service_invoice_no|invoice_pad_no|has_open_supplement|rps_payment_status|rps_payment_proof_path|rps_payment_submitted_at|rps_payment_confirmed_at|rps_payment_note)')
  order by 1`);
await q('POLICIES referencing dropped objects', `
  select tablename, policyname from pg_policies
  where (coalesce(qual,'')||' '||coalesce(with_check,'')) ~* '(jo_supplements|service_invoice_no|invoice_pad_no|has_open_supplement|rps_payment_)'`);
await q('triggers on job_orders', `select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='job_orders' and not t.tgisinternal order by tgname`);
await q('triggers on charges', `select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='charges' and not t.tgisinternal order by 1`);
await q('charges write policies', `select policyname, cmd from pg_policies where tablename='charges' and cmd in ('INSERT','UPDATE','DELETE')`);
await q('dead RPCs still present', `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname = any(array['add_supplement','bill_supplement','request_supplement','submit_payment_proof','review_payment','record_office_payment','record_service_invoice','complete_on_payment_confirmed','enforce_invoice_before_confirm','submit_supplement_proof','review_supplement_payment']) order by 1`);
await c.end();
