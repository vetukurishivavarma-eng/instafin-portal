/**
 * Full checklist data for all loan types
 * Decision tree: loanType → loanStatus → incomeSource → residentType → [businessType?] → CHECKLIST
 */

import { DecisionTree, ChecklistItem, DocumentCategory } from './types';

// Helper to create checklist items
const createChecklistItem = (
  id: string,
  name: string,
  category: DocumentCategory,
  required: boolean = true
): ChecklistItem => ({
  id,
  name,
  category,
  required,
});

// ============================================================
// KYC Documents
// ============================================================
const kycDocuments = {
  aadhaar: createChecklistItem('kyc_aadhaar', 'Aadhaar Card', 'kyc'),
  pan: createChecklistItem('kyc_pan', 'PAN Card', 'kyc'),
  addressProof: createChecklistItem('kyc_addr_proof', 'Present Address Proof (if Aadhaar address differs)', 'kyc', false),
  passport: createChecklistItem('kyc_passport', 'Passport (Valid)', 'kyc'),
  voterId: createChecklistItem('kyc_voter', 'Voter ID', 'kyc'),
  drivingLicense: createChecklistItem('kyc_dl', 'Driving License', 'kyc'),
  photo: createChecklistItem('kyc_photo', 'Passport Size Photo (3 nos)', 'kyc'),
  nriPassport: createChecklistItem('kyc_nri_passport', 'NRI Passport with Valid Visa', 'kyc'),
  poa: createChecklistItem('kyc_poa', 'Power of Attorney (if applicable)', 'kyc', false),
  overseasAddress: createChecklistItem('kyc_overseas_addr', 'Overseas Address Proof', 'kyc'),
  overseasCreditReport: createChecklistItem('kyc_overseas_credit', 'Overseas Credit Report', 'kyc'),
  workPermit: createChecklistItem('kyc_work_permit', 'Work Permit', 'kyc'),
  visa: createChecklistItem('kyc_visa', 'VISA', 'kyc'),
  cdc: createChecklistItem('kyc_cdc', 'CDC (Continuous Discharge Certificate)', 'kyc'),
  poaHolderBio: createChecklistItem('kyc_poa_bio', 'Bio-data Form of POA Holder', 'kyc'),
  poaNotarized: createChecklistItem('kyc_poa_notarized', 'Power of Attorney – Notarized Abroad & Adjudicated in India', 'kyc'),
};

// ============================================================
// Income Proofs - Salaried
// ============================================================
const incomeProofsSalaried = {
  salaryAccountStmt12: createChecklistItem('inc_salary_acct_12', 'Salary Account Statement (Last 1 Year)', 'income_proof'),
  salaryAcctStmt6: createChecklistItem('inc_salary_acct_6', 'Salary Account Statement (Last 6 Months)', 'income_proof'),
  paySlips6: createChecklistItem('inc_payslips_6', 'Pay Slips (Last 6 Months)', 'income_proof'),
  paySlips12: createChecklistItem('inc_payslips_12', 'Pay Slips (Last 12 Months)', 'income_proof'),
  offerLetter: createChecklistItem('inc_offer_letter', 'Offer Letter / Previous Relieving Letter', 'income_proof'),
  form16_2y: createChecklistItem('inc_form16_2y', 'Form 16 (Last 2 Years)', 'income_proof'),
  companyID: createChecklistItem('inc_company_id', 'Company ID Card', 'income_proof'),
  salarySlips: createChecklistItem('inc_salary_slips', 'Salary Slips (Last 3 Months)', 'income_proof'),
  salarySlips6: createChecklistItem('inc_salary_slips_6', 'Salary Slips (Last 6 Months)', 'income_proof'),
  form16: createChecklistItem('inc_form16', 'Form 16 (Latest)', 'income_proof'),
  itReturns: createChecklistItem('inc_it_returns', 'IT Returns (Last 2 Years)', 'income_proof'),
  itReturns2_nri: createChecklistItem('inc_it_returns_2_nri', 'Income Tax Returns or W2 (Last 2 Years)', 'income_proof'),
  bankStatements: createChecklistItem('inc_bank_stmt', 'Bank Statements (Last 6 Months)', 'income_proof'),
  bankStatements12: createChecklistItem('inc_bank_stmt_12', 'Bank Statements (Last 12 Months)', 'income_proof'),
  employmentLetter: createChecklistItem('inc_emp_letter', 'Employment Letter / Appointment Letter', 'income_proof'),
  salaryCertOriginal: createChecklistItem('inc_salary_cert_orig', 'Latest Salary Certificate / Pay Slip – Original (Last 6 Months)', 'income_proof'),
  employerIdCard: createChecklistItem('inc_employer_id', 'Copy of Identity Card from Current Employer', 'income_proof'),
  prevEmployerDetails: createChecklistItem('inc_prev_employer', 'Details of Previous Employer', 'income_proof'),
  overseasBankStmt6: createChecklistItem('inc_overseas_bank_6', 'Bank Details – Previous 6 Months (Overseas + Indian Account)', 'income_proof'),
  overseasResidenceProof: createChecklistItem('inc_overseas_res', 'Proof of Residence Abroad (Utility Bill / Driving Licence)', 'income_proof'),
  employmentContract: createChecklistItem('inc_emp_contract', 'Employment Contract', 'income_proof'),
  creditInfoReport: createChecklistItem('inc_credit_info', 'Credit Information Report', 'income_proof'),
};

