import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { sendApprovalEmail, sendRejectionEmail, testEmailConnection } from '../services/email.service.js';
import { sendApprovalWhatsApp, sendRejectionWhatsApp } from '../services/whatsapp.service.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'instafin-dev-secret-2024';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'dsa' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const validRoles = ['admin', 'executive', 'dsa'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ name, email, password: passwordHash, role })
      .select()
      .single();

    if (error) throw error;

    const { accessToken, refreshToken } = generateTokens(newUser);

    const userResponse = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
    res.status(201).json({ user: userResponse, accessToken, refreshToken });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    const userResponse = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: userResponse, accessToken, refreshToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.id)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user);
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/request-access (for signup modal - executive registration)
router.post('/request-access', async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check if user already exists in users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'This email is already registered' });
    }

    // Check if there's already a pending request
    const { data: existingRequest } = await supabase
      .from('access_requests')
      .select('id, status')
      .eq('email', email)
      .single();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ error: 'You already have a pending request. Please wait for admin approval.' });
      }
      // If rejected, update the existing request instead of creating a new one
      if (existingRequest.status === 'rejected') {
        const passwordHash = await bcrypt.hash(password, 10);
        const { error: updateError } = await supabase
          .from('access_requests')
          .update({ name, password: passwordHash, mobile, status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', existingRequest.id);

        if (updateError) throw updateError;
        return res.status(201).json({ message: 'Access request re-submitted. Admin will review it.' });
      }
    }

    // Hash the password before storing
    const passwordHash = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from('access_requests')
      .insert({ name, email, password: passwordHash, mobile, status: 'pending' });

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Email already has a pending request' });
      }
      throw error;
    }

    res.status(201).json({ message: 'Access request submitted. Admin will review it.' });
  } catch (error) {
    console.error('Access request error:', error);
    res.status(500).json({ error: 'Failed to submit access request' });
  }
});

