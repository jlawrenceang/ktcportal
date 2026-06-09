import MarkdownDoc from '../components/MarkdownDoc'
import { AGREEMENT_BODY } from '../content/legal'

export default function Agreement() {
  return <MarkdownDoc body={AGREEMENT_BODY} />
}