// ============================================================
// Income Proofs - Non-Salaried (kept for non-Home Loan entries)
// ============================================================
const incomeProofsNonSalaried = {
  itReturns: createChecklistItem('inc_it_returns', 'IT Returns (Last 2 Years)', 'income_proof'),
  itReturns3: createChecklistItem('inc_it_returns_3', 'IT Returns (Last 3 Years)', 'income_proof'),
  auditReport: createChecklistItem('inc_audit_report', 'Audit Report (Latest)', 'income_proof'),
  bankStatements: createChecklistItem('inc_bank_stmt', 'Bank Statements (Last 12 Months)', 'income_proof'),
  bankStatements6: createChecklistItem('inc_bank_stmt_6', 'Bank Statements (Last 6 Months)', 'income_proof'),
  incomeCertificate: createChecklistItem('inc_income_cert', 'Income Certificate', 'income_proof'),
};

// ============================================================
// Business Documents (kept for non-Home Loan entries)
// ============================================================
const businessDocuments = {
  gstReturns: createChecklistItem('biz_gst', 'GST Returns (Last 12 Months)', 'business_documents'),
  gstRegistration: createChecklistItem('biz_gst_reg', 'GST Registration Certificate', 'business_documents'),
  businessRegistration: createChecklistItem('biz_reg', 'Business Registration / Incorporation Certificate', 'business_documents'),
  shopAct: createChecklistItem('biz_shop_act', 'Shop Act / Establishment License', 'business_documents'),
  partnershipDeed: createChecklistItem('biz_partnership', 'Partnership Deed', 'business_documents'),
  moaAoa: createChecklistItem('biz_moa_aoa', 'MOA & AOA', 'business_documents'),
  udyamAadhaar: createChecklistItem('biz_udyam', 'Udyam Aadhaar Registration', 'business_documents'),
  tradelicense: createChecklistItem('biz_trade_license', 'Trade License', 'business_documents'),
  msmeCert: createChecklistItem('biz_msme', 'MSME Certificate', 'business_documents'),
};

// ============================================================
// MSME / SME Documents (per the SME/Retail loan matrix)
// ============================================================
const msmeDocuments = {
  // Section A - Project / Business Overview (all SME applicants)
  projectReport: createChecklistItem('msme_project_report', 'Detailed Project Report', 'business_documents'),
  companyProfile: createChecklistItem('msme_company_profile', 'Company Profile & Individual Partners/Director Profile', 'business_documents'),
  cmaData: createChecklistItem('msme_cma_data', 'CMA Data', 'financial_documents'),

  // Section C / Section E - Form 26AS
  form26as3: createChecklistItem('msme_form26as_3', 'Form 26AS (Last 3 Years) — all partners/applicants', 'income_proof'),

  // Section C - Entity Financials (Partnership Firm SME)
  gstr3b1: createChecklistItem('msme_gstr3b_1', 'Firm GSTR-3B Returns filed (Last 1 Year)', 'business_documents'),

  // Section B - Entity KYC
  firmRegCert: createChecklistItem('msme_firm_reg_cert', 'Firm Registration Certificate', 'business_documents'),


};


// ============================================================
// Income Proofs - Self Employed (Individual)
// ============================================================
const incomeProofsSelfEmployed = {
  indITReturns3: createChecklistItem('inc_ind_it3', 'Individual / Proprietor IT Returns (Last 3 Years)', 'income_proof'),
  indITReturns3_partners: createChecklistItem('inc_ind_it3_partners', 'Individual IT Returns – All Partners (Last 3 Years)', 'income_proof'),
  indITReturns3_directors: createChecklistItem('inc_ind_it3_directors', 'Individual IT Returns – All Directors (Last 3 Years)', 'income_proof'),
  indSavingsStmt1: createChecklistItem('inc_ind_savings_1', 'Individual Savings Account Statement (Last 1 Year)', 'income_proof'),
};

