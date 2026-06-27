import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import ProtectedDoc from './ProtectedDoc'

// Render a small, fixed subset of Markdown (headings, bullets, bold, italic,
// rules, paragraphs) — enough for the legal docs, with no external dependency.
//
// SECURITY BOUNDARY: only feed this TRUSTED content checked into the repo
// (src/content/*). All text renders through React text nodes (no innerHTML),
// so there is no XSS — but the parser is intentionally minimal and is NOT
// built to render arbitrary user-supplied markdown. If user content ever
// needs markdown, use react-markdown with sanitization instead.
function renderInline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  text.split(/(\*\*[^*]+\*\*)/g).forEach((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      out.push(<strong key={`${key}-b${i}`}>{part.slice(2, -2)}</strong>)
    } else {
      part.split(/(\*[^*]+\*)/g).forEach((sub, j) => {
        if (/^\*[^*]+\*$/.test(sub)) out.push(<em key={`${key}-i${i}-${j}`}>{sub.slice(1, -1)}</em>)
        else if (sub) out.push(<span key={`${key}-t${i}-${j}`}>{sub}</span>)
      })
    }
  })
  return out
}

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []
  let list: string[] = []
  let k = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${k++}`} style={{ margin: '0 0 12px', lineHeight: 1.65, fontSize: 14 }}>
          {renderInline(para.join(' '), `p${k}`)}
        </p>,
      )
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`u${k++}`} style={{ margin: '0 0 14px', paddingLeft: 20, display: 'grid', gap: 6 }}>
          {list.map((li, i) => (
            <li key={i} style={{ lineHeight: 1.6, fontSize: 14 }}>{renderInline(li, `u${k}-${i}`)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) {
      flushPara(); flushList()
      blocks.push(<h3 key={`h${k++}`} style={{ margin: '16px 0 8px', fontSize: 15, fontWeight: 600 }}>{renderInline(line.slice(4), `h${k}`)}</h3>)
    } else if (line.startsWith('## ')) {
      flushPara(); flushList()
      blocks.push(<h2 key={`h${k++}`} style={{ margin: '22px 0 10px', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{renderInline(line.slice(3), `h${k}`)}</h2>)
    } else if (line.startsWith('# ')) {
      flushPara(); flushList()
      blocks.push(<h1 key={`h${k++}`} style={{ margin: '0 0 12px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{renderInline(line.slice(2), `h${k}`)}</h1>)
    } else if (line === '---') {
      flushPara(); flushList()
      blocks.push(<hr key={`hr${k++}`} style={{ border: 0, borderTop: '1px solid var(--glass-brd)', margin: '20px 0' }} />)
    } else if (line.startsWith('- ')) {
      flushPara()
      list.push(line.slice(2))
    } else if (line === '') {
      flushPara(); flushList()
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara(); flushList()
  return blocks
}

// Just the rendered document body (no page chrome) — reusable inside an inline
// scroll box (e.g. the registration consent) as well as the full-page view.
export function MarkdownBody({ body }: { body: string }) {
  return <>{renderMarkdown(body)}</>
}

export default function MarkdownDoc({ body }: { body: string }) {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px 80px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <img src="/ktc-logo.png" alt="KTC Container Terminal Corp" style={{ height: 48 }} />
        <button className="ktc-link" onClick={() => navigate(-1)}>← Back</button>
      </header>
      <ProtectedDoc>
        <div className="ktc-glass" style={{ padding: '32px 34px' }}>
          <MarkdownBody body={body} />
        </div>
      </ProtectedDoc>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 22 }}>
        <button className="ktc-link" onClick={() => navigate(-1)}>← Back</button>
        <button className="ktc-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑ Back to top</button>
      </div>
    </div>
  )
}
