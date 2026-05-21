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