// ============================================================
// Business / Firm Documents
// ============================================================
const firmDocuments = {
  proprietorCurrentStmt1: createChecklistItem('firm_prop_current_1', 'Proprietor Current Account Statement (Last 1 Year)', 'business_documents'),
  latestProvisional: createChecklistItem('firm_latest_prov', 'Latest Provisional Balance Sheet (if any)', 'business_documents', false),
  gstRegCert: createChecklistItem('firm_gst_reg', 'GST Registration Certificate', 'business_documents'),
  gstReturns1: createChecklistItem('firm_gst_returns_1', 'GST Returns (Last 1 Year)', 'business_documents'),
  udyamCert: createChecklistItem('firm_udyam', 'Udyam Registration Certificate', 'business_documents'),
  labourCert: createChecklistItem('firm_labour_cert', 'Labour Certificate / Registration Certificate of Proprietor', 'business_documents'),
  firmPan: createChecklistItem('firm_pan', 'Firm / Company PAN', 'business_documents'),
  partnershipDeed: createChecklistItem('firm_partnership_deed', 'Registration Certificate & Partnership Deed', 'business_documents'),
  firmITReturns3: createChecklistItem('firm_it3', 'Firm IT Returns (Last 3 Years) with Balance Sheet & P&L', 'business_documents'),
  firmCurrentStmt1: createChecklistItem('firm_current_1', 'Firm Current Account Statement (Last 1 Year)', 'business_documents'),
  regCertAoaMoaPvt: createChecklistItem('firm_reg_pvt', 'Registration Certificate + AOA + MOA (Pvt Ltd) + Incorporation Certificate', 'business_documents'),
  regCertAoaMoaLLP: createChecklistItem('firm_reg_llp', 'Registration Certificate + AOA + MOA + LLP Agreement', 'business_documents'),
  companyITReturns3: createChecklistItem('firm_company_it3', 'Company IT Returns (Last 3 Years) with Balance Sheet & P&L', 'business_documents'),
  companyCurrentStmt1: createChecklistItem('firm_company_current_1', 'Company Current Account Statement (Last 1 Year)', 'business_documents'),
  llpITReturns3: createChecklistItem('firm_llp_it3', 'LLP IT Returns (Last 3 Years) with Balance Sheet & P&L', 'business_documents'),
  llpCurrentStmt1: createChecklistItem('firm_llp_current_1', 'LLP Current Account Statement (Last 1 Year)', 'business_documents'),
  gstReturns1_firm: createChecklistItem('firm_gst_returns', 'GST Returns (Last 1 Year)', 'business_documents'),
};

// ============================================================
// Existing Loan Documents (shared)
// ============================================================
const existingLoanDocs = {
  sanctionLetter: createChecklistItem('loan_sanction_letter', 'Loan Sanction Letter (if any)', 'financial_documents', false),
  loanAcctStmt: createChecklistItem('loan_acct_stmt', 'Loan A/C Statement – Last 1 Year (if any)', 'financial_documents', false),
};

// ============================================================
// Property Documents – Home Loan NEW
// ============================================================
const propertyNew = {
  saleAgreement: createChecklistItem('prop_sale_agreement', 'Sale Agreement', 'property_documents'),
  saleDeedDraft: createChecklistItem('prop_sale_deed_draft', 'Sale Deed Draft', 'property_documents'),
  linkDocs: createChecklistItem('prop_link_docs', 'Link Documents', 'property_documents'),
  planProceeding: createChecklistItem('prop_plan_proceeding', 'Plan & Proceedings Copy', 'property_documents'),
  houseTax: createChecklistItem('prop_house_tax', 'House Tax', 'property_documents'),
  powerBill: createChecklistItem('prop_power_bill', 'Power Bill', 'property_documents'),
};

// ============================================================
// Property Documents – Home Loan TAKEOVER
// ============================================================
const propertyTakeover = {
  docList: createChecklistItem('prop_doc_list', 'List of Documents (from Existing Lender)', 'property_documents'),
  saleDeedFinal: createChecklistItem('prop_sale_deed_final', 'Sale Deed (Final Registered Deed)', 'property_documents'),
  linkDocs: createChecklistItem('prop_link_docs', 'Link Documents', 'property_documents'),
  planProceeding: createChecklistItem('prop_plan_proceeding', 'Plan & Proceedings Copy', 'property_documents'),
  houseTax: createChecklistItem('prop_house_tax', 'House Tax', 'property_documents'),
  powerBill: createChecklistItem('prop_power_bill', 'Power Bill', 'property_documents'),
};

// ============================================================
// Property Documents – Home Loan CONSTRUCTION
// ============================================================
const propertyConstruction = {
  estimation: createChecklistItem('prop_estimation', 'Estimation (Construction Cost Estimate)', 'property_documents'),
  saleDeed: createChecklistItem('prop_sale_deed', 'Sale Deed', 'property_documents'),
  linkDocs: createChecklistItem('prop_link_docs', 'Link Documents', 'property_documents'),
  planProceeding: createChecklistItem('prop_plan_proceeding', 'Plan & Proceedings Copy', 'property_documents'),
  houseTax: createChecklistItem('prop_house_tax', 'House Tax', 'property_documents'),
  powerBill: createChecklistItem('prop_power_bill', 'Power Bill', 'property_documents'),
};

// ============================================================
// Property Documents – Home Loan TOP-UP
// ============================================================
const propertyTopup = {
  saleDeed: createChecklistItem('prop_sale_deed', 'Sale Deed', 'property_documents'),
  linkDocs: createChecklistItem('prop_link_docs', 'Link Documents', 'property_documents'),
  planProceeding: createChecklistItem('prop_plan_proceeding', 'Plan & Proceedings Copy', 'property_documents'),
  houseTax: createChecklistItem('prop_house_tax', 'House Tax', 'property_documents'),
  powerBill: createChecklistItem('prop_power_bill', 'Power Bill', 'property_documents'),
};

