import pg from 'pg';
import fs from 'fs';
const env = fs.readFileSync('C:/Users/jlawr/github/ktc-portal/.env.local','utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g,'');
const c = new pg.Client({ connectionString: url, ssl:{rejectUnauthorized:false} });
await c.connect();
const body = async (fn) => { const r = await c.query(`select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`,[fn]); console.log('\n========= '+fn+' =========\n'+(r.rows[0]?r.rows[0].d:'<none>')); };
await body('record_release_or');
// show exact matching lines
const r = await c.query(`select pg_get_functiondef(p.oid) as d, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_release_or','verify_job_order')`);
for (const row of r.rows){ const lines=row.d.split('\n').filter(l=>/rps_payment|jo_supplement|service_invoice_no|invoice_pad_no|has_open_supplement/i.test(l)); console.log('\n--- '+row.proname+' matching lines ---'); lines.forEach(l=>console.log('  '+l.trim())); }
await c.end();
