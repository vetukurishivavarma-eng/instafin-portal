import { describe, it, expect } from 'vitest';
import {
  STAGE_SLA_DAYS,
  stageEnteredAt,
  findStuckLeads,
  bankTatLeaderboard,
  leadRevenue,
  revenueSummary,
} from '../../src/services/insights.service.js';

const NOW = new Date('2026-09-16T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('stageEnteredAt', () => {
  it('uses the latest history row into the current status, not the first', () => {
    const lead = { status: 'Processing', created_at: daysAgo(40) };
    const history = [
      { new_status: 'Processing', changed_at: daysAgo(30) },
      { new_status: 'Assigned', changed_at: daysAgo(20) },
      { new_status: 'Processing', changed_at: daysAgo(5) },
    ];
    expect(stageEnteredAt(lead, history).toISOString()).toBe(daysAgo(5));
  });

  it('falls back to entry date when there is no history', () => {
    expect(stageEnteredAt({ status: 'New', entry_date: daysAgo(3), created_at: daysAgo(9) }, []).toISOString()).toBe(daysAgo(3));
  });
});

describe('findStuckLeads', () => {
  const leads = [
    { id: 'a', status: 'Processing', customer_name: 'A', created_at: daysAgo(12) },          // 12 > 10: warning
    { id: 'b', status: 'New', customer_name: 'B', created_at: daysAgo(5) },                  // 5 >= 2*2: critical
    { id: 'c', status: 'Processing', customer_name: 'C', created_at: daysAgo(8) },           // within limit
    { id: 'd', status: 'Disbursed', customer_name: 'D', created_at: daysAgo(90) },           // not an open stage
    { id: 'e', status: 'Assigned', customer_name: 'E', created_at: daysAgo(30), is_closed: true },
    { id: 'f', status: 'Assigned', customer_name: 'F', created_at: daysAgo(30), is_active: false },
  ];

  it('flags only open, active leads past their stage limit, worst ratio first', () => {
    const stuck = findStuckLeads(leads, {}, NOW);
    expect(stuck.map((s) => s.leadId)).toEqual(['b', 'a']);
    expect(stuck[0]).toMatchObject({ status: 'New', daysInStage: 5, slaDays: STAGE_SLA_DAYS.New, overBy: 3, severity: 'critical' });
    expect(stuck[1]).toMatchObject({ daysInStage: 12, severity: 'warning' });
  });

  it('a recent status change resets the clock', () => {
    const history = { a: [{ new_status: 'Processing', changed_at: daysAgo(1) }] };
    expect(findStuckLeads([leads[0]], history, NOW)).toEqual([]);
  });
});

describe('bankTatLeaderboard', () => {
  it('scores approval rate, decision time and pending age per bank, merging name casing', () => {
    const rows = [
      { bank_name: 'HDFC', status: 'Sanctioned', created_at: daysAgo(10), updated_at: daysAgo(6) }, // 4 days
      { bank_name: 'hdfc', status: 'Rejected', created_at: daysAgo(10), updated_at: daysAgo(8) },   // 2 days
      { bank_name: 'HDFC', status: 'Disbursed', created_at: daysAgo(30), updated_at: daysAgo(1) },  // approved, not timed
      { bank_name: 'SBI', status: 'Sanctioned', created_at: daysAgo(20), updated_at: daysAgo(10) },
      { bank_name: 'SBI', status: 'Processing', created_at: daysAgo(6), updated_at: null },
      { bank_name: '', status: 'Processing', created_at: daysAgo(1) },
    ];
    const board = bankTatLeaderboard(rows, NOW);
    expect(board.map((b) => b.bankName)).toEqual(['SBI', 'HDFC']);
    expect(board[0]).toMatchObject({ applications: 2, approved: 1, pending: 1, approvalRate: 100, medianDecisionDays: 10, avgPendingDays: 6 });
    expect(board[1]).toMatchObject({ applications: 3, approved: 2, rejected: 1, approvalRate: 67, medianDecisionDays: 3 });
  });
});

describe('revenue', () => {
  it('leadRevenue follows the Revenue page rule order', () => {
    expect(leadRevenue({ revenue_received: '1000', revenue_pending: 500, revenue: 99 })).toBe(1500);
    expect(leadRevenue({ revenue: '2500' })).toBe(2500);
    expect(leadRevenue({ disbursed_amount: 1000000, revenue_percent: 1.5 })).toBe(15000);
    expect(leadRevenue({ expected_amount: 500000 })).toBe(5000); // default 1%
  });

  it('separates earned revenue from the weighted forecast', () => {
    const leads = [
      { status: 'Disbursed', disbursed_amount: 1000000, created_at: '2026-09-02T00:00:00Z' },               // earned 10,000 this month
      { status: 'Sanctioned', sanctioned_amount: 2000000, disbursed_amount: 0, created_at: daysAgo(3) },     // pipeline 20,000
      { status: 'Processing', expected_amount: 3000000, revenue_percent: 2, created_at: daysAgo(3) },        // 60,000 × approval rate
      { status: 'Rejected', created_at: daysAgo(40) },
      { status: 'New', expected_amount: 9000000, revenue_received: 4000, revenue_pending: 1000, revenue_received_date: '2026-08-10' },
    ];
    const s = revenueSummary(leads, NOW);
    expect(s.earned).toBe(15000);
    expect(s.received).toBe(4000);
    expect(s.pendingCollection).toBe(1000);
    // approved (Disbursed + Sanctioned) = 2, rejected = 1 → 67%
    expect(s.forecast.approvalRatePercent).toBe(67);
    expect(s.forecast.sanctionedPipeline).toBe(20000);
    expect(s.forecast.processingPipeline).toBe(40000);
    expect(s.forecast.total).toBe(60000);
    expect(s.last6Months).toHaveLength(6);
    expect(s.last6Months.at(-1)).toEqual({ month: '2026-09', revenue: 10000 });
    expect(s.last6Months.at(-2)).toEqual({ month: '2026-08', revenue: 5000 });
  });

  it('uses a 50% approval rate until any file has been decided', () => {
    const s = revenueSummary([{ status: 'Processing', expected_amount: 1000000 }], NOW);
    expect(s.forecast).toMatchObject({ processingPipeline: 5000, approvalRatePercent: 50, approvalRateIsDefault: true });
  });
});