// ============================================================
// Legacy property documents (kept for non-Home Loan entries)
// ============================================================
const propertyDocuments = {
  titleDeed: createChecklistItem('prop_title_deed', 'Title Deed / Original Documents', 'property_documents'),
  saleAgreement: createChecklistItem('prop_sale_agreement', 'Sale Agreement', 'property_documents'),
  encumbrance: createChecklistItem('prop_encumbrance', 'Encumbrance Certificate (Last 30 Years)', 'property_documents'),
  registeredSale: createChecklistItem('prop_reg_sale', 'Registered Sale Deed', 'property_documents'),
  approvalPlan: createChecklistItem('prop_approval_plan', 'Approved Plan / Building Permit', 'property_documents'),
  completionCert: createChecklistItem('prop_completion', 'Completion Certificate', 'property_documents'),
  occupancyCert: createChecklistItem('prop_occupancy', 'Occupancy Certificate', 'property_documents'),
  propertyTax: createChecklistItem('prop_tax_receipt', 'Property Tax Receipts (Latest)', 'property_documents'),
  mutation: createChecklistItem('prop_mutation', 'Mutation Certificate', 'property_documents'),
  khata: createChecklistItem('prop_khata', 'Khata Certificate & Extract', 'property_documents'),
  devAgreement: createChecklistItem('prop_dev_agreement', 'Development Agreement', 'property_documents'),
  allottmentLetter: createChecklistItem('prop_allotment', 'Allotment Letter', 'property_documents'),
  paymentReceipts: createChecklistItem('prop_payment', 'Payment Receipts / Booking Receipt', 'property_documents'),
  noc: createChecklistItem('prop_noc', 'No Objection Certificate (from Society/Builder)', 'property_documents'),
};

// MSME property documents (Section F simplified)
const msmePropertyDocs = [
  propertyDocuments.titleDeed,
  propertyNew.linkDocs,
  propertyNew.planProceeding,
  propertyNew.houseTax,
  propertyNew.powerBill,
];

// Common existing loan documents for MSME
const msmeExistingLoans = [existingLoanDocs.sanctionLetter, existingLoanDocs.loanAcctStmt];

// ============================================================
// Financial Documents (legacy, kept for non-Home Loan entries)
// ============================================================
const financialDocuments = {
  caStatement: createChecklistItem('fin_ca_stmt', 'CA Statement / Certified Financial Statement', 'financial_documents'),
  balanceSheet: createChecklistItem('fin_balance_sheet', 'Balance Sheet (Last 2 Years)', 'financial_documents'),
  profitLoss: createChecklistItem('fin_pnl', 'Profit & Loss Statement (Last 2 Years)', 'financial_documents'),
  cashFlow: createChecklistItem('fin_cashflow', 'Cash Flow Statement', 'financial_documents'),
  creditReport: createChecklistItem('fin_credit_report', 'Credit Report (CIBIL / Experian)', 'financial_documents'),
  existingLoans: createChecklistItem('fin_existing_loans', 'Existing Loan Sanction Letters & Statements', 'financial_documents'),
  securityDocuments: createChecklistItem('fin_security', 'Security Documents (if any)', 'financial_documents'),
};

// ============================================================
// Legal Documents (legacy, kept for non-Home Loan entries)
// ============================================================
const legalDocuments = {
  noc: createChecklistItem('legal_noc', 'No Objection Certificate', 'legal_documents'),
  approvalLetter: createChecklistItem('legal_approval', 'Approval Letter from Concerned Authority', 'legal_documents'),
  legalOpinion: createChecklistItem('legal_opinion', 'Legal Opinion / Title Search Report', 'legal_documents'),
  developmentRights: createChecklistItem('legal_dev_rights', 'Development Rights Document', 'legal_documents'),
  powerOfAttorney: createChecklistItem('legal_poa', 'Power of Attorney', 'legal_documents'),
  undertaking: createChecklistItem('legal_undertaking', 'Undertaking / Declaration', 'legal_documents'),
  societyNoc: createChecklistItem('legal_society_noc', 'Society NOC', 'legal_documents'),
  builderNoc: createChecklistItem('legal_builder_noc', 'Builder NOC', 'legal_documents'),
};

// ============================================================
// DECISION TREE
// Key format: loanType|loanStatus|incomeSource|residentType|businessType?
// ============================================================

// Standalone items for Business Loan Partnership (un-combined from firmDocuments.partnershipDeed)
const firmPartnershipDeed = createChecklistItem('biz_partnership_deed', 'Partnership Deed', 'business_documents');
const firmRegistrationCert = createChecklistItem('biz_reg_cert', 'Partnership Firm Registration Certificate', 'business_documents');

// Standalone items for Business Loan Proprietorship (clean items without redundancy)
const bizProprietorPan = createChecklistItem('biz_prop_pan', 'Proprietor PAN Card', 'business_documents');
const bizProprietorGstr3b = createChecklistItem('biz_prop_gstr3b', 'Proprietor GSTR-3B Returns filed (Last 1 Year)', 'business_documents');
const bizBusinessPhotos = createChecklistItem('biz_prop_photos', 'Business Photos', 'business_documents');
const bizOfficeCurrentBill = createChecklistItem('biz_prop_current_bill', 'Office Current Bill', 'business_documents');
const bizCoApplicantPan = createChecklistItem('biz_co_pan', 'PAN Card (Co-applicant)', 'kyc');
const bizCoApplicantAadhaar = createChecklistItem('biz_co_aadhaar', 'Aadhaar Card (Co-applicant)', 'kyc');
const bizOwnHouseProof = createChecklistItem('biz_own_house_proof', 'Sale Deed or Latest Property Tax', 'property_documents');

// ============================================================
// MSME Standalone Items
// ============================================================

