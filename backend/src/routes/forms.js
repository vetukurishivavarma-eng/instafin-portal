import express from 'express';
import path from 'path';
import fs from 'fs';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

// Directory for storing uploaded form files
const formsDir = path.join(process.cwd(), 'uploads', 'forms');
if (!fs.existsSync(formsDir)) {
  fs.mkdirSync(formsDir, { recursive: true });
}

// Helper: check if running in production (Supabase Storage mode)
const isProduction = () => process.env.NODE_ENV === 'production';

// Helper: get file storage path
const getFilePath = (fileName) => path.join(formsDir, fileName);

// Helper: sanitize filename for storage
const sanitizeFileName = (fileName) => {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
};

// All /api/forms routes require authentication
router.use(authenticate);

// GET /api/forms — Search forms by bank and/or loan type
router.get('/', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { bank, loan_type, active } = req.query;

    let query = supabase
      .from('application_forms')
      .select('*')
      .order('bank_name', { ascending: true })
      .order('loan_type', { ascending: true });

    // Filter by bank name
    if (bank) {
      query = query.ilike('bank_name', `%${bank}%`);
    }

    // Filter by loan type
    if (loan_type) {
      query = query.ilike('loan_type', `%${loan_type}%`);
    }

    // Filter by active status (default: show only active)
    if (active === 'all') {
      // Show all including inactive
    } else if (active === 'false') {
      query = query.eq('is_active', false);
    } else {
      query = query.eq('is_active', true);
    }

    const { data: forms, error } = await query;

    if (error) {
      // If table doesn't exist yet, return empty array gracefully
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [], total: 0 });
      }
      throw error;
    }

    res.json({
      data: forms || [],
      total: (forms || []).length
    });
  } catch (error) {
    console.error('Error fetching forms:', error);
    res.status(500).json({ error: 'Failed to fetch application forms' });
  }
});

// GET /api/forms/:id/download — Download form file
router.get('/:id/download', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: form, error } = await supabase
      .from('application_forms')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    if (!form.is_active) {
      return res.status(410).json({ error: 'The requested form is currently unavailable. Please contact administrator.' });
    }

    let fileBuffer;
    let contentType;

    if (isProduction()) {
      // Production: download from Supabase Storage
      try {
        const { data, error: storageError } = await supabase.storage
          .from('lead-documents')
          .download(form.file_path);

        if (storageError) {
          console.error('Storage download error:', storageError);
          return res.status(404).json({ error: 'The requested form file is currently unavailable. Please contact administrator.' });
        }

        if (data) {
          if (typeof data.arrayBuffer === 'function') {
            const arrayBuffer = await data.arrayBuffer();
            fileBuffer = Buffer.from(arrayBuffer);
          } else {
            fileBuffer = Buffer.from(data);
          }
        }
      } catch (storageErr) {
        console.error('Storage download failed:', storageErr);
        return res.status(500).json({ error: 'Failed to retrieve form file.' });
      }
    } else {
      // Development: read from local filesystem
      const filePath = getFilePath(form.file_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'The requested form file is currently unavailable. Please contact administrator.' });
      }
      fileBuffer = fs.readFileSync(filePath);
    }

    // Set content type based on file type
    const ext = path.extname(form.file_path).toLowerCase();
    switch (ext) {
      case '.pdf':
        contentType = 'application/pdf';
        break;
      case '.doc':
        contentType = 'application/msword';
        break;
      case '.docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Set headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(form.form_name)}${ext}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    // Audit log: record download activity
    try {
      await supabase
        .from('audit_logs')
        .insert({
          admin_id: req.user.id,
          admin_name: req.user.name || req.user.email,
          action: 'form_download',
          details: JSON.stringify({
            form_id: id,
            form_name: form.form_name,
            bank_name: form.bank_name,
            loan_type: form.loan_type,
            file_type: form.file_type,
            timestamp: new Date().toISOString()
          }),
          created_at: new Date().toISOString()
        });
    } catch (auditErr) {
      // Don't block download if audit logging fails
      console.warn('Failed to log download audit:', auditErr.message);
    }

    res.send(fileBuffer);
  } catch (error) {
    console.error('Error downloading form:', error);
    res.status(500).json({ error: 'An unexpected error occurred. Please try again later.' });
  }
});

