/**
 * PDF generation for Loan Checklist using @react-pdf/renderer
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  PDFDownloadLink,
  Image,
} from '@react-pdf/renderer';
import type { ChecklistItem, Selection } from '../checklist-spec';

// Register fonts for PDF - using built-in fonts
// For custom fonts, use Font.register()

// Define PDF styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.5,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2563eb',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
  },
  selections: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 8,
    backgroundColor: '#eff6ff',
    padding: 8,
    borderRadius: 4,
  },
  item: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    width: 15,
    color: '#64748b',
  },
  itemText: {
    flex: 1,
    color: '#334155',
  },
  required: {
    color: '#dc2626',
    marginLeft: 4,
  },
  optional: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  emptyMessage: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    padding: 40,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 9,
    color: '#94a3b8',
  },
  pageNumber: {
    fontSize: 9,
    color: '#94a3b8',
  },
  summary: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  summaryText: {
    fontSize: 10,
    color: '#475569',
  },
});

// Category labels mapping
const categoryLabels: Record<string, string> = {
  kyc: 'KYC Documents',
  income_proof: 'Income Proof',
  business_documents: 'Business Documents',
  property_documents: 'Property Documents',
  financial_documents: 'Financial Documents',
  legal_documents: 'Legal Documents',
};

// Loan type labels
const loanTypeLabels: Record<string, string> = {
  home_loan: 'Home Loan',
  lap: 'Loan Against Property (LAP)',
  mudra: 'Mudra Loan',
  msme: 'MSME Loan',
  business_loan: 'Business Loan',
  personal_loan: 'Personal Loan',
  education_loan: 'Education Loan',
};

// Loan status labels
const loanStatusLabels: Record<string, string> = {
  new: 'New Loan',
  topup_equity: 'Top-up/Equity',
  takeover: 'Takeover',
};

// Income source labels
const incomeSourceLabels: Record<string, string> = {
  salaried: 'Salaried',
  non_salaried: 'Non-Salaried',
};

// Resident type labels
const residentTypeLabels: Record<string, string> = {
  nri: 'NRI',
  indian_resident: 'Indian Resident',
};

// Business type labels
const businessTypeLabels: Record<string, string> = {
  proprietor: 'Proprietorship',
  partnership: 'Partnership',
  pvt_ltd: 'Private Limited',
  llp: 'LLP',
};

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get selection summary string
 */
function getSelectionSummary(selection: Selection): string {
  const parts: string[] = [];

  parts.push(loanTypeLabels[selection.loanType] || selection.loanType);

  if (selection.loanStatus) {
    parts.push(loanStatusLabels[selection.loanStatus] || selection.loanStatus);
  }

  if (selection.incomeSource) {
    parts.push(incomeSourceLabels[selection.incomeSource] || selection.incomeSource);
  }

  if (selection.residentType) {
    parts.push(residentTypeLabels[selection.residentType] || selection.residentType);
  }

  if (selection.businessType) {
    parts.push(businessTypeLabels[selection.businessType] || selection.businessType);
  }

  return parts.join(' | ');
}

/**
 * Group checklist items by category
 */
function groupByCategory(items: ChecklistItem[]): Record<string, ChecklistItem[]> {
  const grouped: Record<string, ChecklistItem[]> = {};

  items.forEach((item) => {
    const category = item.category;
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(item);
  });

  return grouped;
}

// PDF Document Component
interface ChecklistPDFProps {
  selection: Selection;
  items: ChecklistItem[];
}