// Partner loan documents for MSME
const msmePartnerSanctionLetter = createChecklistItem('msme_partner_sanc', 'If any loan for Partners – Sanction Letters', 'financial_documents', false);
const msmePartnerLoanAcctStmt = createChecklistItem('msme_partner_loan_stmt', 'If any loan for Partners – Loan A/C Statements (Last 1 Year)', 'financial_documents', false);

// Property documents for MSME (standalone, not reusing existing items)
const msmeSaleDeed = createChecklistItem('msme_sale_deed', 'Sale Deed', 'property_documents');
const msmeLinkDocs = createChecklistItem('msme_link_docs', 'Link Documents', 'property_documents');
const msmePlanProceeding = createChecklistItem('msme_plan_proceeding', 'Plan and Proceeding Copy', 'property_documents');
const msmePropertyTax = createChecklistItem('msme_prop_tax', 'Latest Property Tax', 'property_documents');
const msmeCurrentBill = createChecklistItem('msme_current_bill', 'Latest Current Bill', 'property_documents');

// Other Group Entity documents for MSME
const msmeGroupPan = createChecklistItem('msme_group_pan', 'Other Group Entity - Firm PAN Card', 'business_documents');
const msmeGroupUdyam = createChecklistItem('msme_group_udyam', 'Other Group Entity - Udyam Certificate', 'business_documents');
const msmeGroupGst = createChecklistItem('msme_group_gst', 'Other Group Entity - GST Certificate', 'business_documents');
const msmeGroupPartnershipDeed = createChecklistItem('msme_group_partnership', 'Other Group Entity - Partnership Deed', 'business_documents');
const msmeGroupRegCert = createChecklistItem('msme_group_reg_cert', 'Other Group Entity - Firm Registration Certificate', 'business_documents');
const msmeGroupCurrentStmt = createChecklistItem('msme_group_current_stmt', 'Other Group Entity - Firm Current Account Statement (Last 1 Year)', 'business_documents');
const msmeGroupGstr3b = createChecklistItem('msme_group_gstr3b', 'Other Group Entity - Firm GSTR-3B Returns (Last 1 Year)', 'business_documents');
const msmeGroupLoanStmt = createChecklistItem('msme_group_loan_stmt', 'Other Group Entity - If any loan - Loan A/C Statement (Last 1 Year)', 'financial_documents', false);
const msmeGroupItReturns = createChecklistItem('msme_group_it_returns', 'Other Group Entity - Firm IT Returns (Last 3 Years) with BS & P&L', 'business_documents');

// Helper: property docs by loan subtype for Home Loan
const hlPropertyDocs = {
  new: [
    propertyNew.saleAgreement,
    propertyNew.saleDeedDraft,
    propertyNew.linkDocs,
    propertyNew.planProceeding,
    propertyNew.houseTax,
    propertyNew.powerBill,
  ],
  takeover: [
    propertyTakeover.docList,
    propertyTakeover.saleDeedFinal,
    propertyTakeover.linkDocs,
    propertyTakeover.planProceeding,
    propertyTakeover.houseTax,
    propertyTakeover.powerBill,
  ],
  construction: [
    propertyConstruction.estimation,
    propertyConstruction.saleDeed,
    propertyConstruction.linkDocs,
    propertyConstruction.planProceeding,
    propertyConstruction.houseTax,
    propertyConstruction.powerBill,
  ],
  topup_equity: [
    propertyTopup.saleDeed,
    propertyTopup.linkDocs,
    propertyTopup.planProceeding,
    propertyTopup.houseTax,
    propertyTopup.powerBill,
  ],
};

// Helper: common existing loan docs
const hlExistingLoans = [existingLoanDocs.sanctionLetter, existingLoanDocs.loanAcctStmt];

