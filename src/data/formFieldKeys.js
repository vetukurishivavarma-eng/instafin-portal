// Field keys a calibrated bank application form can have, and their labels.
// Must match backend/src/data/formSources.js FORM_FIELD_KEYS exactly — both
// the AI calibrator and the visual field editor rely on this same key set.
export const FORM_FIELD_KEYS = [
  'full_name',
  'dob',
  'gender',
  'aadhaar_number',
  'pan_number',
  'address',
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

export const FORM_FIELD_LABELS = {
  full_name: 'Full Name',
  dob: 'Date of Birth',
  gender: 'Gender',
  aadhaar_number: 'Aadhaar Number',
  pan_number: 'PAN Number',
  address: 'Address',
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
