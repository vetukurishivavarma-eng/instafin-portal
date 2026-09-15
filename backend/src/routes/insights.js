import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { inChunks } from '../utils/inChunks.js';
import {
  STAGE_SLA_DAYS,
  findStuckLeads,
  bankTatLeaderboard,
  revenueSummary,
} from '../services/insights.service.js';

const router = express.Router();
router.use(authenticate);

const isManager = (role) => role === 'admin' || role === 'operations_head';
const looksLikeUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

// Executives only ever see their own leads (assigned_to holds a user id, or a name on legacy rows).
async function loadScopedLeads(req, columns = '*') {
  let query = supabase.from('leads').select(columns);
  if (!isManager(req.user.role)) {
    const { data: me } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
    query = me?.name
      ? query.or(`assigned_to.eq.${req.user.id},assigned_to.eq.${me.name}`)
      : query.eq('assigned_to', req.user.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function userNamesById(ids) {
  const uuids = [...new Set(ids.filter(looksLikeUuid))];
  if (!uuids.length) return {};
  const users = await inChunks(uuids, (chunk) => supabase.from('users').select('id, name').in('id', chunk));
  return Object.fromEntries(users.map((u) => [u.id, u.name]));
}

async function computeStuck(req) {
  const openStatuses = Object.keys(STAGE_SLA_DAYS);
  const leads = (await loadScopedLeads(req)).filter((l) => openStatuses.includes(l.status));
  if (!leads.length) return [];

  const history = await inChunks(leads.map((l) => l.id), (chunk) =>
    supabase.from('status_history').select('lead_id, new_status, changed_at').in('lead_id', chunk)
  ).catch((err) => {
    // status_history missing (migration 006 not applied) — fall back to lead entry dates
    console.warn('[INSIGHTS] status_history unavailable, using entry dates:', err.message);
    return [];
  });
  const historyByLead = {};
  for (const row of history) (historyByLead[row.lead_id] ||= []).push(row);

  const stuck = findStuckLeads(leads, historyByLead, new Date());
  const names = await userNamesById(stuck.map((s) => s.assignedTo));
  return stuck.map((s) => ({ ...s, assignedToName: names[s.assignedTo] || s.assignedTo }));
}

// GET /api/insights/stuck-leads — open leads past their stage time limit, worst first
router.get('/stuck-leads', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    res.json({ data: await computeStuck(req), slaDays: STAGE_SLA_DAYS });
  } catch (error) {
    console.error('Error computing stuck leads:', error);
    res.status(500).json({ error: 'Failed to load stuck leads' });
  }
});

// POST /api/insights/stuck-leads/:leadId/hurdle — turn a stuck lead into a Daily Hurdle for its executive
router.post('/stuck-leads/:leadId/hurdle', authorize('admin', 'operations_head'), async (req, res) => {
  try {
    const item = (await computeStuck(req)).find((s) => s.leadId === req.params.leadId);
    if (!item) return res.status(404).json({ error: 'This lead is no longer stuck.' });

    let assigneeId = looksLikeUuid(item.assignedTo) ? item.assignedTo : null;
    if (!assigneeId && item.assignedTo) {
      const { data: legacy } = await supabase.from('users').select('id').eq('name', item.assignedTo).maybeSingle();
      assigneeId = legacy?.id || null;
    }
    if (!assigneeId) return res.status(400).json({ error: 'This lead has no assigned executive to give the task to.' });

    const ref = item.leadCode || item.customerName;
    const title = `Unstick ${ref}: ${item.daysInStage} days in ${item.status}`;

    const { data: open } = await supabase
      .from('daily_hurdles')
      .select('id, title, status')
      .eq('assignee_id', assigneeId)
      .neq('status', 'completed');
    if ((open || []).some((h) => h.title?.startsWith(`Unstick ${ref}:`))) {
      return res.status(409).json({ error: 'An open task for this lead already exists.' });
    }

    const { data: assignee } = await supabase.from('users').select('name').eq('id', assigneeId).maybeSingle();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: hurdle, error } = await supabase
      .from('daily_hurdles')
      .insert({
        title,
        description: `${item.customerName} has been in "${item.status}" for ${item.daysInStage} days (limit ${item.slaDays}). Move it forward or record why it is waiting.`,
        priority: item.severity === 'critical' ? 'high' : 'medium',
        deadline: tomorrow,
        assignee_id: assigneeId,
        assignee_name: assignee?.name || null,
        assigned_by: req.user.id,
        assigned_by_name: req.user.email,
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ data: hurdle });
  } catch (error) {
    console.error('Error creating stuck-lead hurdle:', error);
    res.status(500).json({ error: 'Failed to create the task' });
  }
});

// GET /api/insights/bank-tat — per-bank approval rate and turnaround
router.get('/bank-tat', authorize('admin', 'operations_head'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lead_banks')
      .select('bank_name, status, created_at, updated_at');
    if (error) throw error;
    res.json({ data: bankTatLeaderboard(data || [], new Date()) });
  } catch (error) {
    console.error('Error computing bank TAT:', error);
    res.status(500).json({ error: 'Failed to load bank turnaround' });
  }
});

// GET /api/insights/revenue — real earned revenue + commission forecast (admin, like the Revenue page)
router.get('/revenue', authorize('admin'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('leads').select('*');
    if (error) throw error;
    res.json(revenueSummary(data || [], new Date()));
  } catch (error) {
    console.error('Error computing revenue summary:', error);
    res.status(500).json({ error: 'Failed to load revenue' });
  }
});

export default router;