// POST /api/forms — Create a new form entry (admin only)
router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { bank_name, loan_type, form_name, file_type } = req.body;

    if (!bank_name || !loan_type || !form_name) {
      return res.status(400).json({ error: 'Bank name, loan type, and form name are required' });
    }

    // Handle file upload - file comes as multipart or base64 in body
    let file_path = null;
    let finalFileType = file_type || 'pdf';

    if (req.body.file_data) {
      // File provided as base64 data
      const ext = finalFileType === 'docx' ? '.docx' : finalFileType === 'doc' ? '.doc' : '.pdf';
      const fileName = `${sanitizeFileName(form_name)}_${Date.now()}${ext}`;
      const fileBuffer = Buffer.from(req.body.file_data, 'base64');

      if (isProduction()) {
        // Production: upload to Supabase Storage
        const storagePath = `forms/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('lead-documents')
          .upload(storagePath, fileBuffer, {
            contentType: finalFileType === 'pdf' ? 'application/pdf' : 'application/msword',
            upsert: true
          });

        if (uploadError) throw uploadError;
        file_path = storagePath;
      } else {
        // Development: save to local filesystem
        const filePath = getFilePath(fileName);
        fs.writeFileSync(filePath, fileBuffer);
        file_path = fileName;
      }
    } else if (req.body.file_path) {
      // File path provided directly (for linking to existing files)
      file_path = req.body.file_path;
    } else {
      return res.status(400).json({ error: 'File data or file path is required' });
    }

    const { data: newForm, error } = await supabase
      .from('application_forms')
      .insert({
        bank_name,
        loan_type,
        form_name,
        file_path,
        file_type: finalFileType,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Form added successfully',
      form: newForm
    });
  } catch (error) {
    console.error('Error creating form:', error);
    res.status(500).json({ error: 'Failed to add form' });
  }
});

// PUT /api/forms/:id — Update form details (admin only)
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { bank_name, loan_type, form_name, file_type, is_active } = req.body;

    // Build update object with only provided fields
    const updateData = {};
    if (bank_name !== undefined) updateData.bank_name = bank_name;
    if (loan_type !== undefined) updateData.loan_type = loan_type;
    if (form_name !== undefined) updateData.form_name = form_name;
    if (file_type !== undefined) updateData.file_type = file_type;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    // Handle file replacement if new file data is provided
    if (req.body.file_data) {
      const ext = (file_type || 'pdf') === 'docx' ? '.docx' : (file_type || 'pdf') === 'doc' ? '.doc' : '.pdf';
      const fileName = `${sanitizeFileName(form_name || 'form')}_${Date.now()}${ext}`;
      const fileBuffer = Buffer.from(req.body.file_data, 'base64');

      if (isProduction()) {
        const storagePath = `forms/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('lead-documents')
          .upload(storagePath, fileBuffer, {
            contentType: (file_type || 'pdf') === 'pdf' ? 'application/pdf' : 'application/msword',
            upsert: true
          });
        if (uploadError) throw uploadError;
        updateData.file_path = storagePath;
      } else {
        const filePath = getFilePath(fileName);
        fs.writeFileSync(filePath, fileBuffer);
        updateData.file_path = fileName;
      }
    }

    const { data: updatedForm, error } = await supabase
      .from('application_forms')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Form updated successfully',
      form: updatedForm
    });
  } catch (error) {
    console.error('Error updating form:', error);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// DELETE /api/forms/:id — Soft-delete (disable) a form (admin only)
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existingForm } = await supabase
      .from('application_forms')
      .select('is_active')
      .eq('id', id)
      .single();

    if (!existingForm) {
      return res.status(404).json({ error: 'Form not found' });
    }

    // Toggle is_active (soft delete/restore)
    const newActive = existingForm.is_active === false ? true : false;

    const { data: updatedForm, error } = await supabase
      .from('application_forms')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: newActive ? 'Form restored successfully' : 'Form disabled successfully',
      form: updatedForm
    });
  } catch (error) {
    console.error('Error toggling form status:', error);
    res.status(500).json({ error: 'Failed to update form status' });
  }
});

// GET /api/forms/loan-types — Get distinct loan types from forms
router.get('/loan-types/list', authorize('admin', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: forms, error } = await supabase
      .from('application_forms')
      .select('loan_type')
      .eq('is_active', true);

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json([]);
      }
      throw error;
    }

    const loanTypes = [...new Set((forms || []).map(f => f.loan_type))].sort();
    res.json({ data: loanTypes });
  } catch (error) {
    console.error('Error fetching loan types:', error);
    res.status(500).json({ error: 'Failed to fetch loan types' });
  }
});

export default router;
