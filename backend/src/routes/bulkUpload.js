import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Helper to parse remarks containing co-applicant data
const parseRemarksField = (remarksStr) => {
  if (!remarksStr) return { coapplicant: null, remarks: "" };
  try {
    const parsed = JSON.parse(remarksStr);
    if (parsed && typeof parsed === 'object' && ('coapplicant' in parsed || 'hasCoapplicant' in parsed)) {
      const coapplicant = parsed.coapplicant || {
        hasCoapplicant: parsed.hasCoapplicant || false,
        name: parsed.coapplicantName || "",
        incomeSource: parsed.coapplicantIncomeSource || "salaried"
      };
      return {
        coapplicant,
        remarks: parsed.remarks || ""
      };
    }
  } catch (e) {
    // Normal string remarks
  }
  return { coapplicant: null, remarks: remarksStr };
};

// Helper to serialize remarks containing co-applicant data
const serializeRemarksField = (coapplicant, remarks) => {
  if (!coapplicant || !coapplicant.hasCoapplicant) return remarks || "";
  return JSON.stringify({
    coapplicant,
    remarks: remarks || ""
  });
};

const uploadsDir = process.cwd();
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `bulk-upload-${Date.now()}.xlsx`)
});

const upload = multer({ storage, fileFilter: (req, file, cb) => {
  if (file.originalname.match(/\.(xlsx|xls)$/)) cb(null, true);
  else cb(new Error('Only Excel files allowed'));
}});

router.use(authenticate);

// Map Excel headers to DB columns
const columnMapping = {
  'customerName': 'customer_name',
  'customer_name': 'customer_name',
  'Customer Name': 'customer_name',
  'CUSTOMER NAME': 'customer_name',
  'Customer_name': 'customer_name',
  'mobile': 'mobile',
  'Mobile': 'mobile',
  'Mobile No': 'mobile',
  'MOBILE NO': 'mobile',
  'MOBILE': 'mobile',
  'email': 'email',
  'Email': 'email',
  'EMAIL': 'email',
  'loanType': 'loan_type',
  'loan_type': 'loan_type',
  'Loan Type': 'loan_type',
  'LOAN TYPE': 'loan_type',
  'expectedAmount': 'expected_amount',
  'expected_amount': 'expected_amount',
  'Expected Amount': 'expected_amount',
  'EXPECTED AMOUNT': 'expected_amount',
  'status': 'status',
  'Status': 'status',
  'STATUS': 'status',
  'loanStatus': 'loan_status',
  'loan_status': 'loan_status',
  'Loan Status': 'loan_status',
  'LOAN STATUS': 'loan_status',
  'incomeSource': 'income_source',
  'income_source': 'income_source',
  'Income Source': 'income_source',
  'INCOME SOURCE': 'income_source',
  'residentType': 'resident_type',
  'resident_type': 'resident_type',
  'Resident Type': 'resident_type',
  'RESIDENT TYPE': 'resident_type',
  'businessType': 'business_type',
  'business_type': 'business_type',
  'Business Type': 'business_type',
  'BUSINESS TYPE': 'business_type',
  'referralCode': 'referral_code',
  'referral_code': 'referral_code',
  'Referral Code': 'referral_code',
  'REFERRAL CODE': 'referral_code',
  'assignedTo': 'assigned_to',
  'assigned_to': 'assigned_to',
  'Assigned To': 'assigned_to',
  'ASSIGNED TO': 'assigned_to',
  'department': 'department',
  'Department': 'department',
  'DEPARTMENT': 'department',
  'priority': 'priority',
  'Priority': 'priority',
  'PRIORITY': 'priority',
  'followUp': 'follow_up',
  'follow_up': 'follow_up',
  'Follow Up': 'follow_up',
  'FOLLOW UP': 'follow_up',
  'remarks': 'remarks',
  'Remarks': 'remarks',
  'REMARKS': 'remarks',
  'Co-applicant (Y/N)': 'has_coapplicant',
  'Co-applicant': 'has_coapplicant',
  'Coapplicant': 'has_coapplicant',
  'CoApplicant Name': 'coapplicant_name',
  'Co-Applicant Name': 'coapplicant_name',
  'Coapplicant Name': 'coapplicant_name',
  'CoApplicant Income Source': 'coapplicant_income_source',
  'Co-Applicant Income Source': 'coapplicant_income_source',
  'Coapplicant Income Source': 'coapplicant_income_source',
  'Income source': 'coapplicant_income_source'
};