export const DECISION_TREE: DecisionTree = {
  // ============================================================
  // HOME LOAN — NEW (7 profiles)
  // ============================================================

  // Home Loan | New | Salaried | Indian Resident
  'home_loan|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Salaried | NRI
  'home_loan|new|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Salaried | Merchant Navy
  'home_loan|new|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Self Employed | Proprietorship
  'home_loan|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Self Employed | Partnership Firm
  'home_loan|new|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Self Employed | Pvt Ltd
  'home_loan|new|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.new,
  ],

  // Home Loan | New | Self Employed | LLP
  'home_loan|new|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.new,
  ],

  // ============================================================
  // HOME LOAN — TAKEOVER (7 profiles)
  // ============================================================

  // Home Loan | Takeover | Salaried | Indian Resident
  'home_loan|takeover|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Salaried | NRI
  'home_loan|takeover|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Salaried | Merchant Navy
  'home_loan|takeover|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Self Employed | Proprietorship
  'home_loan|takeover|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Self Employed | Partnership Firm
  'home_loan|takeover|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Self Employed | Pvt Ltd
  'home_loan|takeover|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // Home Loan | Takeover | Self Employed | LLP
  'home_loan|takeover|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // ============================================================
  // HOME LOAN — CONSTRUCTION (7 profiles)
  // ============================================================

  // Home Loan | Construction | Salaried | Indian Resident
  'home_loan|construction|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Salaried | NRI
  'home_loan|construction|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Salaried | Merchant Navy
  'home_loan|construction|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Self Employed | Proprietorship
  'home_loan|construction|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Self Employed | Partnership Firm
  'home_loan|construction|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Self Employed | Pvt Ltd
  'home_loan|construction|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.construction,
  ],

  // Home Loan | Construction | Self Employed | LLP
  'home_loan|construction|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.construction,
  ],

  // ============================================================
  // HOME LOAN — TOP-UP (7 profiles)
  // ============================================================

  // Home Loan | Top-Up | Salaried | Indian Resident
  'home_loan|topup_equity|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Salaried | NRI
  'home_loan|topup_equity|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Salaried | Merchant Navy
  'home_loan|topup_equity|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Self Employed | Proprietorship
  'home_loan|topup_equity|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Self Employed | Partnership Firm
  'home_loan|topup_equity|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Self Employed | Pvt Ltd
  'home_loan|topup_equity|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // Home Loan | Top-Up | Self Employed | LLP
  'home_loan|topup_equity|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // ============================================================
  // LAP (Loan Against Property) — FRESH (7 profiles)
  // ============================================================

  // LAP | Fresh | Salaried | Indian Resident
  'lap|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Salaried | NRI
  'lap|new|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Salaried | Merchant Navy
  'lap|new|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Self Employed | Proprietorship
  'lap|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Self Employed | Partnership Firm
  'lap|new|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Self Employed | Pvt Ltd
  'lap|new|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Fresh | Self Employed | LLP
  'lap|new|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // ============================================================
  // LAP — TAKEOVER (7 profiles)
  // ============================================================

  // LAP | Takeover | Salaried | Indian Resident
  'lap|takeover|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Salaried | NRI
  'lap|takeover|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Salaried | Merchant Navy
  'lap|takeover|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Self Employed | Proprietorship
  'lap|takeover|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Self Employed | Partnership Firm
  'lap|takeover|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Self Employed | Pvt Ltd
  'lap|takeover|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // LAP | Takeover | Self Employed | LLP
  'lap|takeover|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.takeover,
  ],

  // ============================================================
  // LAP — TOP-UP (7 profiles)
  // ============================================================

  // LAP | Top-Up | Salaried | Indian Resident
  'lap|topup_equity|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.companyID,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Salaried | NRI
  'lap|topup_equity|salaried|nri': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsSalaried.companyID,
    kycDocuments.workPermit,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.overseasAddress,
    kycDocuments.overseasCreditReport,
    kycDocuments.photo,
    incomeProofsSalaried.salaryAccountStmt12,
    incomeProofsSalaried.paySlips12,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.itReturns2_nri,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Salaried | Merchant Navy
  'lap|topup_equity|salaried|merchant_navy': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.passport,
    kycDocuments.visa,
    kycDocuments.workPermit,
    kycDocuments.employmentContract,
    kycDocuments.photo,
    incomeProofsSalaried.salaryCertOriginal,
    incomeProofsSalaried.employerIdCard,
    incomeProofsSalaried.prevEmployerDetails,
    incomeProofsSalaried.overseasBankStmt6,
    incomeProofsSalaried.overseasResidenceProof,
    kycDocuments.cdc,
    kycDocuments.poaHolderBio,
    kycDocuments.poaNotarized,
    incomeProofsSalaried.creditInfoReport,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Self Employed | Proprietorship
  'lap|topup_equity|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.gstReturns1,
    firmDocuments.udyamCert,
    firmDocuments.labourCert,
    ...hlExistingLoans,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Self Employed | Partnership Firm
  'lap|topup_equity|non_salaried|indian_resident|partnership': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_partners,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.partnershipDeed,
    firmDocuments.firmITReturns3,
    firmDocuments.firmCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Self Employed | Pvt Ltd
  'lap|topup_equity|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaPvt,
    firmDocuments.companyITReturns3,
    firmDocuments.companyCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // LAP | Top-Up | Self Employed | LLP
  'lap|topup_equity|non_salaried|indian_resident|llp': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    ...hlExistingLoans,
    firmDocuments.firmPan,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    firmDocuments.regCertAoaMoaLLP,
    firmDocuments.llpITReturns3,
    firmDocuments.llpCurrentStmt1,
    firmDocuments.gstReturns1_firm,
    ...hlPropertyDocs.topup_equity,
  ],

  // ============================================================
  // PERSONAL LOAN — New (1 profile)
  // ============================================================

  // Personal Loan | New | Salaried | Indian Resident
  'personal_loan|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    incomeProofsSalaried.salaryAcctStmt6,
    incomeProofsSalaried.paySlips6,
    incomeProofsSalaried.companyID,
    incomeProofsSalaried.offerLetter,
    incomeProofsSalaried.form16_2y,
    existingLoanDocs.loanAcctStmt,
    propertyDocuments.propertyTax,
  ],

  // ============================================================
  // Business Loan — existing entries preserved
  // ============================================================

  // Business Loan | New | Salaried | Indian Resident
  'business_loan|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements,
    propertyDocuments.titleDeed,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.undertaking,
  ],

  // Business Loan | New | Non-Salaried | Indian Resident | Proprietor
  'business_loan|new|non_salaried|indian_resident|proprietor': [
    // Proprietor Business KYC
    bizProprietorPan,
    firmDocuments.udyamCert,
    firmDocuments.gstRegCert,
    firmDocuments.labourCert,
    // Proprietor Business Financials
    firmDocuments.proprietorCurrentStmt1,
    bizProprietorGstr3b,
    incomeProofsSelfEmployed.indITReturns3,
    bizBusinessPhotos,
    bizOfficeCurrentBill,
    // Individual KYC
    kycDocuments.aadhaar,
    bizCoApplicantPan,
    bizCoApplicantAadhaar,
    kycDocuments.addressProof,
    // Own House Proof
    bizOwnHouseProof,
    // Others
    kycDocuments.photo,
  ],

  // Business Loan | New | Non-Salaried | Indian Resident | Pvt Ltd
  'business_loan|new|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    incomeProofsNonSalaried.itReturns3,
    incomeProofsNonSalaried.bankStatements,
    businessDocuments.gstReturns,
    businessDocuments.gstRegistration,
    businessDocuments.moaAoa,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.cashFlow,
    financialDocuments.caStatement,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    propertyDocuments.titleDeed,
    legalDocuments.legalOpinion,
    legalDocuments.undertaking,
  ],

  // Business Loan | New | Non-Salaried | Indian Resident | Partnership
  'business_loan|new|non_salaried|indian_resident|partnership': [
    // Partnership Firm Business KYC
    firmDocuments.firmPan,
    firmDocuments.udyamCert,
    firmDocuments.gstRegCert,
    firmPartnershipDeed,
    firmRegistrationCert,
    // Partnership Firm Business Financials
    firmDocuments.firmCurrentStmt1,
    msmeDocuments.gstr3b1,
    firmDocuments.firmITReturns3,
    // Individual KYC (all partners)
    kycDocuments.pan,
    kycDocuments.aadhaar,
    kycDocuments.addressProof,
    // Others
    kycDocuments.photo,
  ],

  // ============================================================
  // ============================================================
  // MSME — PROFILES (simplified: no incomeSource/residentType)
  // Key format: msme|<loanStatus>|<businessType>
  // ============================================================

  // MSME | New | Partnership Firm
  // Uses: Section A (Overview) + B (Entity KYC) + C (Entity Financials) + D (KYC) + E (Financials) + F (Property)
  'msme|new|partnership': [
    // Section A - Project / Business Overview
    msmeDocuments.projectReport,
    msmeDocuments.companyProfile,
    msmeDocuments.cmaData,
    // Partnership Firm Business KYC
    firmDocuments.firmPan,
    firmDocuments.udyamCert,
    firmDocuments.gstRegCert,
    firmPartnershipDeed,
    firmRegistrationCert,
    // Partnership Firm Business Financials
    firmDocuments.firmCurrentStmt1,
    msmeDocuments.gstr3b1,
    existingLoanDocs.sanctionLetter,
    existingLoanDocs.loanAcctStmt,
    firmDocuments.firmITReturns3,
    // Individual KYC (all partners)
    kycDocuments.pan,
    kycDocuments.aadhaar,
    kycDocuments.addressProof,
    // Individual Financials (all partners)
    incomeProofsSelfEmployed.indSavingsStmt1,
    msmeDocuments.form26as3,
    msmePartnerSanctionLetter,
    msmePartnerLoanAcctStmt,
    incomeProofsSelfEmployed.indITReturns3_partners,
    // Property Documents
    msmeSaleDeed,
    msmeLinkDocs,
    msmePlanProceeding,
    msmePropertyTax,
    msmeCurrentBill,
    // Other Group Entity
    msmeGroupPan,
    msmeGroupUdyam,
    msmeGroupGst,
    msmeGroupPartnershipDeed,
    msmeGroupRegCert,
    msmeGroupCurrentStmt,
    msmeGroupGstr3b,
    msmeGroupLoanStmt,
    msmeGroupItReturns,
  ],

  // MSME | New | Proprietor
  'msme|new|proprietor': [
    // Section A - Project / Business Overview
    msmeDocuments.projectReport,
    msmeDocuments.companyProfile,
    msmeDocuments.cmaData,
    // Section D - Individual KYC
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    // Section E - Individual Financials (Proprietor)
    incomeProofsSelfEmployed.indITReturns3,
    incomeProofsSelfEmployed.indSavingsStmt1,
    msmeDocuments.form26as3,
    firmDocuments.proprietorCurrentStmt1,
    firmDocuments.latestProvisional,
    firmDocuments.gstRegCert,
    firmDocuments.udyamCert,
    // Existing loans
    ...msmeExistingLoans,
    // Section F - Property Documents
    ...msmePropertyDocs,
  ],

  // MSME | New | Pvt Ltd
  'msme|new|pvt_ltd': [
    // Section A - Project / Business Overview
    msmeDocuments.projectReport,
    msmeDocuments.companyProfile,
    msmeDocuments.cmaData,
    // Section B - Entity KYC (Pvt Ltd)
    firmDocuments.firmPan,
    firmDocuments.udyamCert,
    firmDocuments.gstRegCert,
    firmDocuments.regCertAoaMoaPvt,
    // Section C - Entity Financials
    firmDocuments.companyCurrentStmt1,
    msmeDocuments.gstr3b1,
    firmDocuments.companyITReturns3,
    // Section D - Individual KYC (all directors)
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    // Section E - Individual Financials (all directors)
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    msmeDocuments.form26as3,
    // Existing loans
    ...msmeExistingLoans,
    // Section F - Property Documents
    ...msmePropertyDocs,
  ],

  // MSME | New | LLP
  'msme|new|llp': [
    // Section A - Project / Business Overview
    msmeDocuments.projectReport,
    msmeDocuments.companyProfile,
    msmeDocuments.cmaData,
    // Section B - Entity KYC (LLP)
    firmDocuments.firmPan,
    firmDocuments.udyamCert,
    firmDocuments.gstRegCert,
    firmDocuments.regCertAoaMoaLLP,
    // Section C - Entity Financials
    firmDocuments.llpCurrentStmt1,
    msmeDocuments.gstr3b1,
    firmDocuments.llpITReturns3,
    // Section D - Individual KYC (all designated partners)
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.addressProof,
    kycDocuments.photo,
    // Section E - Individual Financials (all partners)
    incomeProofsSelfEmployed.indITReturns3_directors,
    incomeProofsSelfEmployed.indSavingsStmt1,
    msmeDocuments.form26as3,
    // Existing loans
    ...msmeExistingLoans,
    // Section F - Property Documents
    ...msmePropertyDocs,
  ],
};

