/**
 * KTC Customer Information Sheet → Google Form generator.
 *
 * Builds the "KTC Customer Information Sheet" Google Form (mapped field-for-field
 * from KTC CUSTOMER INFO FORM v1.pdf) + a linked responses Google Sheet, in YOUR
 * Google account.
 *
 * HOW TO RUN (one time):
 *   1. Go to https://script.google.com  → New project.
 *   2. Delete the sample code, paste THIS whole file in.
 *   3. Click Run (▶) on createKtcCustomerInfoForm. Approve the permissions prompt
 *      (it needs Forms + Sheets/Drive in your account).
 *   4. Open View → Logs (or Execution log). It prints:
 *        • the LIVE form link (share this with customers)
 *        • the EDIT link (to tweak the form)
 *        • the RESPONSES sheet link (every submission lands here)
 *
 * NOTE on file uploads (2303 / 2307 / zero-rating cert): Google Forms file-upload
 * questions REQUIRE the respondent to be signed in to a Google account, and the
 * files go to YOUR Drive. If many customers don't have Google accounts, set
 * INCLUDE_FILE_UPLOADS = false below — the form will instead ask them to email the
 * documents (and you can keep collecting 2303/2307 inside the KTC portal).
 */

// Default false: walk-ins scan a QR and fill the form on their OWN phone, where a
// Google file-upload would force them to sign in to a Google account (friction).
// They bring/email the 2303/2307 and staff file them. Set true only if you expect
// signed-in respondents on desktop.
var INCLUDE_FILE_UPLOADS = false;

function createKtcCustomerInfoForm() {
  var form = FormApp.create('KTC Customer Information Sheet');
  form.setTitle('KTC Customer Information Sheet');
  form.setDescription(
    'KTC Container Terminal Corp. — Customer Information Sheet (v1.0.0)\n' +
    'Davao–Agusan Road, KM 20 Buhisan, Tibungco, Davao City · Telefax (082) 295-7300\n\n' +
    'Please complete all required fields. Fields marked * are required.'
  );
  form.setCollectEmail(true);      // captures the submitter's Google email (audit trail)
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);

  var emailRule = FormApp.createTextValidation().requireTextIsEmail().build();

  // ── New customer vs updating records ──────────────────────────────────────
  form.addMultipleChoiceItem()
    .setTitle('This submission is a…')
    .setChoiceValues(['New Customer', 'Updating Records'])
    .setRequired(true);

  // ── CUSTOMER INFORMATION ──────────────────────────────────────────────────
  form.addSectionHeaderItem()
    .setTitle('Customer Information');

  form.addTextItem()
    .setTitle('Trade Name')
    .setHelpText('As it appears in the invoice.')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Customer Name')
    .setHelpText('Leave blank if same as Trade Name.')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Business Address — Line 1')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Business Address — Line 2')
    .setRequired(false);

  form.addTextItem()
    .setTitle('TIN / VAT Reg. #')
    .setHelpText('e.g. 000-000-000-00000')
    .setRequired(true);

  // ── COMPANY DETAILS ───────────────────────────────────────────────────────
  form.addSectionHeaderItem()
    .setTitle('Company Details');

  form.addTextItem()
    .setTitle('Telephone No.')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Mobile No.')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Company Email Address')
    .setValidation(emailRule)
    .setRequired(true);

  // ── CONTACT INFORMATION (authorized representatives) ───────────────────────
  form.addSectionHeaderItem()
    .setTitle('Contact Information')
    .setHelpText('If an authorized representative, please indicate the representative in the Position field. ' +
                 'Provide at least one contact; leave Contact 2 / 3 blank if not applicable.');

  addContactGroup(form, 'Contact 1', true, emailRule);
  addContactGroup(form, 'Contact 2', false, emailRule);
  addContactGroup(form, 'Contact 3', false, emailRule);

  // ── REQUIRED DOCUMENTS ────────────────────────────────────────────────────
  form.addSectionHeaderItem()
    .setTitle('Required Documents')
    .setHelpText('Please submit a copy of the latest documents.');

  if (INCLUDE_FILE_UPLOADS) {
    form.addFileUploadItem()
      .setTitle('1. BIR Certificate of Registration (BIR Form 2303)')
      .setRequired(true);

    form.addFileUploadItem()
      .setTitle('2. BIR Form 2307 (if withholding agent)')
      .setHelpText('Only if you are a withholding agent.')
      .setRequired(false);

    form.addFileUploadItem()
      .setTitle('3. Zero-Rating Certificate (if zero-rated)')
      .setHelpText('Only if you are zero-rated.')
      .setRequired(false);
  } else {
    form.addSectionHeaderItem()
      .setTitle('How to submit your documents')
      .setHelpText('Please email copies of the latest:\n' +
        '1. BIR Certificate of Registration (BIR Form 2303) — required\n' +
        '2. BIR Form 2307 — if you are a withholding agent\n' +
        '3. Zero-Rating Certificate — if you are zero-rated\n\n' +
        'Send to KTC, or upload them through the KTC Online Portal.');
  }

  // ── CERTIFICATION ─────────────────────────────────────────────────────────
  form.addSectionHeaderItem()
    .setTitle('Certification');

  form.addCheckboxItem()
    .setTitle('Certification')
    .setChoiceValues([
      'I hereby certify that all the information provided in this Customer Information Sheet is true, ' +
      'correct, and complete to the best of my knowledge and belief. I understand that providing false ' +
      'or misleading information may result in the denial or cancellation of my account and services, ' +
      'and I agree to notify the Company immediately in writing of any changes to this information.'
    ])
    .setRequired(true);

  form.addTextItem()
    .setTitle('Printed Name of Authorized Representative')
    .setRequired(true);

  form.addDateItem()
    .setTitle('Date')
    .setRequired(true);

  // ── Linked responses spreadsheet ──────────────────────────────────────────
  var ss = SpreadsheetApp.create('KTC Customer Information Sheet — Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('────────────────────────────────────────────────────────');
  Logger.log('LIVE form (share with customers): %s', form.getPublishedUrl());
  Logger.log('EDIT the form:                    %s', form.getEditUrl());
  Logger.log('RESPONSES sheet:                  %s', ss.getUrl());
  Logger.log('────────────────────────────────────────────────────────');
}

/** One representative row: Name / Position / Contact Number / Email. */
function addContactGroup(form, label, required, emailRule) {
  form.addTextItem().setTitle(label + ' — Name').setRequired(required);
  form.addTextItem().setTitle(label + ' — Position').setRequired(false);
  form.addTextItem().setTitle(label + ' — Contact Number').setRequired(required);
  form.addTextItem().setTitle(label + ' — Email Address').setValidation(emailRule).setRequired(false);
}