// Preview bulk upload - analyze data without saving
router.post('/preview', authorize('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!data.length) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Get Excel headers (columns)
    const excelHeaders = Object.keys(data[0]);
    console.log('Excel headers:', excelHeaders);

    // Get current DB table columns
    const { data: sampleLead } = await supabase
      .from('leads')
      .select('*')
      .limit(1)
      .single();

    const dbColumns = sampleLead ? Object.keys(sampleLead) : [];
    console.log('DB columns:', dbColumns);

    // Find new columns that don't exist in DB
    const newColumns = [];
    const mappedColumns = {};

    for (const header of excelHeaders) {
      const mapped = columnMapping[header];
      if (mapped) {
        mappedColumns[header] = mapped;
      } else {
        // Check if it's a new column (not in mapping)
        const lowerHeader = header.toLowerCase().replace(/[\s_]/g, '');
        const dbLower = dbColumns.map(c => c.toLowerCase().replace(/_/g, ''));

        if (!dbLower.includes(lowerHeader)) {
          newColumns.push(header);
        } else {
          // Map unmatched but existing columns
          const existingCol = dbColumns.find(c =>
            c.toLowerCase().replace(/_/g, '') === lowerHeader
          );
          if (existingCol) {
            mappedColumns[header] = existingCol;
          }
        }
      }
    }

    console.log('Mapped columns:', mappedColumns);
    console.log('New columns to add:', newColumns);

    // Analyze each row
    const newLeads = [];
    const existingLeads = [];
    const changes = [];

    console.log('Data rows:', JSON.stringify(data, null, 2));

    for (const row of data) {
      const mobile = row.mobile || row.Mobile || row['Mobile No'] || row['MOBILE NO'] || row.MOBILE;
      console.log('Processing row with mobile:', mobile);

      if (!mobile) {
        console.log('Skipping row - no mobile');
        continue;
      }

      // Check if lead exists
      const { data: existing } = await supabase
        .from('leads')
        .select('*')
        .eq('mobile', mobile.toString())
        .single();

      console.log('Existing lead found:', existing ? existing.id : 'none');

      if (!existing) {
        // New lead
        newLeads.push(row);
      } else {
        // Check for changes
        const rowChanges = {};
        let hasChanges = false;

        for (const [excelCol, dbCol] of Object.entries(mappedColumns)) {
          const excelValue = row[excelCol];
          const dbValue = existing[dbCol];

          // Compare values (handle different types)
          const excelStr = String(excelValue || '').trim();
          const dbStr = String(dbValue || '').trim();

          if (excelStr !== dbStr && excelStr !== '') {
            rowChanges[dbCol] = {
              old: dbValue,
              new: excelValue
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          changes.push({
            leadId: existing.id,
            mobile: mobile,
            customerName: row.customerName || row.Customer_Name || row['Customer Name'] || row['CUSTOMER NAME'] || existing.customer_name,
            changes: rowChanges
          });
        }

        existingLeads.push({ ...row, _id: existing.id });
      }
    }

    // Clean up uploaded file
    const fs = await import('fs');
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      newColumns,
      newLeadsCount: newLeads.length,
      newLeads: newLeads.slice(0, 100), // Limit to 100 for processing
      existingLeadsCount: existingLeads.length,
      changedLeadsCount: changes.length,
      changedLeads: changes.slice(0, 50), // Limit to 50 for preview
      totalChanges: changes.length,
      sampleNewLead: newLeads[0] || null
    });

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ error: 'Failed to process file: ' + error.message });
  }
});

