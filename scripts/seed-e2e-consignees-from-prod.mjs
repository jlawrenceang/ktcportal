import { existsSync, readFileSync } from 'node:fs'
import pg from 'pg'

const PROD_REF = 'mdlnfhyylvapzdubhyic'
const SAFE_COLUMNS = [
  'code',
  'name',
  'status',
  'decided_at',
  'address',
  'tin',
  'doc_2303_path',
  'note',
  'customer_name',
  'address2',
  'tel',
  'mobile',
  'email',
  'payment_terms',
  'created_at',
]

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

function refFromUrl(url, fallback) {
  try { return new URL(url).host.split('.')[0] || fallback } catch { return fallback }
}

function refFromDatabaseUrl(connStr, fallback = 'unknown') {
  try {
    const u = new URL(connStr)
    const host = u.hostname
    if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
      return host.split('.')[1] || fallback
    }
    const user = decodeURIComponent(u.username || '')
    const m = user.match(/^postgres\.([a-z0-9]{20})$/i)
    if (m) return m[1]
    return fallback
  } catch {
    return fallback
  }
}

async function openClient(label, connStr) {
  const txn = connStr.replace(':5432', ':6543')
  const tries = txn !== connStr ? [['6543', txn], ['5432', connStr]] : [[new URL(connStr).port || 'default', connStr]]
  for (const [port, u] of tries) {
    const client = new pg.Client({ connectionString: u, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 })
    try {
      await client.connect()
      console.log(`${label}: connected on :${port}`)
      return client
    } catch (e) {
      console.log(`${label}: :${port} connect failed - ${e.message}`)
    }
  }
  throw new Error(`${label}: could not connect to the database on either pooler port.`)
}

function quoteIdent(name) {
  return `"${name.replaceAll('"', '""')}"`
}

async function consigneeColumns(client) {
  const res = await client.query(`
    select column_name
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'consignees'
     order by ordinal_position
  `)
  return new Set(res.rows.map((r) => r.column_name))
}

function chunkRows(rows, size) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function sandboxSafeConsignee(row, columns) {
  const next = { ...row }
  if (next.status === 'approved') {
    if (columns.includes('address') && !String(next.address || '').trim()) next.address = 'SANDBOX PLACEHOLDER ADDRESS'
    if (columns.includes('tin') && !String(next.tin || '').trim()) next.tin = 'SANDBOX-TIN'
    if (columns.includes('doc_2303_path') && !String(next.doc_2303_path || '').trim()) {
      next.doc_2303_path = 'sandbox/seeded-placeholder-2303.pdf'
    }
  }
  return next
}

loadEnvFile('.env.local')
loadEnvFile('.env.migrate')
loadEnvFile('.env')

const prodUrl = process.env.DATABASE_URL
const e2eUrl = process.env.E2E_DATABASE_URL
const e2eRef = refFromUrl(process.env.E2E_SUPABASE_URL || '', 'unknown')
const prodDbRef = refFromDatabaseUrl(prodUrl || '')
const e2eDbRef = refFromDatabaseUrl(e2eUrl || '')
if (!prodUrl || !e2eUrl) {
  console.error('Missing DATABASE_URL or E2E_DATABASE_URL. Both are required for prod-read to e2e-write seeding.')
  process.exit(1)
}
if (prodDbRef !== PROD_REF || e2eRef === PROD_REF || e2eDbRef === PROD_REF || e2eDbRef === 'unknown' || e2eDbRef !== e2eRef) {
  console.error(`Refusing to seed: target mismatch or unsafe target (prod db ref=${prodDbRef}, e2e url ref=${e2eRef}, e2e db ref=${e2eDbRef}).`)
  process.exit(1)
}

console.log(`prod db ref: ${prodDbRef}`)
console.log(`e2e url ref: ${e2eRef}`)
console.log(`e2e db ref : ${e2eDbRef}`)

const prod = await openClient('prod read', prodUrl)
const e2e = await openClient('e2e write', e2eUrl)

try {
  const [prodCols, e2eCols] = await Promise.all([consigneeColumns(prod), consigneeColumns(e2e)])
  const columns = SAFE_COLUMNS.filter((c) => prodCols.has(c) && e2eCols.has(c))
  if (!columns.includes('code') || !columns.includes('name')) {
    throw new Error('Both databases must expose public.consignees(code, name).')
  }

  const prodCount = await prod.query('select count(*)::int as n from public.consignees')
  const e2eBefore = await e2e.query('select count(*)::int as n from public.consignees')
  console.log(`prod consignees: ${prodCount.rows[0].n}`)
  console.log(`e2e consignees before: ${e2eBefore.rows[0].n}`)

  const selectList = columns.map(quoteIdent).join(', ')
  const rows = (await prod.query(`
    select ${selectList}
      from public.consignees
     where code is not null
       and name is not null
     order by code nulls last, name
  `)).rows.map((row) => sandboxSafeConsignee(row, columns))

  await e2e.query('begin')
  let upserted = 0
  for (const chunk of chunkRows(rows, 250)) {
    const values = []
    const placeholders = chunk.map((row, rowIndex) => {
      const params = columns.map((column) => {
        values.push(row[column])
        return `$${values.length}`
      })
      return `(${params.join(', ')})`
    })
    const updateColumns = columns.filter((c) => c !== 'code')
    const updateList = updateColumns.map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`).join(', ')
    const res = await e2e.query(`
      insert into public.consignees (${columns.map(quoteIdent).join(', ')})
      values ${placeholders.join(', ')}
      on conflict (code) do update set ${updateList}
    `, values)
    upserted += res.rowCount
  }

  if (e2eCols.has('code')) {
    await e2e.query(`
      select setval(
        'public.consignee_code_seq',
        greatest(
          coalesce((select max((regexp_match(code, '^CN-([0-9]+)$'))[1]::bigint) from public.consignees where code ~ '^CN-[0-9]+$'), 0),
          1
        ),
        true
      )
    `)
  }

  await e2e.query('commit')

  const e2eAfter = await e2e.query('select count(*)::int as n from public.consignees')
  const first = await e2e.query('select code, name from public.consignees order by code asc limit 3')
  const last = await e2e.query('select code, name from public.consignees order by code desc limit 3')
  console.log(`upserted rows: ${upserted}`)
  console.log(`e2e consignees after: ${e2eAfter.rows[0].n}`)
  console.log('first 3:', first.rows.map((r) => `${r.code} ${r.name}`).join(' | '))
  console.log('last 3 :', last.rows.map((r) => `${r.code} ${r.name}`).join(' | '))
} catch (e) {
  try { await e2e.query('rollback') } catch { /* ignored */ }
  throw e
} finally {
  await prod.end()
  await e2e.end()
}
