import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { parseCibilReport, generateCibilReport } from '../services/cibil.js';

const router = express.Router();

const cibilDir = path.join(process.cwd(), 'uploads', 'cibil');
if (!fs.existsSync(cibilDir)) {
  fs.mkdirSync(cibilDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, cibilDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload a PDF or image of the CIBIL report.'));
    }
  },
});

router.use(authenticate);

// Multer / file validation error handler — return clean JSON instead of HTML 500
router.use((err, req, res, next) => {
  if (err) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
    return res.status(status).json({ error: err.message || 'File upload failed' });
  }
  next();
});

// POST /api/cibil/upload — Upload a CIBIL report PDF and parse it with Gemini
router.post('/upload', authorize('admin', 'operations_head', 'executive'), upload.single('file'), async (req, res) => {
  try {
    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'CIBIL report file is required' });
    }

    // Verify the lead exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .single();

    if (!lead) {
      // Clean up the uploaded file since the lead doesn't exist
      const filePath = path.join(cibilDir, req.file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Read the file buffer and parse it with Gemini
    const filePath = path.join(cibilDir, req.file.filename);
    const fileBuffer = fs.readFileSync(filePath);

    let parsed;
    try {
      parsed = await parseCibilReport(fileBuffer, req.file.originalname);
    } catch (parseErr) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(422).json({ error: parseErr.message || 'Failed to parse CIBIL report' });
    }

    const cibilScore = parsed?.cibil_score && Number.isFinite(parsed.cibil_score)
      ? parsed.cibil_score
      : null;

    const { data: newReport, error: insertError } = await supabase
      .from('cibil_reports')
      .insert({
        lead_id: leadId,
        file_name: req.file.originalname,
        file_path: req.file.filename,
        report_data: parsed,
        cibil_score: cibilScore,
        parsed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ data: newReport });
  } catch (error) {
    console.error('CIBIL upload error:', error);
    // Clean up file on failure
    if (req.file?.filename) {
      const fp = path.join(cibilDir, req.file.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.status(500).json({ error: 'Failed to upload and parse CIBIL report' });
  }
});

// POST /api/cibil/generate — Generate an ESTIMATED credit profile from the lead's uploaded documents (no CIBIL PDF needed)
router.post('/generate', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ error: 'leadId is required' });
    }

    // Verify the lead exists
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Role-based access — executives/dsa may only generate for their own leads
    if (req.user.role !== 'admin' && req.user.role !== 'operations_head' && lead.assigned_to !== req.user.id) {
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', req.user.id)
        .maybeSingle();
      if (!userData?.name || lead.assigned_to !== userData.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Load the lead's uploaded documents
    const { data: uploads, error: uploadsErr } = await supabase
      .from('lead_checklist_status')
      .select('*')
      .eq('lead_id', leadId)
      .eq('status', 'uploaded');
    if (uploadsErr) throw uploadsErr;

    if (!uploads || uploads.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded for this lead. Upload documents in the Checklists page first.' });
    }

    const parsed = await generateCibilReport(lead, uploads);

    const cibilScore = parsed?.cibil_score && Number.isFinite(parsed.cibil_score)
      ? parsed.cibil_score
      : null;

    const { data: newReport, error: insertError } = await supabase
      .from('cibil_reports')
      .insert({
        lead_id: leadId,
        file_name: 'Generated from documents',
        file_path: null,
        report_data: parsed,
        cibil_score: cibilScore,
        parsed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ data: newReport });
  } catch (error) {
    console.error('CIBIL generate error:', error);
    const msg = error.message || '';
    if (msg.includes('No readable documents')) {
      return res.status(400).json({ error: msg });
    }
    if (msg.includes('Could not generate')) {
      return res.status(422).json({ error: msg });
    }
    res.status(500).json({ error: 'Failed to generate CIBIL report' });
  }
});

// GET /api/cibil/lead/:leadId/documents — List uploaded documents available for CIBIL generation
router.get('/lead/:leadId/documents', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;
    const { data, error } = await supabase
      .from('lead_checklist_status')
      .select('id, document_id, document_name, file_path')
      .eq('lead_id', leadId)
      .eq('status', 'uploaded');

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (error) {
    console.error('Error fetching documents for CIBIL generation:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// GET /api/cibil/lead/:leadId — Get all CIBIL reports for a lead (latest first)
router.get('/lead/:leadId', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data, error } = await supabase
      .from('cibil_reports')
      .select('*')
      .eq('lead_id', leadId)
      .order('parsed_at', { ascending: false });

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [] });
      }
      throw error;
    }

    res.json({ data: data || [] });
  } catch (error) {
    console.error('Error fetching CIBIL reports:', error);
    res.status(500).json({ error: 'Failed to fetch CIBIL reports' });
  }
});

// GET /api/cibil/:id — Get a single CIBIL report
router.get('/:id', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: report, error } = await supabase
      .from('cibil_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !report) {
      return res.status(404).json({ error: 'CIBIL report not found' });
    }

    res.json({ data: report });
  } catch (error) {
    console.error('Error fetching CIBIL report:', error);
    res.status(500).json({ error: 'Failed to fetch CIBIL report' });
  }
});

// GET /api/cibil/:id/file — Download the original uploaded CIBIL report file
router.get('/:id/file', authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: report, error } = await supabase
      .from('cibil_reports')
      .select('file_path, file_name')
      .eq('id', req.params.id)
      .single();

    if (error || !report || !report.file_path) {
      return res.status(404).json({ error: 'CIBIL report file not found' });
    }

    const filePath = path.join(cibilDir, report.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'CIBIL report file not found on disk' });
    }

    res.download(filePath, report.file_name || 'cibil-report');
  } catch (error) {
    console.error('Error downloading CIBIL report file:', error);
    res.status(500).json({ error: 'Failed to download CIBIL report file' });
  }
});

// DELETE /api/cibil/:id — Delete a CIBIL report and its file
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { data: report } = await supabase
      .from('cibil_reports')
      .select('file_path')
      .eq('id', req.params.id)
      .single();

    if (report?.file_path) {
      const filePath = path.join(cibilDir, report.file_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const { error } = await supabase
      .from('cibil_reports')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'CIBIL report deleted successfully' });
  } catch (error) {
    console.error('Error deleting CIBIL report:', error);
    res.status(500).json({ error: 'Failed to delete CIBIL report' });
  }
});

export default router;
