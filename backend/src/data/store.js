import { v4 as uuidv4 } from 'uuid';

// In-memory store (replace with database in production)
export const leads = [
  {
    id: '1',
    customerName: 'Ravi Kumar',
    mobile: '9876543210',
    loanType: 'Business Loan',
    expectedAmount: '35 Lakhs',
    assignedBanks: ['SBI'],
    status: 'Processing',
    assignedTo: 'Suresh',
    department: 'Operations Team',
    priority: 'High',
    followUp: '2026-05-12',
    createdAt: '2026-05-01',
  },
  {
    id: '2',
    customerName: 'Anil Reddy',
    mobile: '9876543211',
    loanType: 'Home Loan',
    expectedAmount: '62 Lakhs',
    assignedBanks: ['PNB'],
    status: 'Sanctioned',
    assignedTo: 'Lakshmi',
    department: 'Login Team',
    priority: 'Medium',
    followUp: '2026-05-14',
    createdAt: '2026-04-28',
  },
  {
    id: '3',
    customerName: 'Sai Enterprises',
    mobile: '9876543212',
    loanType: 'MSME Loan',
    expectedAmount: '1.2 Cr',
    assignedBanks: ['Union Bank'],
    status: 'New',
    assignedTo: 'Kiran',
    department: 'Sales Team',
    priority: 'High',
    followUp: '2026-05-11',
    createdAt: '2026-05-05',
  },
];

export const executives = [
  { id: '1', name: 'Suresh', department: 'Operations Team' },
  { id: '2', name: 'Lakshmi', department: 'Login Team' },
  { id: '3', name: 'Kiran', department: 'Sales Team' },
  { id: '4', name: 'Ravi', department: 'Credit Coordination' },
  { id: '5', name: 'Harish', department: 'Operations Team' },
];

