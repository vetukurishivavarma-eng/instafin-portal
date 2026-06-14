const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://sknevfqnfmwjbimdzpjf.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrbmV2ZnFuZm13amJpbWR6cGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjEzMTMsImV4cCI6MjA5NDMzNzMxM30.JDRbqHbVWJem_pWsnoN8u0-Ecv7i3ri7SMpkN5o1-Vc');

async function check() {
  const { data: leads, error: leadsErr } = await supabase.from('leads').select('id, status, is_active, is_closed, customer_name, assigned_to');
  if (leadsErr) { console.error('Error:', leadsErr); return; }

  const { data: banks, error: banksErr } = await supabase.from('lead_banks').select('lead_id, status');
  if (banksErr) { console.error('Error:', banksErr); return; }

  const banksByLead = {};
  (banks || []).forEach(b => {
    if (!banksByLead[b.lead_id]) banksByLead[b.lead_id] = [];
    banksByLead[b.lead_id].push(b.status);
  });

  const deriveLeadStatus = (bankStatuses) => {
    if (!bankStatuses || bankStatuses.length === 0) return null;
    const total = bankStatuses.length;
    const rejected = bankStatuses.filter(s => s === 'Rejected').length;
    const sanctioned = bankStatuses.filter(s => s === 'Sanctioned').length;
    const partiallyDisbursed = bankStatuses.filter(s => s === 'Partially Disbursed').length;
    const disbursed = bankStatuses.filter(s => s === 'Disbursed').length;
    const processing = bankStatuses.filter(s => s === 'Processing').length;
    if (rejected === total) return 'Rejected';
    if (disbursed === total) return 'Disbursed';
    const doneBanks = rejected + sanctioned + partiallyDisbursed + disbursed;
    if ((disbursed + partiallyDisbursed) > 0 && doneBanks === total) {
      if (partiallyDisbursed > 0 || (disbursed > 0 && disbursed < total - rejected)) return 'Partially Disbursed';
      return 'Disbursed';
    }
    if (sanctioned > 0 && processing > 0) return 'Processing';
    if (sanctioned > 0 && sanctioned === total - rejected) return 'Sanctioned';
    return 'Processing';
  };

  console.log('=== Leads with derived status that differs from raw DB status ===');
  (leads || []).forEach(lead => {
    const bs = banksByLead[lead.id] || [];
    let derived = lead.status;
    if (bs.length > 0 && lead.assigned_to) {
      const d = deriveLeadStatus(bs);
      if (d) derived = d;
    }
    if (derived !== lead.status) {
      console.log(lead.customer_name + ': raw=' + lead.status + ', derived=' + derived + ', banks=' + JSON.stringify(bs));
    }
  });

  console.log('');
  console.log('=== Leads with derived = Rejected ===');
  const derivedRejected = (leads || []).filter(lead => {
    const bs = banksByLead[lead.id] || [];
    let derived = lead.status;
    if (bs.length > 0 && lead.assigned_to) {
      const d = deriveLeadStatus(bs);
      if (d) derived = d;
    }
    return derived === 'Rejected';
  });
  derivedRejected.forEach(l => {
    const bs = banksByLead[l.id] || [];
    console.log(l.customer_name + ': raw=' + l.status + ', banks=' + JSON.stringify(bs) + ', is_active=' + l.is_active + ', is_closed=' + l.is_closed + ', assigned_to=' + (l.assigned_to ? 'yes' : 'no'));
  });

  console.log('');
  console.log('=== Full breakdown with derived status ===');
  const counts = {};
  (leads || []).forEach(lead => {
    const bs = banksByLead[lead.id] || [];
    let derived = lead.status;
    if (bs.length > 0 && lead.assigned_to) {
      const d = deriveLeadStatus(bs);
      if (d) derived = d;
    }
    counts[derived] = (counts[derived] || 0) + 1;
  });
  Object.entries(counts).sort().forEach(([k,v]) => console.log(k + ':', v));
}

check();