const ChecklistPDF: React.FC<ChecklistPDFProps> = ({ selection, items }) => {
  const generatedDate = formatDate(new Date());
  const selectionSummary = getSelectionSummary(selection);

  // Handle empty checklist case
  if (items.length === 0) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>Loan Checklist</Text>
            <Text style={styles.subtitle}>{selectionSummary}</Text>
          </View>

          <View>
            <Text style={styles.emptyMessage}>
              No documents are required for the selected loan type.
              Please complete all selections to see the required documents.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Generated on {generatedDate}</Text>
            <Text style={styles.pageNumber}>InstaFin Portal</Text>
          </View>
        </Page>
      </Document>
    );
  }

  // Group items by category
  const groupedItems = groupByCategory(items);

  // Define category order for consistent display
  const categoryOrder = [
    'kyc',
    'income_proof',
    'business_documents',
    'property_documents',
    'financial_documents',
    'legal_documents',
  ];

  // Count required items
  const requiredCount = items.filter((item) => item.required).length;
  const optionalCount = items.filter((item) => !item.required).length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Loan Checklist</Text>
          <Text style={styles.subtitle}>{loanTypeLabels[selection.loanType] || selection.loanType}</Text>
          <Text style={styles.selections}>{selectionSummary}</Text>

          {/* Summary */}
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              Total Documents: {items.length} ({requiredCount} required, {optionalCount} optional)
            </Text>
          </View>
        </View>

        {/* Category Sections */}
        {categoryOrder.map((category) => {
          const categoryItems = groupedItems[category];
          if (!categoryItems || categoryItems.length === 0) {
            return null;
          }

          return (
            <View key={category} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {categoryLabels[category] || category} ({categoryItems.length})
              </Text>
              {categoryItems.map((item) => (
                <View key={item.id} style={styles.item}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.itemText}>{item.name}</Text>
                  {item.required && <Text style={styles.required}>*</Text>}
                  {!item.required && <Text style={styles.optional}>(Optional)</Text>}
                </View>
              ))}
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated on {generatedDate}</Text>
          <Text style={styles.pageNumber}>InstaFin Portal</Text>
        </View>
      </Page>
    </Document>
  );
};

// Export PDF component for use with PDFDownloadLink
export { ChecklistPDF };

// PDF Download Link Component Props
interface PDFExportLinkProps {
  selection: Selection;
  items: ChecklistItem[];
  filename?: string;
  children: React.ReactNode;
}

export const PDFExportLink: React.FC<PDFExportLinkProps> = ({
  selection,
  items,
  filename = 'loan-checklist.pdf',
  children,
}) => {
  return (
    <PDFDownloadLink
      document={<ChecklistPDF selection={selection} items={items} />}
      fileName={filename}
      style={{ textDecoration: 'none' }}
    >
      {({ loading }) => (loading ? 'Preparing PDF...' : children)}
    </PDFDownloadLink>
  );
};

/**
 * Generate and download PDF directly (alternative to PDFDownloadLink)
 */
export async function downloadPDF(
  selection: Selection,
  items: ChecklistItem[]
): Promise<void> {
  // Dynamic import to avoid SSR issues
  const { pdf } = await import('@react-pdf/renderer');

  const blob = await pdf(<ChecklistPDF selection={selection} items={items} />).toBlob();

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `loan-checklist-${selection.loanType}-${formatDate(new Date()).replace(/\//g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// Eligibility Report PDF
// ============================================================

interface EligibilityData {
  applicantName: string;
  loanType: string;
  mobile: string;
  pf: number;
  incomeTax: number;
  professionTax: number;
  totalDeductions: number;
  grossSalary: number;
  netSalary: number;
  rentalIncome: number;
  netIncome: number;
  emiNmiPercent: number;
  bankEmis: { bank: string; emi: number }[];
  totalExistingEmis: number;
  emiAvailable: number;
  principal: number;
  rate: number;
  period: number;
  emiPerLac: number;
  eligibleAmount: number;
}

const eligStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.5 },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#2563eb', paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#475569', marginBottom: 2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#2563eb', marginBottom: 6, backgroundColor: '#eff6ff', padding: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, paddingLeft: 8 },
  rowLabel: { color: '#475569' },
  rowValue: { color: '#1e293b', fontWeight: 'bold' },
  divider: { borderBottomWidth: 0.5, borderBottomColor: '#e2e8f0', marginVertical: 8 },
  eligibleBox: { marginTop: 10, padding: 16, borderRadius: 8, alignItems: 'center' },
  eligibleYes: { backgroundColor: '#dbeafe' },
  eligibleNo: { backgroundColor: '#fee2e2' },
  eligibleLabel: { fontSize: 10, color: '#475569', marginBottom: 4 },
  eligibleAmountYes: { fontSize: 28, fontWeight: 'bold', color: '#1d4ed8' },
  eligibleAmountNo: { fontSize: 24, fontWeight: 'bold', color: '#dc2626' },
  eligibleNote: { fontSize: 9, color: '#dc2626', marginTop: 4 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 9, color: '#94a3b8' },
});

const EligibilityPDF: React.FC<{ data: EligibilityData }> = ({ data }) => {
  const isEligible = data.eligibleAmount > 0;
  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtDec = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Document>
      <Page size="A4" style={eligStyles.page}>
        <View style={eligStyles.header}>
          <Text style={eligStyles.title}>Eligibility Report</Text>
          <Text style={eligStyles.subtitle}>{data.applicantName} | {data.loanType} {data.mobile ? `| ${data.mobile}` : ''}</Text>
        </View>

        {/* Income */}
        <View style={eligStyles.section}>
          <Text style={eligStyles.sectionTitle}>Income Details</Text>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Gross Salary (Monthly)</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.grossSalary)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Proposed Rental Income</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.rentalIncome)}</Text>
          </View>
        </View>

        {/* Statutory Deductions */}
        <View style={eligStyles.section}>
          <Text style={eligStyles.sectionTitle}>Statutory Deductions</Text>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Provident Fund</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.pf)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Income Tax</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.incomeTax)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Profession Tax</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.professionTax)}</Text>
          </View>
          <View style={eligStyles.divider} />
          <View style={eligStyles.row}>
            <Text style={{ ...eligStyles.rowLabel, fontWeight: 'bold' }}>Total Deductions</Text>
            <Text style={eligStyles.rowValue}>{fmtDec(data.totalDeductions)}</Text>
          </View>
        </View>

        {/* Net Income */}
        <View style={eligStyles.section}>
          <Text style={eligStyles.sectionTitle}>Net Income</Text>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Net Salary</Text>
            <Text style={eligStyles.rowValue}>{fmtDec(data.netSalary)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Rental Income</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.rentalIncome)}</Text>
          </View>
          <View style={eligStyles.divider} />
          <View style={eligStyles.row}>
            <Text style={{ ...eligStyles.rowLabel, fontWeight: 'bold' }}>Net Income</Text>
            <Text style={{ ...eligStyles.rowValue, color: '#16a34a' }}>{fmtDec(data.netIncome)}</Text>
          </View>
        </View>

        {/* EMI Details */}
        <View style={eligStyles.section}>
          <Text style={eligStyles.sectionTitle}>EMI Details</Text>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>EMI/NMI % (as per NAI)</Text>
            <Text style={eligStyles.rowValue}>{data.emiNmiPercent}%</Text>
          </View>
          {data.bankEmis.filter(b => b.bank || b.emi > 0).map((b, i) => (
            <View key={i} style={eligStyles.row}>
              <Text style={eligStyles.rowLabel}>{b.bank || `Bank ${i + 1}`}</Text>
              <Text style={eligStyles.rowValue}>{fmt(b.emi)}</Text>
            </View>
          ))}
          <View style={eligStyles.divider} />
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Total Existing EMIs</Text>
            <Text style={eligStyles.rowValue}>{fmtDec(data.totalExistingEmis)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={{ ...eligStyles.rowLabel, fontWeight: 'bold' }}>EMI Available (approx.)</Text>
            <Text style={{ ...eligStyles.rowValue, color: data.emiAvailable < 0 ? '#dc2626' : '#1e293b' }}>{fmtDec(data.emiAvailable)}</Text>
          </View>
        </View>

        {/* Loan Parameters */}
        <View style={eligStyles.section}>
          <Text style={eligStyles.sectionTitle}>Loan Parameters</Text>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Principal</Text>
            <Text style={eligStyles.rowValue}>{fmt(data.principal)}</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Rate</Text>
            <Text style={eligStyles.rowValue}>{data.rate}% p.a.</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>Period</Text>
            <Text style={eligStyles.rowValue}>{data.period} months</Text>
          </View>
          <View style={eligStyles.row}>
            <Text style={eligStyles.rowLabel}>EMI per LAC</Text>
            <Text style={eligStyles.rowValue}>{fmtDec(data.emiPerLac)}</Text>
          </View>
        </View>

        {/* Eligible Amount */}
        <View style={[eligStyles.eligibleBox, isEligible ? eligStyles.eligibleYes : eligStyles.eligibleNo]}>
          <Text style={eligStyles.eligibleLabel}>ELIGIBLE LOAN AMOUNT (as per Income)</Text>
          {isEligible ? (
            <Text style={eligStyles.eligibleAmountYes}>{fmt(Math.round(data.eligibleAmount))}</Text>
          ) : (
            <>
              <Text style={eligStyles.eligibleAmountNo}>NOT ELIGIBLE</Text>
              <Text style={eligStyles.eligibleNote}>Existing EMIs exceed available EMI capacity</Text>
            </>
          )}
        </View>

        <View style={eligStyles.footer} fixed>
          <Text style={eligStyles.footerText}>Generated on {formatDate(new Date())}</Text>
          <Text style={eligStyles.footerText}>InstaFin Portal</Text>
        </View>
      </Page>
    </Document>
  );
};

export async function downloadEligibilityPDF(data: EligibilityData): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(<EligibilityPDF data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `eligibility-report-${data.applicantName.replace(/\s+/g, '-')}-${formatDate(new Date()).replace(/\//g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// Underwriting Profile Report PDF
// ============================================================

export interface ExtractedDetails {
  full_name?: string;
  dob?: string;
  gender?: string;
  aadhaar_number?: string;
  pan_number?: string;
  address?: string;
}

interface UnderwritingProfilePDFProps {
  lead: {
    id: string;
    customerName: string;
    mobile?: string;
    email?: string;
    loanType?: string;
    expectedAmount?: number;
    status?: string;
    createdAt?: string;
  };
  details: ExtractedDetails;
  summary: string;
  photoUrl?: string; // Crop data url or raw url
}

const profileStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, lineHeight: 1.5, color: '#334155' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#312e81', // Premium indigo accent line
    paddingBottom: 12,
    marginBottom: 16,
  },
  headerTextContainer: { flex: 1 },
  confidentialTag: { fontSize: 8, fontWeight: 'bold', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.8 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#1e1b4b', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#475569' },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginLeft: 16,
  },
  avatar: { width: 64, height: 64 },
  avatarPlaceholder: { fontSize: 8, color: '#94a3b8', textAlign: 'center' },
  
  // Application Metadata Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  gridItem: {
    width: '33.33%',
    padding: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    borderRightWidth: 0.5,
    borderRightColor: '#cbd5e1',
  },
  gridLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', marginBottom: 1, fontWeight: 'bold' },
  gridValue: { fontSize: 8.5, fontWeight: 'bold', color: '#0f172a' },
  
  // Structured KYC Table
  table: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    minHeight: 22,
    alignItems: 'center',
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableCellLabel: {
    width: '30%',
    padding: 6,
    backgroundColor: '#f1f5f9',
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#475569',
    borderRightWidth: 0.5,
    borderRightColor: '#cbd5e1',
    textTransform: 'uppercase',
  },
  tableCellValue: { width: '70%', padding: 6, fontSize: 8.5, color: '#0f172a' },
  
  // Underwriter Content
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1e3a8a',
    backgroundColor: '#eff6ff',
    padding: 5,
    marginBottom: 6,
    borderRadius: 3,
    textTransform: 'uppercase',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  paragraph: { fontSize: 8.5, color: '#334155', marginBottom: 5, textAlign: 'justify', lineHeight: 1.4 },
  
  // Verification Box
  signatureContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  signatureBox: {
    width: '48%',
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  signatureTitle: { fontSize: 8, fontWeight: 'bold', color: '#1e3a8a', marginBottom: 12, textTransform: 'uppercase' },
  signatureLine: { borderBottomWidth: 0.5, borderBottomColor: '#94a3b8', marginTop: 20, marginBottom: 4 },
  signatureLabel: { fontSize: 7, color: '#64748b' },

  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 8, color: '#94a3b8' },
});

