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

// KYC Documents - Common across all loan types
const kycDocuments = {
  aadhaar: createChecklistItem('kyc_aadhaar', 'Aadhaar Card', 'kyc'),
  pan: createChecklistItem('kyc_pan', 'PAN Card', 'kyc'),
  passport: createChecklistItem('kyc_passport', 'Passport (Valid)', 'kyc'),
  voterId: createChecklistItem('kyc_voter', 'Voter ID', 'kyc'),
  drivingLicense: createChecklistItem('kyc_dl', 'Driving License', 'kyc'),
  photo: createChecklistItem('kyc_photo', 'Passport Size Photo (2 nos)', 'kyc'),
  nriPassport: createChecklistItem('kyc_nri_passport', 'NRI Passport with Valid Visa', 'kyc'),
  poa: createChecklistItem('kyc_poa', 'Power of Attorney (if applicable)', 'kyc'),
  overseasAddress: createChecklistItem('kyc_overseas_addr', 'Overseas Address Proof', 'kyc'),
};

// Income Proofs - Salaried
const incomeProofsSalaried = {
  salarySlips: createChecklistItem('inc_salary_slips', 'Salary Slips (Last 3 Months)', 'income_proof'),
  salarySlips6: createChecklistItem('inc_salary_slips_6', 'Salary Slips (Last 6 Months)', 'income_proof'),
  form16: createChecklistItem('inc_form16', 'Form 16 (Latest)', 'income_proof'),
  itReturns: createChecklistItem('inc_it_returns', 'IT Returns (Last 2 Years)', 'income_proof'),
  bankStatements: createChecklistItem('inc_bank_stmt', 'Bank Statements (Last 6 Months)', 'income_proof'),
  bankStatements12: createChecklistItem('inc_bank_stmt_12', 'Bank Statements (Last 12 Months)', 'income_proof'),
  employmentLetter: createChecklistItem('inc_emp_letter', 'Employment Letter / Appointment Letter', 'income_proof'),
  companyId: createChecklistItem('inc_company_id', 'Company ID Card', 'income_proof'),
};

// Income Proofs - Non-Salaried
const incomeProofsNonSalaried = {
  itReturns: createChecklistItem('inc_it_returns', 'IT Returns (Last 2 Years)', 'income_proof'),
  itReturns3: createChecklistItem('inc_it_returns_3', 'IT Returns (Last 3 Years)', 'income_proof'),
  auditReport: createChecklistItem('inc_audit_report', 'Audit Report (Latest)', 'income_proof'),
  bankStatements: createChecklistItem('inc_bank_stmt', 'Bank Statements (Last 12 Months)', 'income_proof'),
  bankStatements6: createChecklistItem('inc_bank_stmt_6', 'Bank Statements (Last 6 Months)', 'income_proof'),
  incomeCertificate: createChecklistItem('inc_income_cert', 'Income Certificate', 'income_proof'),
};

// Business Documents
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

// Property Documents - for Home Loan and LAP
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

// Financial Documents
const financialDocuments = {
  caStatement: createChecklistItem('fin_ca_stmt', 'CA Statement / Certified Financial Statement', 'financial_documents'),
  balanceSheet: createChecklistItem('fin_balance_sheet', 'Balance Sheet (Last 2 Years)', 'financial_documents'),
  profitLoss: createChecklistItem('fin_pnl', 'Profit & Loss Statement (Last 2 Years)', 'financial_documents'),
  cashFlow: createChecklistItem('fin_cashflow', 'Cash Flow Statement', 'financial_documents'),
  creditReport: createChecklistItem('fin_credit_report', 'Credit Report (CIBIL / Experian)', 'financial_documents'),
  existingLoans: createChecklistItem('fin_existing_loans', 'Existing Loan Sanction Letters & Statements', 'financial_documents'),
  securityDocuments: createChecklistItem('fin_security', 'Security Documents (if any)', 'financial_documents'),
};

// Legal Documents
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