// Process bulk upload - actually save data
router.post('/process', authorize('admin'), async (req, res) => {
  try {
    const {
      newLeads,
      changedLeads,
      newColumns
    } = req.body;

    // Whitelist of known/allowed columns in the leads table
    const ALLOWED_COLUMNS = [
      'customer_name', 'mobile', 'email', 'loan_type', 'loan_status',
      'expected_amount', 'income_source', 'resident_type', 'business_type',
      'referral_code', 'assigned_to', 'department', 'priority', 'follow_up',
      'remarks', 'status', 'assigned_banks', 'sanctioned_amount', 'disbursed_amount',
      'created_at', 'updated_at',
    ];

    // Add new columns to DB if any
    if (newColumns && newColumns.length > 0) {
      for (const col of newColumns) {
        const dbColName = col.toLowerCase().replace(/[\s]+/g, '_');

        // Only allow creating columns from the whitelist
        if (!ALLOWED_COLUMNS.includes(dbColName)) {
          console.warn(`Skipping disallowed column: ${dbColName}`);
          continue;
        }

        // Check if column already exists
        try {
          await supabase.rpc('exec_sql', {
            sql: `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${dbColName} TEXT`
          }).catch(() => {}); // Ignore if RPC doesn't exist
        } catch (e) {
          console.log('Column may already exist:', dbColName);
        }
      }
    }

    const results = {
      inserted: 0,
      updated: 0,
      errors: []
    };

    // Insert new leads
    if (newLeads && newLeads.length > 0) {
      for (const lead of newLeads) {
        try {
          const insertData = {};

          // Map fields using columnMapping for consistent header handling
          const fieldMap = {
            customer_name: ['customerName', 'customer_name', 'Customer Name', 'CUSTOMER NAME'],
            mobile: ['mobile', 'Mobile', 'Mobile No', 'MOBILE NO', 'MOBILE'],
            email: ['email', 'Email', 'EMAIL'],
            loan_type: ['loanType', 'loan_type', 'Loan Type', 'LOAN TYPE'],
            expected_amount: ['expectedAmount', 'expected_amount', 'Expected Amount', 'EXPECTED AMOUNT'],
            loan_status: ['loanStatus', 'loan_status', 'Loan Status', 'LOAN STATUS'],
            income_source: ['incomeSource', 'income_source', 'Income Source', 'INCOME SOURCE'],
            resident_type: ['residentType', 'resident_type', 'Resident Type', 'RESIDENT TYPE'],
            business_type: ['businessType', 'business_type', 'Business Type', 'BUSINESS TYPE'],
            referral_code: ['referralCode', 'referral_code', 'Referral Code', 'REFERRAL CODE']
          };
          // Normalize enum values to match decision tree keys
          const normalizeEnum = (val) => {
            if (!val) return val;
            return val.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          };
          const enumFields = ['loan_type', 'loan_status', 'income_source', 'resident_type', 'business_type'];
          for (const [dbCol, variants] of Object.entries(fieldMap)) {
            const value = variants.map(v => lead[v]).find(v => v != null && v !== '');
            if (value != null && value !== '') {
              insertData[dbCol] = dbCol === 'mobile' ? value.toString() : (enumFields.includes(dbCol) ? normalizeEnum(value) : value);
            }
          }
          // Parse co-applicant details from Excel row
          const coapplicantYN = lead['Co-applicant (Y/N)'] || lead['Co-applicant'] || lead['Coapplicant (Y/N)'] || lead['Coapplicant'] || lead['co_applicant'] || lead['has_coapplicant'];
          const hasCo = (coapplicantYN === 'Y' || coapplicantYN === 'y' || coapplicantYN === true || coapplicantYN === 'Yes' || coapplicantYN === 'yes');

          let coData = null;
          if (hasCo) {
            const coName = lead['CoApplicant Name'] || lead['Co-Applicant Name'] || lead['Coapplicant Name'] || lead['coapplicant_name'];
            const coInc = lead['CoApplicant Income Source'] || lead['Co-Applicant Income Source'] || lead['Coapplicant Income Source'] || lead['coapplicant_income_source'] || lead['CoApplicant Income'] || lead['Income source'];
            coData = {
              hasCoapplicant: true,
              name: coName || '',
              incomeSource: coInc === 'Self employed' || coInc === 'self_employed' || coInc === 'Self Employed' || coInc === 'non_salaried' ? 'non_salaried' : 'salaried'
            };
          }

          const rawRemarks = lead['remarks'] || lead['Remarks'] || lead['REMARKS'] || '';
          insertData.remarks = serializeRemarksField(coData, rawRemarks);

          insertData.status = 'New';

          insertData.created_at = new Date().toISOString();

          console.log('Inserting lead:', insertData);

          const { error } = await supabase.from('leads').insert(insertData);

          console.log('Insert result:', error);

          if (error) {
            results.errors.push({ lead: insertData.customer_name || insertData.mobile, error: error.message });
          } else {
            results.inserted++;
          }
        } catch (e) {
          results.errors.push({ lead: insertData?.customer_name || lead.mobile, error: e.message });
        }
      }
    }

    // Update changed leads
    if (changedLeads && changedLeads.length > 0) {
      for (const change of changedLeads) {
        try {
          const updateData = {};

          let coapplicantChanged = false;
          let newHasCo = null;
          let newCoName = null;
          let newCoInc = null;
          let rawRemarks = null;

          for (const [field, values] of Object.entries(change.changes)) {
            if (field === 'has_coapplicant') {
              coapplicantChanged = true;
              newHasCo = (values.new === 'Y' || values.new === 'y' || values.new === true || values.new === 'Yes' || values.new === 'yes');
            } else if (field === 'coapplicant_name') {
              coapplicantChanged = true;
              newCoName = values.new;
            } else if (field === 'coapplicant_income_source') {
              coapplicantChanged = true;
              newCoInc = values.new === 'Self employed' || values.new === 'self_employed' || values.new === 'Self Employed' || values.new === 'non_salaried' ? 'non_salaried' : 'salaried';
            } else if (field === 'remarks') {
              rawRemarks = values.new;
              updateData[field] = values.new;
            } else {
              updateData[field] = values.new;
            }
          }

          if (coapplicantChanged || rawRemarks !== null) {
            // We need to fetch existing remarks to merge
            const { data: leadRecord } = await supabase
              .from('leads')
              .select('remarks')
              .eq('id', change.leadId)
              .single();

            const { coapplicant: existingCo, remarks: existingRemarks } = parseRemarksField(leadRecord?.remarks);
            
            const hasCo = newHasCo !== null ? newHasCo : (existingCo?.hasCoapplicant || false);
            const coName = newCoName !== null ? newCoName : (existingCo?.name || "");
            const coInc = newCoInc !== null ? newCoInc : (existingCo?.incomeSource || "salaried");
            const finalRemarks = rawRemarks !== null ? rawRemarks : existingRemarks;

            const coData = hasCo ? {
              hasCoapplicant: true,
              name: coName,
              incomeSource: coInc
            } : null;

            updateData.remarks = serializeRemarksField(coData, finalRemarks);
          }

          const { error } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', change.leadId);

          if (error) {
            results.errors.push({ lead: change.customerName, error: error.message });
          } else {
            results.updated++;
          }
        } catch (e) {
          results.errors.push({ lead: change.customerName, error: e.message });
        }
      }
    }

    res.json({
      success: true,
      ...results,
      message: `Successfully inserted ${results.inserted} new leads and updated ${results.updated} existing leads`
    });

  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({ error: 'Failed to process upload: ' + error.message });
  }
});

export default router;