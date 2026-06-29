import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('C:/Users/jlawr/github/ktc-portal/.env.local','utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const q = async (label, sql) => { try { const r = await c.query(sql); console.log('\n=== '+label+' ('+r.rowCount+') ==='); for (const row of r.rows) console.log(JSON.stringify(row)); } catch(e){ console.log('\n=== '+label+' ERROR: '+e.message+' ==='); } };

await q('FUNCTIONS referencing dropped objects', `
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and (pg_get_functiondef(p.oid) ~* '(jo_supplements|service_invoice_no|invoice_pad_no|has_open_supplement|rps_payment_status|rps_payment_proof_path|rps_payment_submitted_at|rps_payment_confirmed_at|rps_payment_note)')
  order by 1`);

await q('zzz_enforce_complete triggerdef', `select pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='job_orders' and t.tgname='job_orders_zzz_enforce_complete'`);

for (const fn of ['jo_all_services_done','jo_ready_to_complete']) {
  await q('BODY '+fn, `select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='${fn}'`);
}

// notify trigger functions on job_orders that might still touch rps_payment columns
await q('job_orders trigger functions', `select distinct p.proname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where c.relname='job_orders' and not t.tgisinternal order by 1`);

// any function body still naming 'rps_payment' or supplement loosely (broader)
await q('broad scan rps_payment/supplement in any function', `
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and pg_get_functiondef(p.oid) ~* '(rps_payment|jo_supplement|service_invoice_no)' order by 1`);
await c.end();