// Decision tree: loanType|loanStatus|incomeSource|residentType|businessType?
export const DECISION_TREE: DecisionTree = {
  // ============ HOME LOAN ============

  // Home Loan | New | Salaried | NRI
  'home_loan|new|salaried|nri': [
    kycDocuments.pan,
    kycDocuments.aadhaar,
    kycDocuments.nriPassport,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips6,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements12,
    incomeProofsSalaried.employmentLetter,
    propertyDocuments.titleDeed,
    propertyDocuments.saleAgreement,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.paymentReceipts,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
    legalDocuments.societyNoc,
  ],

  // Home Loan | New | Salaried | Indian Resident
  'home_loan|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements,
    propertyDocuments.titleDeed,
    propertyDocuments.saleAgreement,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.propertyTax,
    propertyDocuments.khata,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
  ],

  // Home Loan | New | Non-Salaried | Indian Resident | Proprietor
  'home_loan|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsNonSalaried.itReturns3,
    incomeProofsNonSalaried.auditReport,
    incomeProofsNonSalaried.bankStatements,
    businessDocuments.gstReturns,
    businessDocuments.udyamAadhaar,
    propertyDocuments.titleDeed,
    propertyDocuments.saleAgreement,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.propertyTax,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
  ],

  // Home Loan | New | Non-Salaried | Indian Resident | Pvt Ltd
  'home_loan|new|non_salaried|indian_resident|pvt_ltd': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsNonSalaried.itReturns3,
    incomeProofsNonSalaried.bankStatements,
    businessDocuments.gstReturns,
    businessDocuments.gstRegistration,
    businessDocuments.moaAoa,
    propertyDocuments.titleDeed,
    propertyDocuments.saleAgreement,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.propertyTax,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.cashFlow,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
  ],

  // ============ LAP (Loan Against Property) ============

  // LAP | New | Salaried | NRI
  'lap|new|salaried|nri': [
    kycDocuments.pan,
    kycDocuments.aadhaar,
    kycDocuments.nriPassport,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips6,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements12,
    incomeProofsSalaried.employmentLetter,
    propertyDocuments.titleDeed,
    propertyDocuments.registeredSale,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.completionCert,
    propertyDocuments.propertyTax,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
    legalDocuments.noc,
  ],

  // LAP | New | Salaried | Indian Resident
  'lap|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements,
    propertyDocuments.titleDeed,
    propertyDocuments.registeredSale,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.completionCert,
    propertyDocuments.occupancyCert,
    propertyDocuments.propertyTax,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
    legalDocuments.noc,
  ],

  // ============ Business Loan ============

  // Business Loan | New | Salaried | Indian Resident
  'business_loan|new|salaried|indian_resident': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsSalaried.salarySlips,
    incomeProofsSalaried.form16,
    incomeProofsSalaried.itReturns,
    incomeProofsSalaried.bankStatements,
    propertyDocuments.titleDeed, // If providing property as collateral
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.undertaking,
  ],

  // Business Loan | New | Non-Salaried | Indian Resident | Proprietor
  'business_loan|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsNonSalaried.itReturns,
    incomeProofsNonSalaried.bankStatements,
    businessDocuments.gstReturns,
    businessDocuments.udyamAadhaar,
    businessDocuments.shopAct,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.auditReport,
    financialDocuments.caStatement,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    propertyDocuments.titleDeed,
    legalDocuments.legalOpinion,
    legalDocuments.undertaking,
  ],

  // ============ MSME / Mudra ============

  // MSME | Mudra | New | Non-Salaried | Indian Resident | Proprietor
  'msme|mudra|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    kycDocuments.voterId,
    incomeProofsNonSalaried.itReturns,
    incomeProofsNonSalaried.bankStatements6,
    businessDocuments.udyamAadhaar,
    businessDocuments.gstRegistration,
    businessDocuments.shopAct,
    businessDocuments.tradelicense,
    businessDocuments.msmeCert,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.undertaking,
  ],

  // ============ Additional common combinations ============

  // LAP | New | Non-Salaried | Indian Resident | Proprietor
  'lap|new|non_salaried|indian_resident|proprietor': [
    kycDocuments.aadhaar,
    kycDocuments.pan,
    kycDocuments.photo,
    incomeProofsNonSalaried.itReturns3,
    incomeProofsNonSalaried.bankStatements,
    businessDocuments.gstReturns,
    businessDocuments.udyamAadhaar,
    propertyDocuments.titleDeed,
    propertyDocuments.registeredSale,
    propertyDocuments.encumbrance,
    propertyDocuments.approvalPlan,
    propertyDocuments.propertyTax,
    financialDocuments.balanceSheet,
    financialDocuments.profitLoss,
    financialDocuments.creditReport,
    financialDocuments.existingLoans,
    legalDocuments.legalOpinion,
    legalDocuments.noc,
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
};

// Export all checklists for reference
export const ALL_CHECKLIST_COMBINATIONS = Object.keys(DECISION_TREE);