import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import API_BASE from '../config/api';

const PRIORITY_STYLES = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

function apiHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function HurdlePage() {
  const { user, effectiveRole, accessToken } = useAuth();
  const isManager = effectiveRole === 'admin' || effectiveRole === 'operations_head';

  const [tasks, setTasks] = useState([]);
  const [blockStatus, setBlockStatus] = useState(null);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [penaltyDays, setPenaltyDays] = useState(3);

  // Filters (manager view)
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create / assign form
  const [form, setForm] = useState({ title: '', description: '', deadline: '', priority: 'medium', assignee_id: '' });
  const [saving, setSaving] = useState(false);

  // Justification forms — keyed per task id so multiple overdue tasks stay independent
  const [justifyState, setJustifyState] = useState({});

  // Manager edit modal
  const [editTask, setEditTask] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', deadline: '', priority: 'medium', assignee_id: '' });

  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;
    try {
      const params = new URLSearchParams();
      if (isManager && filterAssignee) params.set('assignee', filterAssignee);
      if (isManager && filterStatus) params.set('status', filterStatus);
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`${API_BASE}/hurdles${qs}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.blocked) {
          setBlockStatus({ blocked: true });
        }
        throw new Error(err.error || 'Failed to load tasks');
      }
      const data = await res.json();
      setTasks(data.data || []);
      setPenaltyDays(data.penaltyDays ?? 3);
    } catch (err) {
      if (!err.message?.includes('blocked')) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken, isManager, filterAssignee, filterStatus]);

  const fetchBlockStatus = useCallback(async () => {
    if (!accessToken || isManager) return;
    try {
      const res = await fetch(`${API_BASE}/hurdles/block-status`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        setBlockStatus(data);
        setPenaltyDays(data.penaltyDays ?? 3);
      }
    } catch (err) {
      // ignore
    }
  }, [accessToken, isManager]);

  const fetchAssignableUsers = useCallback(async () => {
    if (!accessToken || !isManager) return;
    try {
      const res = await fetch(`${API_BASE}/hurdles/assignable-users`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) setAssignableUsers(await res.json());
    } catch (err) {
      // ignore
    }
  }, [accessToken, isManager]);

  useEffect(() => { fetchTasks(); fetchBlockStatus(); }, [fetchTasks, fetchBlockStatus]);
  useEffect(() => { fetchAssignableUsers(); }, [fetchAssignableUsers]);

  // Refresh tasks periodically so overdue state stays fresh.
  useEffect(() => {
    const interval = setInterval(() => { fetchTasks(); fetchBlockStatus(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchTasks, fetchBlockStatus]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const overdue = tasks.filter(t => t.overdue).length;
    const blocking = tasks.filter(t => t.blocksAccess).length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    return { total, completed, overdue, blocking, inProgress, pending };
  }, [tasks]);

  const showError = (msg) => { setError(msg); setTimeout(() => setError(''), 6000); };
  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return showError('Task title is required');
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/hurdles`, {
        method: 'POST',
        headers: apiHeaders(accessToken),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          deadline: form.deadline || null,
          priority: form.priority,
          ...(isManager ? { assignee_id: form.assignee_id } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      showSuccess(isManager ? `Task assigned to ${assignableUsers.find(u => u.id === form.assignee_id)?.name || 'executive'}` : 'Task added');
      setForm({ title: '', description: '', deadline: '', priority: 'medium', assignee_id: form.assignee_id });
      fetchTasks();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (task, status) => {
    try {
      const res = await fetch(`${API_BASE}/hurdles/${task.id}`, {
        method: 'PUT',
        headers: apiHeaders(accessToken),
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update task');
      showSuccess(status === 'completed' ? 'Task completed 🎉' : 'Task updated');
      fetchTasks();
      fetchBlockStatus();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleComplete = async (task) => {
    try {
      const res = await fetch(`${API_BASE}/hurdles/${task.id}/complete`, {
        method: 'POST',
        headers: apiHeaders(accessToken),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete task');
      showSuccess('Task completed 🎉');
      fetchTasks();
      fetchBlockStatus();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleJustify = async (task) => {
    const j = justifyState[task.id] || {};
    if (!j.reason?.trim() || !j.date) {
      return showError('Please provide both a reason and an expected completion date');
    }
    try {
      const res = await fetch(`${API_BASE}/hurdles/${task.id}`, {
        method: 'PUT',
        headers: apiHeaders(accessToken),
        body: JSON.stringify({ reason: j.reason, expected_completion_date: j.date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save justification');
      showSuccess('Reason & completion date submitted. Access restored.');
      setJustifyState(prev => { const next = { ...prev }; delete next[task.id]; return next; });
      fetchTasks();
      fetchBlockStatus();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/hurdles/${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete task');
      showSuccess('Task deleted');
      fetchTasks();
    } catch (err) {
      showError(err.message);
    }
  };

  const openEdit = (task) => {
    setEditTask(task);
    setEditForm({
      title: task.title || '',
      description: task.description || '',
      deadline: task.deadline || '',
      priority: task.priority || 'medium',
      assignee_id: task.assignee_id || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editTask) return;
    try {
      const res = await fetch(`${API_BASE}/hurdles/${editTask.id}`, {
        method: 'PUT',
        headers: apiHeaders(accessToken),
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          deadline: editForm.deadline || null,
          priority: editForm.priority,
          assignee_id: editForm.assignee_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update task');
      showSuccess('Task updated');
      setEditTask(null);
      fetchTasks();
    } catch (err) {
      showError(err.message);
    }
  };

  const overdueTasks = tasks.filter(t => t.overdue);
  const activeTasks = tasks.filter(t => !t.overdue && t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const renderTaskCard = (task) => {
    const blocking = task.blocksAccess;
    const j = justifyState[task.id] || { reason: '', date: '' };
    const setJ = (patch) => setJustifyState(prev => ({
      ...prev,
      [task.id]: { ...(prev[task.id] || { reason: '', date: '' }), ...patch },
    }));
    return (
      <div
        key={task.id}
        className={`rounded-2xl border p-4 sm:p-5 transition-all hover:shadow-md ${
          blocking
            ? 'border-red-300 bg-red-50/60 shadow-sm'
            : task.overdue
            ? 'border-orange-200 bg-orange-50/50'
            : task.status === 'completed'
            ? 'border-green-200 bg-white'
            : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">{task.title}</h3>
              {blocking && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-red-600 text-white px-2 py-0.5 rounded-full">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-8v4m-9 4a9 9 0 1118 0 9 9 0 01-18 0z" />
                  </svg>
                  Blocking
                </span>
              )}
              {task.overdue && !blocking && (
                <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  Overdue
                </span>
              )}
              {task.salary_penalty_notified && (
                <span
                  className="text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-full"
                  title="A 1% salary deduction notice has been sent for this task"
                >
                  ⚠️ 1% Penalty notified
                </span>
              )}
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium}`}>
                {task.priority}
              </span>
            </div>

            {task.description && <p className="text-xs sm:text-sm text-gray-600 mt-1.5">{task.description}</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
              {isManager && (
                <span className="font-semibold text-gray-700">👤 {task.assignee_name || 'Unknown'}</span>
              )}
              <span>📅 Deadline: <span className="font-semibold text-gray-700">{formatDate(task.deadline)}</span></span>
              {task.overdue && (
                <span className="font-bold text-red-600">⏰ Overdue by {task.daysOverdue} day{task.daysOverdue > 1 ? 's' : ''}</span>
              )}
              {task.status !== 'completed' && task.status !== 'pending' && (
                <span className="text-blue-600 font-semibold">In progress</span>
              )}
              {task.completed_at && (
                <span>✅ Completed {new Date(task.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              )}
              {task.carry_forward_count > 0 && (
                <span className="text-orange-500">↻ Carried forward {task.carry_forward_count}×</span>
              )}
            </div>

            {task.reason && (
              <div className={`mt-2 rounded-xl px-3 py-2 border text-xs ${task.justified ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                <span className="font-bold">Reason:</span> {task.reason}
                {task.expected_completion_date && (
                  <span className="block mt-0.5 font-semibold">
                    Expected completion: {formatDate(task.expected_completion_date)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {task.status === 'pending' && !blocking && (
              <button
                onClick={() => handleStatusChange(task, 'in_progress')}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Start
              </button>
            )}
            {task.status !== 'completed' && !blocking && (
              <button
                onClick={() => handleComplete(task)}
                className="px-3 py-1.5 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                ✓ Complete
              </button>
            )}
            {isManager && (
              <>
                <button
                  onClick={() => openEdit(task)}
                  className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  Edit
                </button>
                {effectiveRole === 'admin' && (
                  <button
                    onClick={() => handleDelete(task)}
                    className="px-3 py-1.5 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Blocking justification form */}
        {blocking && (
          <div className="mt-3 rounded-xl border border-red-200 bg-white p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <p className="text-xs font-bold text-red-700">
                Action required — this task has crossed its deadline. You cannot use other screens until you provide:
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-start">
              <textarea
                placeholder="Reason for the delay..."
                rows={2}
                value={j.reason}
                onChange={e => setJ({ reason: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none"
              />
              <input
                type="date"
                value={j.date}
                onChange={e => setJ({ date: e.target.value })}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none"
                title="Expected completion date"
              />
              <button
                onClick={() => handleJustify(task)}
                className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors whitespace-nowrap"
              >
                Submit & Unblock
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const StatCard = ({ label, value, tone }) => (
    <div className={`rounded-2xl p-4 shadow-sm border ${tone}`}>
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );

  return (
    <div className="py-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Daily Hurdles</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isManager
              ? 'Assign tasks to executives and track their completion'
              : 'Track your tasks — overdue tasks need a reason & completion date to unlock other screens'}
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-800 font-medium max-w-xs">
          ⚠️ Tasks delayed by <b>{penaltyDays}+ days</b> trigger a <b>1% salary deduction notice</b> for the month.
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-2xl mb-6 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')} className="font-bold">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-2xl mb-6 flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="font-bold">&times;</button>
        </div>
      )}

      {/* Executive blocked banner */}
      {!isManager && blockStatus?.blocked && (
        <div className="bg-red-600 text-white rounded-2xl px-5 py-4 mb-6 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div>
            <p className="font-extrabold">🔒 Access blocked</p>
            <p className="text-sm text-red-100">
              You have {blockStatus.blocking?.length || 0} overdue task{(blockStatus.blocking?.length || 0) > 1 ? 's' : ''} without a justification.
              Provide a reason and completion date below to regain access to all screens.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total" value={stats.total} tone="bg-white border-gray-200 text-gray-900" />
        <StatCard label="Pending" value={stats.pending} tone="bg-yellow-50 border-yellow-200 text-yellow-700" />
        <StatCard label="In Progress" value={stats.inProgress} tone="bg-blue-50 border-blue-200 text-blue-700" />
        <StatCard label="Overdue" value={stats.overdue} tone="bg-orange-50 border-orange-200 text-orange-700" />
        <StatCard label="Blocking" value={stats.blocking} tone="bg-red-50 border-red-200 text-red-700" />
        <StatCard label="Completed" value={stats.completed} tone="bg-green-50 border-green-200 text-green-700" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Create / Assign form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-6 lg:sticky lg:top-4">
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              {isManager ? 'Assign New Task' : 'Add My Task'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {isManager ? 'Assign a task to an executive with a deadline' : 'Tasks you add yourself also count toward your daily hurdles'}
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              {isManager && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Assign to *</label>
                  <select
                    required
                    value={form.assignee_id}
                    onChange={e => setForm({ ...form, assignee_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  >
                    <option value="">Select executive…</option>
                    {assignableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {u.role === 'operations_head' ? 'Operations Head' : u.role === 'dsa' ? 'DSA' : 'Executive'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Task title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Upload 5 KYC documents"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional details…"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Deadline</label>
                  <input
                    type="date"
                    value={form.deadline}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm transition-all shadow-md disabled:opacity-50"
              >
                {saving ? 'Saving…' : isManager ? '➕ Assign Task' : '➕ Add Task'}
              </button>
            </form>
          </div>
        </div>

        {/* Task lists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Manager filters */}
          {isManager && (
            <div className="bg-white rounded-2xl shadow px-4 py-3 flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-40">
                <select
                  value={filterAssignee}
                  onChange={e => { setFilterAssignee(e.target.value); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">All executives</option>
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-40">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <button
                onClick={() => { setFilterAssignee(''); setFilterStatus(''); }}
                className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-gray-400 font-semibold animate-pulse">Loading tasks…</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl">
              <div className="text-5xl mb-3">🗂️</div>
              <h3 className="text-lg font-bold text-gray-700">No tasks found</h3>
              <p className="text-gray-400 text-sm mt-1">
                {isManager ? 'Assign a task to get started' : 'Add your first task to get started'}
              </p>
            </div>
          ) : (
            <>
              {overdueTasks.length > 0 && (
                <section>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-red-600 mb-2">
                    ⏰ Overdue — {overdueTasks.length}
                  </h2>
                  <div className="space-y-3">{overdueTasks.map(renderTaskCard)}</div>
                </section>
              )}

              {activeTasks.length > 0 && (
                <section>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-gray-500 mb-2">
                    Active — {activeTasks.length}
                  </h2>
                  <div className="space-y-3">{activeTasks.map(renderTaskCard)}</div>
                </section>
              )}

              {completedTasks.length > 0 && (
                <section>
                  <h2 className="text-sm font-extrabold uppercase tracking-wide text-green-600 mb-2">
                    ✅ Completed — {completedTasks.length}
                  </h2>
                  <div className="space-y-3">{completedTasks.map(renderTaskCard)}</div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manager edit modal */}
      {editTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditTask(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Task</h3>
            <div className="space-y-3">
              <input
                value={editForm.title}
                onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Task title"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
              />
              <textarea
                rows={2}
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Description"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Deadline</label>
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={e => setEditForm({ ...editForm, deadline: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Assignee</label>
                <select
                  value={editForm.assignee_id}
                  onChange={e => setEditForm({ ...editForm, assignee_id: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                >
                  {assignableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditTask(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
