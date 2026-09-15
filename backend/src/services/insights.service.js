/**
 * Pure calculations behind the Insights screen (stuck-lead radar, bank turnaround leaderboard,
 * revenue + commission forecast). No database access here — routes/insights.js loads the rows —
 * so every rule is unit-tested in test/insights/insights.service.test.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many days a lead may sit in each open stage before it counts as stuck. */
export const STAGE_SLA_DAYS = {
  New: 2,
  Assigned: 3,
  Processing: 10,
  Sanctioned: 7,
  'Partially Disbursed': 15,
};

const APPROVED_BANK_STATUSES = ['Sanctioned', 'Partially Disbursed', 'Disbursed'];

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

/** When the lead entered its current status: the latest history row into that status, else creation. */
export function stageEnteredAt(lead, history = []) {
  const sorted = [...history].sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at));
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].new_status === lead.status) return new Date(sorted[i].changed_at);
  }
  return new Date(lead.entry_date || lead.created_at);
}

/**
 * Open leads that have sat in their current stage longer than STAGE_SLA_DAYS, worst first
 * (ranked by days-in-stage relative to that stage's limit). Closed/inactive leads are skipped.
 */
export function findStuckLeads(leads, historyByLead = {}, now = new Date(), sla = STAGE_SLA_DAYS) {
  const stuck = [];
  for (const lead of leads) {
    const limit = sla[lead.status];
    if (!limit || lead.is_closed === true || lead.is_active === false) continue;
    const since = stageEnteredAt(lead, historyByLead[lead.id] || []);
    if (Number.isNaN(since.getTime())) continue;
    const days = Math.floor((now - since) / DAY_MS);
    if (days <= limit) continue;
    stuck.push({
      leadId: lead.id,
      leadCode: lead.lead_code || null,
      customerName: lead.customer_name,
      loanType: lead.loan_type || null,
      status: lead.status,
      since: since.toISOString(),
      daysInStage: days,
      slaDays: limit,
      overBy: days - limit,
      severity: days >= limit * 2 ? 'critical' : 'warning',
      assignedTo: lead.assigned_to || null,
      expectedAmount: num(lead.expected_amount),
    });
  }
  return stuck.sort((a, b) => b.daysInStage / b.slaDays - a.daysInStage / a.slaDays);
}

/**
 * Per-bank scorecard from lead_banks rows: files sent, approval rate, median days from a file
 * reaching the bank to its decision, and how long still-pending files have been waiting.
 * ponytail: lead_banks has no sanctioned_at/rejected_at, so updated_at stands in for the decision
 * date and only files still sitting at Sanctioned/Rejected are timed (a disbursement bumps
 * updated_at again). Add decision timestamps to lead_banks if exact TAT ever matters.
 */
export function bankTatLeaderboard(bankRows, now = new Date()) {
  const byBank = new Map();
  for (const row of bankRows) {
    const name = String(row.bank_name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byBank.has(key)) {
      byBank.set(key, { bankName: name, applications: 0, approved: 0, rejected: 0, pending: 0, decisionDays: [], pendingDays: [] });
    }
    const b = byBank.get(key);
    b.applications += 1;
    const created = new Date(row.created_at);
    const updated = row.updated_at ? new Date(row.updated_at) : null;

    if (row.status === 'Processing') {
      b.pending += 1;
      if (!Number.isNaN(created.getTime())) b.pendingDays.push((now - created) / DAY_MS);
      continue;
    }
    if (row.status === 'Rejected') b.rejected += 1;
    else if (APPROVED_BANK_STATUSES.includes(row.status)) b.approved += 1;

    if ((row.status === 'Sanctioned' || row.status === 'Rejected') && updated && !Number.isNaN(created.getTime())) {
      b.decisionDays.push(Math.max(0, (updated - created) / DAY_MS));
    }
  }

  return [...byBank.values()]
    .map((b) => {
      const decided = b.approved + b.rejected;
      const avgPending = b.pendingDays.length ? b.pendingDays.reduce((s, d) => s + d, 0) / b.pendingDays.length : null;
      return {
        bankName: b.bankName,
        applications: b.applications,
        approved: b.approved,
        rejected: b.rejected,
        pending: b.pending,
        approvalRate: decided ? Math.round((b.approved / decided) * 100) : null,
        medianDecisionDays: round1(median(b.decisionDays)),
        avgPendingDays: round1(avgPending),
      };
    })
    .sort((a, b) =>
      (b.approvalRate ?? -1) - (a.approvalRate ?? -1) ||
      (a.medianDecisionDays ?? Infinity) - (b.medianDecisionDays ?? Infinity) ||
      b.applications - a.applications);
}