// GET /api/auth/pending-requests (admin only)
router.get('/pending-requests', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('access_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(requests || []);
  } catch (error) {
    console.error('Fetch pending requests error:', error);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// GET /api/auth/all-requests (admin only - all requests including history)
router.get('/all-requests', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(requests || []);
  } catch (error) {
    console.error('Fetch all requests error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// POST /api/auth/test-email (admin only - test SMTP configuration)
router.post('/test-email', authenticate, authorize('admin'), async (req, res) => {
  console.log('[AUTH] 🧪 Admin testing email configuration');
  try {
    // Use provided email or fall back to admin's email
    const targetEmail = req.body.email || req.user.email;
    console.log(`[AUTH] 🧪 Sending test email to: ${targetEmail}`);
    const result = await testEmailConnection({ email: targetEmail });
    console.log('[AUTH] 🧪 Test email result:', JSON.stringify(result));
    res.json(result);
  } catch (error) {
    console.error('[AUTH] 🧪 Test email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/auth/approve-request/:id (admin only)
router.post('/approve-request/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[AUTH] ✅ Admin approving access request ID=${id} by admin user ID=${req.user.id}`);

    // Fetch the access request
    const { data: request, error: fetchError } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      console.log(`[AUTH] ❌ Access request ID=${id} not found`);
      return res.status(404).json({ error: 'Access request not found' });
    }

    console.log(`[AUTH] Found request: name=${request.name} email=${request.email} status=${request.status}`);

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Check if user already exists in users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', request.email)
      .single();

    if (existingUser) {
      console.log(`[AUTH] User ${request.email} already exists - just marking approved`);
      // User already exists - just mark request as approved
      await supabase
        .from('access_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString(), reviewed_by: req.user.id })
        .eq('id', id);

      // Also ensure they exist in executives table
      console.log(`[AUTH] Ensuring ${request.name} exists in executives table...`);
      const { data: existingExec } = await supabase
        .from('executives')
        .select('id')
        .eq('name', request.name)
        .maybeSingle();

      if (!existingExec) {
        const { error: execInsertError } = await supabase
          .from('executives')
          .insert({ name: request.name, department: 'executive', active: true });
        if (execInsertError) {
          console.error('[AUTH] ⚠️ Failed to insert into executives table:', execInsertError.message);
        } else {
          console.log('[AUTH] ✅ Executive added to executives table');
        }
      } else {
        console.log('[AUTH] Executive already in executives table');
      }

      // Send notifications
      console.log(`[AUTH] Sending approval email to ${request.email}...`);
      const emailResult = await sendApprovalEmail({ name: request.name, email: request.email });
      console.log(`[AUTH] Email result:`, JSON.stringify(emailResult));

      console.log(`[AUTH] Sending WhatsApp to ${request.mobile}...`);
      const whatsappResult = await sendApprovalWhatsApp({ name: request.name, email: request.email, mobile: request.mobile });
      console.log(`[AUTH] WhatsApp result:`, JSON.stringify(whatsappResult));

      return res.json({
        message: 'Request approved. User already existed.',
        emailSent: emailResult.success,
        emailError: emailResult.error || null,
        whatsappSent: whatsappResult.success
      });
    }

    // Create the user in the users table
    console.log(`[AUTH] Creating user account for ${request.email}...`);
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        name: request.name,
        email: request.email,
        password: request.password, // Already hashed
        role: 'executive',
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('[AUTH] ❌ Create user error:', createError);
      return res.status(500).json({ error: 'Failed to create user account' });
    }
    console.log(`[AUTH] ✅ User created: id=${newUser.id} name=${newUser.name} role=${newUser.role}`);

    // Also insert into the executives table so they appear in dropdowns
    console.log(`[AUTH] Inserting ${request.name} into executives table...`);
    const { error: execInsertError } = await supabase
      .from('executives')
      .insert({
        name: request.name,
        department: 'executive',
        active: true
      });

    if (execInsertError) {
      console.error('[AUTH] ⚠️ Failed to insert into executives table:', execInsertError.message);
      // Non-fatal — user is still created, just won't appear in dropdowns
    } else {
      console.log('[AUTH] ✅ Executive added to executives table');
    }

    // Mark the access request as approved
    await supabase
      .from('access_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString(), reviewed_by: req.user.id })
      .eq('id', id);

    // Send email notification
    console.log(`[AUTH] Sending approval email to ${request.email}...`);
    const emailResult = await sendApprovalEmail({ name: request.name, email: request.email });
    console.log(`[AUTH] Email result:`, JSON.stringify(emailResult));

    // Send WhatsApp notification
    console.log(`[AUTH] Sending WhatsApp to ${request.mobile}...`);
    const whatsappResult = await sendApprovalWhatsApp({ name: request.name, email: request.email, mobile: request.mobile });
    console.log(`[AUTH] WhatsApp result:`, JSON.stringify(whatsappResult));

    res.json({
      message: `Executive ${request.name} has been approved successfully.`,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      emailSent: emailResult.success,
      emailError: emailResult.error || null,
      whatsappSent: whatsappResult.success
    });
  } catch (error) {
    console.error('[AUTH] ❌ Approve request error:', error);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// POST /api/auth/reject-request/:id (admin only)
router.post('/reject-request/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[AUTH] ❌ Admin rejecting access request ID=${id} by admin user ID=${req.user.id}`);

    const { data: request, error: fetchError } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      console.log(`[AUTH] ❌ Access request ID=${id} not found`);
      return res.status(404).json({ error: 'Access request not found' });
    }

    console.log(`[AUTH] Found request: name=${request.name} email=${request.email} status=${request.status}`);

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Mark the access request as rejected
    await supabase
      .from('access_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString(), reviewed_by: req.user.id })
      .eq('id', id);

    // Send rejection email
    console.log(`[AUTH] Sending rejection email to ${request.email}...`);
    const emailResult = await sendRejectionEmail({ name: request.name, email: request.email });
    console.log(`[AUTH] Email result:`, JSON.stringify(emailResult));

    // Send WhatsApp rejection
    console.log(`[AUTH] Sending WhatsApp rejection to ${request.mobile}...`);
    const whatsappResult = await sendRejectionWhatsApp({ name: request.name, mobile: request.mobile });
    console.log(`[AUTH] WhatsApp result:`, JSON.stringify(whatsappResult));

    res.json({
      message: `Request from ${request.name} has been rejected.`,
      emailSent: emailResult.success,
      emailError: emailResult.error || null,
      whatsappSent: whatsappResult.success
    });
  } catch (error) {
    console.error('[AUTH] ❌ Reject request error:', error);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// POST /api/auth/revoke-access/:id (admin only) — Delete/revoke approved executive access
router.post('/revoke-access/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[AUTH] 🗑️ Admin revoking access for request ID=${id} by admin user ID=${req.user.id}`);

    // Fetch the access request
    const { data: request, error: fetchError } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    console.log(`[AUTH] Found request: name=${request.name} email=${request.email} status=${request.status}`);

    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Can only revoke approved requests' });
    }

    // Delete the user from the users table (makes login invalid)
    const { error: deleteUserError } = await supabase
      .from('users')
      .delete()
      .eq('email', request.email);

    if (deleteUserError) {
      console.error('[AUTH] ❌ Failed to delete user:', deleteUserError);
      // Continue anyway — try to clean up other associations
    }

    // Delete from executives table
    const { error: deleteExecError } = await supabase
      .from('executives')
      .delete()
      .eq('name', request.name);

    if (deleteExecError) {
      console.error('[AUTH] ⚠️ Failed to delete from executives table:', deleteExecError.message);
    }

    // Update the access request status to 'revoked'
    const { error: updateError } = await supabase
      .from('access_requests')
      .update({ status: 'revoked', updated_at: new Date().toISOString(), reviewed_by: req.user.id })
      .eq('id', id);

    if (updateError) {
      console.error('[AUTH] ❌ Failed to update access request status:', updateError);
      return res.status(500).json({ error: 'Failed to update access request status in database' });
    }

    console.log(`[AUTH] ✅ Access revoked for ${request.name} (${request.email})`);

    res.json({
      message: `Access revoked for ${request.name}. They can no longer log in.`
    });
  } catch (error) {
    console.error('[AUTH] ❌ Revoke access error:', error);
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

export default router;