import express from 'express';
import { ZipArchive } from 'archiver';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

const uploadsDir = path.join(process.cwd(), 'uploads');

// Map document_id prefixes to category folders for the ZIP / grouping
// Matches the category keys used across the checklist UI
const CATEGORY_PREFIX_MAP = [
  { prefix: 'kyc_', key: 'kyc', label: 'KYC Documents' },
  { prefix: 'inc_', key: 'income_proof', label: 'Income Proof' },
  { prefix: 'biz_', key: 'business_documents', label: 'Business Documents' },
  { prefix: 'msme_', key: 'business_documents', label: 'Business Documents' },
  { prefix: 'firm_', key: 'business_documents', label: 'Business Documents' },
  { prefix: 'prop_', key: 'property_documents', label: 'Property Documents' },
  { prefix: 'fin_', key: 'financial_documents', label: 'Financial Documents' },
  { prefix: 'legal_', key: 'legal_documents', label: 'Legal Documents' },
  { prefix: 'loan_', key: 'financial_documents', label: 'Existing Loan Documents' },
  { prefix: 'sanction_', key: 'sanction_letters', label: 'Sanction Letters' },
  { prefix: 'other_docs', key: 'others', label: 'Other Documents' },
];

const FALLBACK_LABEL = 'Other Documents';

function getCategoryFromDocumentId(documentId) {
  if (!documentId) return { key: 'others', label: FALLBACK_LABEL };
  for (const entry of CATEGORY_PREFIX_MAP) {
    if (documentId.startsWith(entry.prefix)) {
      return { key: entry.key, label: entry.label };
    }
  }
  return { key: 'others', label: FALLBACK_LABEL };
}

// Parse document_name JSON (same logic as checklistStatus.js)
function parseDocName(docName) {
  if (!docName) return { name: '', description: '', originalFile: '' };
  try {
    const parsed = JSON.parse(docName);
    return {
      name: parsed.name || '',
      description: parsed.description || '',
      originalFile: parsed.originalFile || parsed.file || '',
    };
  } catch {
    return { name: docName, description: '', originalFile: '' };
  }
}

// Load a file's bytes from local disk (dev) or Supabase Storage (production)
async function getFileBuffer(record) {
  if (!record || !record.file_path) return null;

  if (process.env.NODE_ENV === 'production') {
    try {
      const { data, error } = await supabase.storage
        .from('lead-documents')
        .download(record.file_path);
      if (error) throw error;
      const buffer = Buffer.from(await data.arrayBuffer());
      return { buffer, exists: true };
    } catch (err) {
      console.warn('Storage download failed, trying local fallback:', err.message);
      // fall through to local disk
    }
  }

  // Dev / local file (filename may include a sub-path like summaries/...)
  const localPath = path.join(uploadsDir, record.file_path);
  if (fs.existsSync(localPath)) {
    return { buffer: fs.readFileSync(localPath), exists: true };
  }
  return { buffer: null, exists: false };
}

// Sanitize a filename for safe ZIP entry names
function sanitizeName(name, fallback) {
  let safe = String(name || fallback || 'document')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!safe) safe = 'document';
  return safe;
}

router.use(authenticate);