/** Commission % for a lead — the admin-entered percent, default 1% (same default as the Revenue page). */
function commissionPercent(lead) {
  return num(lead.revenue_percent) ?? 1;
}

/**
 * One lead's revenue, the same rule as RevenuePage.calcLeadRevenue: received + pending if either
 * was entered, else the legacy manual figure, else commission % of disbursed/sanctioned/expected.
 */
export function leadRevenue(lead) {
  const received = num(lead.revenue_received);
  const pending = num(lead.revenue_pending);
  if (received !== null || pending !== null) return (received || 0) + (pending || 0);
  const manual = num(lead.revenue);
  if (manual !== null) return manual;
  const amount = num(lead.disbursed_amount) || num(lead.sanctioned_amount) || num(lead.expected_amount) || 0;
  return amount * (commissionPercent(lead) / 100);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Real revenue + a commission forecast.
 * - earned: revenue on leads that have actually paid out (any disbursal, or revenue entered by hand).
 * - received / pendingCollection: the admin-entered split.
 * - forecast.sanctionedPipeline: commission on the undisbursed part of sanctioned loans.
 * - forecast.processingPipeline: commission on files still at the banks, weighted by this
 *   portfolio's own historical approval rate (50% until anything has been decided).
 * - last6Months: earned revenue by the month it was received (else lead entry date), oldest first.
 */
export function revenueSummary(leads, now = new Date()) {
  let earned = 0;
  let received = 0;
  let pendingCollection = 0;
  let sanctionedPipeline = 0;
  let processingAmount = 0;
  let approvedLeads = 0;
  let rejectedLeads = 0;

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d), revenue: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));

  for (const lead of leads) {
    const status = lead.status;
    if (['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(status)) approvedLeads += 1;
    if (status === 'Rejected') rejectedLeads += 1;

    const hasEntries = num(lead.revenue_received) !== null || num(lead.revenue_pending) !== null || num(lead.revenue) !== null;
    const paidOut = (num(lead.disbursed_amount) || 0) > 0 || status === 'Disbursed' || status === 'Partially Disbursed';

    if (hasEntries || paidOut) {
      const value = leadRevenue(lead);
      earned += value;
      received += num(lead.revenue_received) || 0;
      pendingCollection += num(lead.revenue_pending) || 0;
      const when = new Date(lead.revenue_received_date || lead.entry_date || lead.created_at);
      if (!Number.isNaN(when.getTime()) && monthIndex.has(monthKey(when))) {
        months[monthIndex.get(monthKey(when))].revenue += value;
      }
    }

    if (lead.is_closed === true || lead.is_active === false) continue;
    if (status === 'Sanctioned' || status === 'Partially Disbursed') {
      const undisbursed = Math.max(0, (num(lead.sanctioned_amount) || 0) - (num(lead.disbursed_amount) || 0));
      sanctionedPipeline += undisbursed * (commissionPercent(lead) / 100);
    } else if (status === 'Processing') {
      processingAmount += (num(lead.expected_amount) || 0) * (commissionPercent(lead) / 100);
    }
  }

  const decided = approvedLeads + rejectedLeads;
  const approvalRate = decided ? approvedLeads / decided : 0.5;
  const processingPipeline = processingAmount * approvalRate;

  const rounded = (n) => Math.round(n);
  return {
    earned: rounded(earned),
    received: rounded(received),
    pendingCollection: rounded(pendingCollection),
    forecast: {
      sanctionedPipeline: rounded(sanctionedPipeline),
      processingPipeline: rounded(processingPipeline),
      total: rounded(sanctionedPipeline + processingPipeline),
      approvalRatePercent: Math.round(approvalRate * 100),
      approvalRateIsDefault: decided === 0,
    },
    last6Months: months.map((m) => ({ month: m.month, revenue: rounded(m.revenue) })),
  };
}