// ============ COMMON CHECKLIST - Applied to ALL loan types ============

// Financial Documents - as per user requirement
const commonFinancialDocs = {
  aadhaarAll: createChecklistItem('fin_aadhaar_all', 'Aadhar Card (All Director)', 'financial_documents'),
  panAll: createChecklistItem('fin_pan_all', 'Pan Card (All Director)', 'financial_documents'),
  presentAddress: createChecklistItem('fin_present_addr', 'Present Address Proof', 'financial_documents'),
  individualIT3: createChecklistItem('fin_ind_it3', 'Individual IT Returns (Last 3 years)', 'financial_documents'),
  individualSavings1: createChecklistItem('fin_ind_savings1', 'Individual Savings Account Statement (Last 1 year)', 'financial_documents'),
  firmIT3: createChecklistItem('fin_firm_it3', 'Firm IT Returns (Last 3 years)', 'financial_documents'),
  firmCurrent1: createChecklistItem('fin_firm_current1', 'Firm Current Account Statement (Last 1 year)', 'financial_documents'),
  latestProvisional: createChecklistItem('fin_latest_prov', 'Latest Provisional (if any)', 'financial_documents'),
  gstRegCert: createChecklistItem('fin_gst_reg', 'GST Registration Certificate', 'financial_documents'),
  gstReturns1: createChecklistItem('fin_gst_returns1', 'GST Returns (Last 1 year)', 'financial_documents'),
  udyamCert: createChecklistItem('fin_udyam', 'Udyam Registration Certificate', 'financial_documents'),
  regAoaMoa: createChecklistItem('fin_reg_aoa_moa', 'Registration Certificate, AOA, MOA (Pvt Ltd)', 'financial_documents'),
  loanSanction: createChecklistItem('fin_loan_sanction', 'Loan Sanction Letters (if any)', 'financial_documents'),
  loanStatements1: createChecklistItem('fin_loan_stmt1', 'Loan Account Statements Last 1 year (if any)', 'financial_documents'),
};