export const bankProducts = [
  {
    bank: "State Bank of India (SBI)",
    forms: [
      "SBI Home Loan Application Form.pdf",
      "SBI LAP Application Form.pdf",
      "SBI Mudra Loan Application Form.pdf",
      "SBI MSME Loan Application Form.pdf",
      "SBI Business Loan Application Form.pdf",
      "SBI Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Punjab National Bank (PNB)",
    forms: [
      "PNB Home Loan Application Form.pdf",
      "PNB LAP Application Form.pdf",
      "PNB Mudra Loan Application Form.pdf",
      "PNB MSME Loan Application Form.pdf",
      "PNB Business Loan Application Form.pdf",
      "PNB Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Bank of India (BOI)",
    forms: [
      "BOI Home Loan Application Form.pdf",
      "BOI LAP Application Form.pdf",
      "BOI Mudra Loan Application Form.pdf",
      "BOI MSME Loan Application Form.pdf",
      "BOI Business Loan Application Form.pdf",
      "BOI Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Indian Bank",
    forms: [
      "Indian Bank Home Loan Application Form.pdf",
      "Indian Bank LAP Application Form.pdf",
      "Indian Bank Mudra Loan Application Form.pdf",
      "Indian Bank MSME Loan Application Form.pdf",
      "Indian Bank Business Loan Application Form.pdf",
      "Indian Bank Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Union Bank of India",
    forms: [
      "Union Bank Home Loan Application Form.pdf",
      "Union Bank LAP Application Form.pdf",
      "Union Bank Mudra Loan Application Form.pdf",
      "Union Bank MSME Loan Application Form.pdf",
      "Union Bank Business Loan Application Form.pdf",
      "Union Bank Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Canara Bank",
    forms: [
      "Canara Home Loan Application Form.pdf",
      "Canara LAP Application Form.pdf",
      "Canara Mudra Loan Application Form.pdf",
      "Canara MSME Loan Application Form.pdf",
      "Canara Business Loan Application Form.pdf",
      "Canara Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Bank of Baroda",
    forms: [
      "BOB Home Loan Application Form.pdf",
      "BOB LAP Application Form.pdf",
      "BOB Mudra Loan Application Form.pdf",
      "BOB MSME Loan Application Form.pdf",
      "BOB Business Loan Application Form.pdf",
      "BOB Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Central Bank of India",
    forms: [
      "Central Bank Home Loan Application Form.pdf",
      "Central Bank LAP Application Form.pdf",
      "Central Bank Mudra Loan Application Form.pdf",
      "Central Bank MSME Loan Application Form.pdf",
      "Central Bank Business Loan Application Form.pdf",
      "Central Bank Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "UCO Bank",
    forms: [
      "UCO Home Loan Application Form.pdf",
      "UCO LAP Application Form.pdf",
      "UCO Mudra Loan Application Form.pdf",
      "UCO MSME Loan Application Form.pdf",
      "UCO Business Loan Application Form.pdf",
      "UCO Personal Loan Application Form.pdf",
    ],
  },
];

export const privateBankProducts = [
  {
    bank: "HDFC Bank",
    forms: [
      "HDFC Home Loan Application Form.pdf",
      "HDFC LAP Application Form.pdf",
      "HDFC Business Loan Application Form.pdf",
      "HDFC Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "ICICI Bank",
    forms: [
      "ICICI Home Loan Application Form.pdf",
      "ICICI LAP Application Form.pdf",
      "ICICI Business Loan Application Form.pdf",
      "ICICI Personal Loan Application Form.pdf",
    ],
  },
  {
    bank: "Axis Bank",
    forms: [
      "Axis Home Loan Application Form.pdf",
      "Axis LAP Application Form.pdf",
      "Axis Business Loan Application Form.pdf",
      "Axis Personal Loan Application Form.pdf",
    ],
  },
];

export const nbfcProducts = [
  {
    bank: "Bajaj Finserv",
    forms: [
      "Bajaj Home Loan Application Form.pdf",
      "Bajaj LAP Application Form.pdf",
      "Bajaj Business Loan Application Form.pdf",
    ],
  },
  {
    bank: "Tata Capital",
    forms: [
      "Tata Capital Home Loan Application Form.pdf",
      "Tata Capital LAP Application Form.pdf",
      "Tata Capital Business Loan Application Form.pdf",
    ],
  },
  {
    bank: "Sundaram Finance",
    forms: [
      "Sundaram Home Loan Application Form.pdf",
      "Sundaram LAP Application Form.pdf",
      "Sundaram Business Loan Application Form.pdf",
    ],
  },
];

export const dynamicChecklists = {
  "State Bank of India (SBI)-Home Loan": [
    "Aadhaar Card",
    "PAN Card",
    "Salary Slips - 3 Months",
    "Bank Statements - 6 Months",
    "Form 16 / IT Returns",
    "Property Documents",
  ],
  "State Bank of India (SBI)-LAP": [
    "Aadhaar Card",
    "PAN Card",
    "Business Proof",
    "GST Returns",
    "Bank Statements - 12 Months",
    "Property Documents",
  ],
  "HDFC Bank-Personal Loan": [
    "Aadhaar Card",
    "PAN Card",
    "Salary Slips",
    "Bank Statements",
    "Employee ID Card",
  ],
  "Bajaj Finserv-Business Loan": [
    "KYC Documents",
    "GST Returns",
    "IT Returns",
    "Business Registration",
    "Bank Statements",
  ],
};

export const sanctions = [];
export const revenues = [];

// Document Types by Loan Type
export const documentTypes = {
  "Home Loan": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "Salary Slips - 3 Months", category: "Income", required: true },
    { name: "Bank Statements - 6 Months", category: "Income", required: true },
    { name: "Form 16", category: "Income", required: true },
    { name: "Property Documents", category: "Property", required: true },
    { name: "Passport Size Photo", category: "ID", required: false },
  ],
  "LAP": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "Business Proof", category: "Business", required: true },
    { name: "GST Returns", category: "Business", required: true },
    { name: "Bank Statements - 12 Months", category: "Income", required: true },
    { name: "Property Documents", category: "Property", required: true },
    { name: "Business Registration", category: "Business", required: false },
  ],
  "Mudra Loan": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "Business Registration", category: "Business", required: true },
    { name: "Shop Act", category: "Business", required: true },
    { name: "Bank Statements - 6 Months", category: "Income", required: true },
    { name: "Passport Size Photo", category: "ID", required: false },
    { name: "Address Proof", category: "ID", required: false },
  ],
  "MSME Loan": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "GST Certificate", category: "Business", required: true },
    { name: "Udyam Registration", category: "Business", required: true },
    { name: "Bank Statements - 6 Months", category: "Income", required: true },
    { name: "Business Proof", category: "Business", required: false },
  ],
  "Business Loan": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "Business Proof", category: "Business", required: true },
    { name: "ITR - 2 Years", category: "Income", required: true },
    { name: "Balance Sheet", category: "Business", required: true },
    { name: "Bank Statements - 12 Months", category: "Income", required: true },
    { name: "GST Returns", category: "Business", required: false },
  ],
  "Personal Loan": [
    { name: "Aadhaar Card", category: "ID", required: true },
    { name: "PAN Card", category: "ID", required: true },
    { name: "Salary Slips - 3 Months", category: "Income", required: true },
    { name: "Bank Statements - 6 Months", category: "Income", required: true },
    { name: "Passport Size Photo", category: "ID", required: true },
    { name: "Form 16", category: "Income", required: false },
  ],
};

// Lead Documents - Uploaded documents for leads
export const leadDocuments = [];
