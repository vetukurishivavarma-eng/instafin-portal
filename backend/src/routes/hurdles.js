import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import {
  deriveHurdle,
  getBlockingHurdles,
  processPenaltyNotifications,
  HURDLE_PENALTY_DAYS,
  SALARY_PENALTY_PERCENT,
} from '../services/hurdle.service.js';

const router = express.Router();

router.use(authenticate);

const canAssign = (...roles) => roles.includes('admin') || roles.includes('operations_head');
const isManager = req => req.user.role === 'admin' || req.user.role === 'operations_head';

// GET /api/hurdles — list hurdles.
//  - Executives see only their own tasks.
//  - Admin / Operations Head see all tasks (optionally filtered by ?assignee= & ?status=).
router.get('/', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    // Best-effort: fire penalty notifications for any newly-eligible tasks.
    await processPenaltyNotifications().catch(err =>
      console.error('[HURDLES] penalty processing failed:', err.message)
    );

    let query = supabase.from('daily_hurdles').select('*');

    if (!isManager(req)) {
      query = query.eq('assignee_id', req.user.id);
    } else {
      if (req.query.assignee) query = query.eq('assignee_id', req.query.assignee);
      if (req.query.status) query = query.eq('status', req.query.status);
    }

    const { data: rows, error } = await query.order('created_at', { ascending: false });

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.json({ data: [], needsMigration: true });
      }
      throw error;
    }

    res.json({ data: (rows || []).map(deriveHurdle), penaltyDays: HURDLE_PENALTY_DAYS, penaltyPercent: SALARY_PENALTY_PERCENT });
  } catch (error) {
    console.error('Error fetching hurdles:', error);
    res.status(500).json({ error: 'Failed to fetch hurdles' });
  }
});

// GET /api/hurdles/block-status — current user's blocking state.
router.get('/block-status', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    await processPenaltyNotifications().catch(() => {});
    const blocking = await getBlockingHurdles(req.user.id);
    res.json({
      blocked: blocking.length > 0,
      blocking,
      penaltyDays: HURDLE_PENALTY_DAYS,
      penaltyPercent: SALARY_PENALTY_PERCENT,
    });
  } catch (error) {
    console.error('Error fetching block status:', error);
    res.status(500).json({ error: 'Failed to fetch block status' });
  }
});

// GET /api/hurdles/assignable-users — users that can be assigned tasks (non-admin).
router.get('/assignable-users', authorize('admin', 'operations_head'), async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role')
      .in('role', ['executive', 'operations_head', 'dsa'])
      .order('name');

    if (error) throw error;
    res.json(users || []);
  } catch (error) {
    console.error('Error fetching assignable users:', error);
    res.status(500).json({ error: 'Failed to fetch assignable users' });
  }
});

// POST /api/hurdles — create a task.
//  - Admin / Operations Head: assign to any assignable user.
//  - Executive: may create tasks for themselves only.
router.post('/', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { title, description, priority, deadline, assignee_id } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    let assigneeId = assignee_id;
    if (!isManager(req)) {
      // Executives can only create tasks assigned to themselves.
      if (assigneeId && assigneeId !== req.user.id) {
        return res.status(403).json({ error: 'Executives can only create tasks for themselves' });
      }
      assigneeId = req.user.id;
    }

    if (!assigneeId) {
      return res.status(400).json({ error: 'Assignee is required' });
    }

    const { data: assignee } = await supabase
      .from('users')
      .select('name')
      .eq('id', assigneeId)
      .single();

    const managerRole = canAssign(req.user.role);
    const { data: hurdle, error } = await supabase
      .from('daily_hurdles')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        deadline: deadline || null,
        assignee_id: assigneeId,
        assignee_name: assignee?.name || null,
        assigned_by: managerRole ? req.user.id : null,
        assigned_by_name: managerRole ? (req.user.name || req.user.email) : null,
      })
      .select()
      .single();

    if (error) {
      if (error.message && (error.message.includes('relation') || error.message.includes('does not exist'))) {
        return res.status(400).json({ error: 'Daily Hurdles table not yet set up. Please run database migrations.' });
      }
      throw error;
    }

    await processPenaltyNotifications().catch(() => {});
    res.status(201).json({ data: deriveHurdle(hurdle) });
  } catch (error) {
    console.error('Error creating hurdle:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// POST /api/hurdles/:id/complete — mark a task completed.
router.post('/:id/complete', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('daily_hurdles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Task not found' });

    if (!isManager(req) && existing.assignee_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only complete your own tasks' });
    }

    const { data: updated, error } = await supabase
      .from('daily_hurdles')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(note ? { reason: note } : {}),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await processPenaltyNotifications().catch(() => {});
    res.json({ data: deriveHurdle(updated) });
  } catch (error) {
    console.error('Error completing hurdle:', error);
    res.status(500).json({ error: 'Failed to complete task' });
  }
});

// PUT /api/hurdles/:id — update a task.
//  - Managers may edit any field of any task (incl. reassignment).
//  - Executives may only edit their own tasks: status, reason, expected_completion_date.
//    For self-created tasks they may also edit title/description/priority/deadline.
router.put('/:id', authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, deadline, assignee_id, status, reason, expected_completion_date } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('daily_hurdles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Task not found' });

    const isSelfCreated = existing.assigned_by === null;

    if (!isManager(req)) {
      if (existing.assignee_id !== req.user.id) {
        return res.status(403).json({ error: 'You can only update your own tasks' });
      }
      if (!isSelfCreated && (title !== undefined || description !== undefined || priority !== undefined || deadline !== undefined || assignee_id !== undefined)) {
        return res.status(403).json({ error: 'You can only update status, reason and completion date for assigned tasks' });
      }
    }

    const updateData = { updated_at: new Date().toISOString() };
    if (isManager(req)) {
      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description?.trim() || null;
      if (priority !== undefined) updateData.priority = priority;
      if (deadline !== undefined) updateData.deadline = deadline || null;
      if (assignee_id !== undefined && assignee_id !== existing.assignee_id) {
        updateData.assignee_id = assignee_id;
        const { data: assignee } = await supabase.from('users').select('name').eq('id', assignee_id).single();
        updateData.assignee_name = assignee?.name || null;
      }
    }
    if (status !== undefined) updateData.status = status;
    if (reason !== undefined) updateData.reason = reason?.trim() || null;
    if (expected_completion_date !== undefined) updateData.expected_completion_date = expected_completion_date || null;

    // If an overdue task is being carried forward with a COMPLETE justification
    // (both reason and a new expected date), count it as a carry-forward.
    const derived = deriveHurdle(existing);
    if (derived.overdue && reason?.trim() && expected_completion_date) {
      updateData.carry_forward_count = (existing.carry_forward_count || 0) + 1;
    }

    const { data: updated, error } = await supabase
      .from('daily_hurdles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await processPenaltyNotifications().catch(() => {});
    res.json({ data: deriveHurdle(updated) });
  } catch (error) {
    console.error('Error updating hurdle:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/hurdles/:id — admin only.
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('daily_hurdles').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting hurdle:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