// Legal Documents - as per user requirement
const commonLegalDocs = {
  saleDeed: createChecklistItem('legal_sale_deed', 'Sale Deed', 'legal_documents'),
  linkDocs: createChecklistItem('legal_link_docs', 'Link Documents', 'legal_documents'),
  propertyTax: createChecklistItem('legal_prop_tax', 'Property Tax', 'legal_documents'),
  planProceeding: createChecklistItem('legal_plan_proceeding', 'Plan and Proceeding Copy', 'legal_documents'),
  currentBill: createChecklistItem('legal_current_bill', 'Current Bill', 'legal_documents'),
};

// Others - as per user requirement
const commonOthers = {
  photos3: createChecklistItem('others_photos3', '3 Photos', 'others'),
};

// Common checklist for all loan types
export const COMMON_CHECKLIST: ChecklistItem[] = [
  // FINANCIAL DOCUMENTS section
  commonFinancialDocs.aadhaarAll,
  commonFinancialDocs.panAll,
  commonFinancialDocs.presentAddress,
  commonFinancialDocs.individualIT3,
  commonFinancialDocs.individualSavings1,
  commonFinancialDocs.firmIT3,
  commonFinancialDocs.firmCurrent1,
  commonFinancialDocs.latestProvisional,
  commonFinancialDocs.gstRegCert,
  commonFinancialDocs.gstReturns1,
  commonFinancialDocs.udyamCert,
  commonFinancialDocs.regAoaMoa,
  commonFinancialDocs.loanSanction,
  commonFinancialDocs.loanStatements1,
  // LEGAL DOCUMENTS section
  commonLegalDocs.saleDeed,
  commonLegalDocs.linkDocs,
  commonLegalDocs.propertyTax,
  commonLegalDocs.planProceeding,
  commonLegalDocs.currentBill,
  // OTHERS section
  commonOthers.photos3,
];

// Export all checklists for reference
export const ALL_CHECKLIST_COMBINATIONS = Object.keys(DECISION_TREE);