interface PDFSection {
  title: string;
  paragraphs: string[];
}

function cleanMarkdown(markdown: string): string {
  return markdown.replace(/```json[\s\S]*?```/g, '').trim();
}

function parseMarkdownToSections(markdown: string): PDFSection[] {
  const cleanText = cleanMarkdown(markdown);
  const sections: PDFSection[] = [];
  const lines = cleanText.split('\n');
  let currentSection: PDFSection | null = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('## ') || line.startsWith('# ')) {
      const title = line.replace(/^##?\s*/, '').trim();
      currentSection = { title, paragraphs: [] };
      sections.push(currentSection);
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      const bulletText = line.replace(/^[\*\-]\s*/, '').trim();
      const cleanedBullet = bulletText.replace(/\*\*/g, '');
      if (currentSection) {
        currentSection.paragraphs.push(`• ${cleanedBullet}`);
      } else {
        currentSection = { title: 'Overview', paragraphs: [`• ${cleanedBullet}`] };
        sections.push(currentSection);
      }
    } else {
      const cleanedLine = line.replace(/\*\*/g, '');
      if (currentSection) {
        currentSection.paragraphs.push(cleanedLine);
      } else {
        currentSection = { title: 'Overview', paragraphs: [cleanedLine] };
        sections.push(currentSection);
      }
    }
  }

  return sections;
}