// GET /api/archives/leads - All leads (irrespective of status) with their uploaded documents grouped by category
// Role-based: admin & operations_head see all leads; executives/dsa see only their assigned leads
router.get('/leads', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    let query = supabase.from('leads').select('*', { count: 'exact' });

    // Non-admin role-based filtering
    if (!['admin', 'operations_head'].includes(req.user.role)) {
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();

      if (userData?.name) {
        query = query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${userData.name}`);
      } else {
        query = query.eq('assigned_to', req.user.id);
      }
    }

    // Optional search filter
    if (req.query.search) {
      query = query.or(`customer_name.ilike.%${req.query.search}%,mobile.ilike.%${req.query.search}%`);
    }

    query = query.order('created_at', { ascending: false });

    const { data: leads, error } = await query;
    if (error) throw error;

    const leadList = leads || [];

    // Resolve assigned_to UUIDs to names
    const execIds = [...new Set(leadList.filter(l => l.assigned_to && l.assigned_to.length > 20).map(l => l.assigned_to))];
    let nameMap = {};
    if (execIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', execIds);
      if (users) users.forEach(u => (nameMap[u.id] = u.name));
    }

    // Fetch all uploaded documents for these leads
    const leadIds = leadList.map(l => l.id);
    let docsByLead = {};
    if (leadIds.length > 0) {
      const { data: docs, error: docsErr } = await supabase
        .from('lead_checklist_status')
        .select('*')
        .in('lead_id', leadIds)
        .eq('status', 'uploaded')
        .order('uploaded_at', { ascending: false });

      if (docsErr) throw docsErr;

      (docs || []).forEach(d => {
        if (!docsByLead[d.lead_id]) docsByLead[d.lead_id] = [];
        const parsed = parseDocName(d.document_name);
        const cat = getCategoryFromDocumentId(d.document_id);
        docsByLead[d.lead_id].push({
          id: d.id,
          documentId: d.document_id,
          documentName: parsed.name || parsed.originalFile || 'Document',
          description: parsed.description,
          originalFile: parsed.originalFile,
          category: cat.key,
          categoryLabel: cat.label,
          uploadedAt: d.uploaded_at,
        });
      });
    }

    const result = leadList.map(lead => ({
      id: lead.id,
      customerName: lead.customer_name,
      mobile: lead.mobile,
      loanType: lead.loan_type,
      status: lead.status,
      isActive: lead.is_active !== false,
      isClosed: lead.is_closed === true,
      assignedTo: nameMap[lead.assigned_to] || lead.assigned_to,
      entryDate: lead.entry_date,
      createdAt: lead.created_at,
      documents: docsByLead[lead.id] || [],
    }));

    res.json({ data: result });
  } catch (error) {
    console.error('Archives list error:', error);
    res.status(500).json({ error: 'Failed to fetch lead archives' });
  }
});

// GET /api/archives/leads/:leadId/zip - Download all documents for a lead as a ZIP organized by section folders
router.get('/leads/:leadId/zip', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: lead } = await supabase
      .from('leads')
      .select('id, customer_name, assigned_to')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access check for non-admin/ops-head users
    if (!['admin', 'operations_head'].includes(req.user.role)) {
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();
      const leadAssigned = lead.assigned_to;
      if (leadAssigned !== req.user.id && leadAssigned !== userData?.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { data: docs, error: docsErr } = await supabase
      .from('lead_checklist_status')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'uploaded')
      .order('uploaded_at', { ascending: true });

    if (docsErr) throw docsErr;

    if (!docs || docs.length === 0) {
      return res.status(400).json({ error: 'No uploaded documents for this lead' });
    }

    // Pre-load all file buffers BEFORE setting headers so we can respond cleanly
    // with an error if no files are actually available on disk.
    const entries = [];
    const usedNames = new Set();

    for (const doc of docs) {
      const fileData = await getFileBuffer(doc);
      if (!fileData || !fileData.exists) {
        console.warn(`[ARCHIVES] Skipping missing file for doc ${doc.id} (${doc.file_path})`);
        continue;
      }

      const parsed = parseDocName(doc.document_name);
      const cat = getCategoryFromDocumentId(doc.document_id);
      const folder = sanitizeName(cat.label, FALLBACK_LABEL);

      // Prefer original filename, fall back to document name, ensure uniqueness
      let base = parsed.originalFile || parsed.name || `document-${doc.id}`;
      base = sanitizeName(base, `document-${doc.id}`);
      let entryName = `${folder}/${base}`;
      let counter = 1;
      while (usedNames.has(entryName.toLowerCase())) {
        const ext = path.extname(base);
        const stem = path.basename(base, ext);
        entryName = `${folder}/${stem}-${counter}${ext}`;
        counter++;
      }
      usedNames.add(entryName.toLowerCase());

      entries.push({ buffer: fileData.buffer, name: entryName });
    }

    if (entries.length === 0) {
      return res.status(404).json({ error: 'No downloadable documents found for this lead' });
    }

    const customerSafe = sanitizeName(lead.customer_name, 'Lead');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${customerSafe}-documents.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('Archive error:', err.message);
      try { res.status(500).end(); } catch (e) { /* headers may already be sent */ }
    });

    archive.pipe(res);
    entries.forEach(entry => archive.append(entry.buffer, { name: entry.name }));
    await archive.finalize();
  } catch (error) {
    console.error('ZIP download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP' });
    }
  }
});

export default router;
