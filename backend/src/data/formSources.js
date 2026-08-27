/**
 * Catalog of bank application forms that can be fetched from the internet
 * and registered into the application_forms table.
 *
 * Add/remove entries here to expand coverage. The sync endpoint
 * (POST /api/forms/sync) downloads each URL and upserts the form.
 *
 * NOTE: Some bank CDNs (e.g. bankofindia.bank.in) return HTTP 403 to
 * server-side bots. When that happens the sync reports a clear failure and
 * you can either:
 *   1. Open the URL in a browser, download the PDF manually and register it
 *      via the existing "Add New Form" panel in Download Forms → Manage Forms.
 *   2. Update the URL here if the bank changes its CDN behaviour.
 */

export const FORM_SOURCES = [
  {
    bank_name: 'State Bank of India',
    loan_type: 'Home Loan',
    form_name: 'SBI Home Loan Application Form',
    file_name: 'sbi_home_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://homeloans.sbi.bank.in/downloads/Home-Loan-Application-Form-English.pdf',
  },
  {
    bank_name: 'HDFC Bank',
    loan_type: 'Home Loan',
    form_name: 'HDFC Home Loan Application Form',
    file_name: 'hdfc_home_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://homeloans.hdfc.bank.in/content/dam/housingdevelopmentfinancecorp/documents/checklist/download-forms/HDFC%20Bank%20Home%20Loan%20Application%20Form.pdf',
  },
  {
    bank_name: 'Axis Bank',
    loan_type: 'Personal Loan',
    form_name: 'Axis Bank Personal Loan Application Form',
    file_name: 'axis_personal_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://www.axis.bank.in/docs/default-source/download-forms/loans/personal-loan-application-form.pdf',
  },
  {
    bank_name: 'Axis Bank',
    loan_type: 'Home Loan',
    form_name: 'Axis Bank Home Loan Application Form',
    file_name: 'axis_home_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://www.axis.bank.in/docs/default-source/default-document-library/home-loan/application-form-for-home-loan.pdf?sfvrsn=3c324c74_1',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    loan_type: 'Personal Loan',
    form_name: 'Kotak Personal Loan Application Form',
    file_name: 'kotak_pl_form.pdf',
    file_type: 'pdf',
    url: 'https://www.kotak.bank.in/content/dam/Kotak/Customer-Service/Download-Forms/Personal-Banking/loans/personal_loan/personal-loan-application-form.pdf',
  },
  {
    bank_name: 'Kotak Mahindra Bank',
    loan_type: 'Home Loan',
    form_name: 'Kotak Home Loan Application Form',
    file_name: 'kotak_hl_form.pdf',
    file_type: 'pdf',
    url: 'https://www.kotak.bank.in/content/dam/Kotak/Customer-Service/Download-Forms/Personal-Banking/loans/home_loan/home-loan-application-form.pdf',
  },
  {
    bank_name: 'Bank of India',
    loan_type: 'Home Loan',
    form_name: 'BOI Star Home Loan Application Form',
    file_name: 'boi_star_home_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://bankofindia.bank.in/documents/20121/1250644/StarHomeLoan.pdf/2bd7d94d-c79f-56ee-caec-ab36ffd01983?t=1670054258654',
  },
  {
    bank_name: 'Bank of India',
    loan_type: 'Personal Loan',
    form_name: 'BOI Star Personal Loan Application Form',
    file_name: 'boi_star_personal_loan_form.pdf',
    file_type: 'pdf',
    url: 'https://bankofindia.bank.in/documents/20121/1250644/STARPERSONALLOAN+%282%29.pdf/29474d7f-4862-0248-cd82-bca5a343f6b9?t=1670054263285',
  },
];

// Canonical field keys understood by the PDF filler / calibrator.
// Keep in sync with the keys used in the Gemini calibration prompt and the
// extracted_details payload from the document analysis flow.
export const FORM_FIELD_KEYS = [
  'full_name',
  'first_name',
  'middle_name',
  'ckyc_number',
  'dob',
  'gender',
  'aadhaar_number',
  'pan_number',
  'address',
  'flat_door_block',
  'premises_name',
  'road_street',
  'area_locality',
  'town_city_village',
  'district',
  'state',
  'pin_code',
  'mobile',
  'email',
  'loan_amount',
  'loan_type',
  'gross_income',
  'monthly_income',
  'rental_income',
  'co_applicant_name',
  'co_applicant_dob',
  'employer_name',
  'application_date',
];

// Human labels for the canonical keys, shown next to each input in the
// portal's fill UI. Mirrors src/data/formFieldKeys.js on the frontend;
// generically-discovered fields carry their own label from the form's own
// printed text instead, so this map only needs the canonical set.
export const FORM_FIELD_LABELS = {
  full_name: 'Full Name',
  first_name: 'First Name',
  middle_name: 'Middle Name',
  ckyc_number: 'CKYC Number',
  dob: 'Date of Birth',
  gender: 'Gender',
  aadhaar_number: 'Aadhaar Number',
  pan_number: 'PAN Number',
  address: 'Address',
  flat_door_block: 'Flat / Door / Block No.',
  premises_name: 'Name of Premises / Building',
  road_street: 'Road / Street',
  area_locality: 'Area / Locality',
  town_city_village: 'Town / City / Village',
  district: 'District',
  state: 'State / Union Territory',
  pin_code: 'PIN Code',
  mobile: 'Mobile Number',
  email: 'Email',
  loan_amount: 'Loan Amount',
  loan_type: 'Loan Type',
  gross_income: 'Gross Income',
  monthly_income: 'Monthly Income',
  rental_income: 'Rental Income',
  co_applicant_name: 'Co-applicant Name',
  co_applicant_dob: 'Co-applicant Date of Birth',
  employer_name: 'Employer / Business Name',
  application_date: 'Application Date',
};