const UnderwritingProfilePDF: React.FC<{
  lead: UnderwritingProfilePDFProps['lead'];
  details: ExtractedDetails;
  summary: string;
  photoUrl?: string;
}> = ({ lead, details, summary, photoUrl }) => {
  const generatedDate = formatDate(new Date());
  const sections = parseMarkdownToSections(summary);

  const fmtCurrency = (n?: number) => {
    if (!n) return 'N/A';
    return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  };

  return (
    <Document>
      <Page size="A4" style={profileStyles.page}>
        {/* Header Grid */}
        <View style={profileStyles.header}>
          <View style={profileStyles.headerTextContainer}>
            <Text style={profileStyles.confidentialTag}>STRICTLY CONFIDENTIAL • INTERNAL UNDERWRITING USE</Text>
            <Text style={profileStyles.title}>CREDIT RISK & LEAD SUMMARY PROFILE</Text>
            <Text style={profileStyles.subtitle}>Applicant: {lead.customerName} | Generated: {generatedDate}</Text>
          </View>
          <View style={profileStyles.avatarContainer}>
            {photoUrl ? (
              <Image src={photoUrl} style={profileStyles.avatar} />
            ) : (
              <Text style={profileStyles.avatarPlaceholder}>NO PHOTO{"\n"}EXTRACTED</Text>
            )}
          </View>
        </View>

        {/* Lead Metadata Grid */}
        <View style={profileStyles.grid}>
          <View style={profileStyles.gridItem}>
            <Text style={profileStyles.gridLabel}>Lead ID / Ref</Text>
            <Text style={profileStyles.gridValue}>{lead.id.substring(0, 8).toUpperCase()}</Text>
          </View>
          <View style={profileStyles.gridItem}>
            <Text style={profileStyles.gridLabel}>Loan Category</Text>
            <Text style={profileStyles.gridValue}>{lead.loanType || 'N/A'}</Text>
          </View>
          <View style={[profileStyles.gridItem, { borderRightWidth: 0 }]}>
            <Text style={profileStyles.gridLabel}>Requested Amount</Text>
            <Text style={profileStyles.gridValue}>{fmtCurrency(lead.expectedAmount)}</Text>
          </View>
          <View style={[profileStyles.gridItem, { borderBottomWidth: 0 }]}>
            <Text style={profileStyles.gridLabel}>Mobile Phone</Text>
            <Text style={profileStyles.gridValue}>{lead.mobile || 'N/A'}</Text>
          </View>
          <View style={[profileStyles.gridItem, { borderBottomWidth: 0 }]}>
            <Text style={profileStyles.gridLabel}>Email Address</Text>
            <Text style={profileStyles.gridValue}>{lead.email || 'N/A'}</Text>
          </View>
          <View style={[profileStyles.gridItem, { borderBottomWidth: 0, borderRightWidth: 0 }]}>
            <Text style={profileStyles.gridLabel}>System Status</Text>
            <Text style={profileStyles.gridValue}>{lead.status || 'Processing'}</Text>
          </View>
        </View>

        {/* Structured KYC Verification Table */}
        <View style={profileStyles.table}>
          <View style={profileStyles.tableRow}>
            <Text style={profileStyles.tableCellLabel}>Verified Full Name</Text>
            <Text style={profileStyles.tableCellValue}>{details.full_name || lead.customerName || 'N/A'}</Text>
          </View>
          <View style={profileStyles.tableRow}>
            <Text style={profileStyles.tableCellLabel}>Date of Birth / Gender</Text>
            <Text style={profileStyles.tableCellValue}>
              {details.dob || 'N/A'} {details.gender ? `(Gender: ${details.gender})` : ''}
            </Text>
          </View>
          <View style={profileStyles.tableRow}>
            <Text style={profileStyles.tableCellLabel}>Aadhaar Card Number</Text>
            <Text style={profileStyles.tableCellValue}>{details.aadhaar_number || 'N/A'}</Text>
          </View>
          <View style={profileStyles.tableRow}>
            <Text style={profileStyles.tableCellLabel}>PAN Card Number</Text>
            <Text style={profileStyles.tableCellValue}>{details.pan_number || 'N/A'}</Text>
          </View>
          <View style={[profileStyles.tableRow, profileStyles.tableRowLast]}>
            <Text style={profileStyles.tableCellLabel}>Permanent Address</Text>
            <Text style={profileStyles.tableCellValue}>{details.address || 'N/A'}</Text>
          </View>
        </View>

        {/* Render parsed markdown sections */}
        {sections.map((sec, idx) => (
          <View key={idx} style={profileStyles.section}>
            <Text style={profileStyles.sectionTitle}>{sec.title}</Text>
            {sec.paragraphs.map((p, pIdx) => (
              <Text key={pIdx} style={profileStyles.paragraph}>{p}</Text>
            ))}
          </View>
        ))}

        {/* Verification & Underwriter Sign-off */}
        <View style={profileStyles.signatureContainer}>
          <View style={profileStyles.signatureBox}>
            <Text style={profileStyles.signatureTitle}>Credit Officer Sign-off</Text>
            <View style={profileStyles.signatureLine} />
            <Text style={profileStyles.signatureLabel}>Signature & Date</Text>
          </View>
          <View style={profileStyles.signatureBox}>
            <Text style={profileStyles.signatureTitle}>Risk Assessor Verification</Text>
            <View style={profileStyles.signatureLine} />
            <Text style={profileStyles.signatureLabel}>System Verified Code: INSTA-AI-{lead.id.substring(0, 6).toUpperCase()}</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={profileStyles.footer} fixed>
          <Text style={profileStyles.footerText}>STRICTLY CONFIDENTIAL • InstaFin Underwriting System</Text>
          <Text style={profileStyles.footerText}>Page 1 of 1</Text>
        </View>
      </Page>
    </Document>
  );
};

export async function downloadProfilePDF(
  lead: UnderwritingProfilePDFProps['lead'],
  details: ExtractedDetails,
  summary: string,
  photoUrl?: string
): Promise<void> {
  const { pdf } = await import('@react-pdf/renderer');
  const blob = await pdf(
    <UnderwritingProfilePDF lead={lead} details={details} summary={summary} photoUrl={photoUrl} />
  ).toBlob();
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = lead.customerName.replace(/\s+/g, '-');
  link.download = `Underwriting-Report-${safeName}-${formatDate(new Date()).replace(/\//g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}