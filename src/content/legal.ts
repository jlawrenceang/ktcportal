import agreementBody from './broker-agreement.md?raw'

// One master document: the KTC Broker Agreement (terms of use + broker conduct +
// confidentiality/NDA + Data Privacy Act consent). Bump AGREEMENT_VERSION on any
// material change; the version a broker accepted is recorded at registration so a
// new version can later require re-acceptance.
export const AGREEMENT_VERSION = 'v1'
export const AGREEMENT_VERSION_LABEL = 'Version 1.0'
export const AGREEMENT_BODY = agreementBody
