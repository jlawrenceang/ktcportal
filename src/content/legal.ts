import agreementBody from './customer-agreement.md?raw'

// One master document: the KTC Customer Agreement (terms of use + customer conduct +
// confidentiality/NDA + Data Privacy Act consent). Bump AGREEMENT_VERSION on any
// material change; the version a customer accepted is recorded at registration so a
// new version can later require re-acceptance.
export const AGREEMENT_VERSION = 'v2'
export const AGREEMENT_VERSION_LABEL = 'Version 2.0'
export const AGREEMENT_BODY = agreementBody
