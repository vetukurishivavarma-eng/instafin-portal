/**
 * Minimal in-memory stand-in for the handful of supabase-js query shapes
 * used by the WhatsApp intake module, so intakeService.test.js can run
 * without a real Supabase project. Not a general-purpose mock — only
 * supports the exact call chains this module makes.
 */
export function createFakeSupabase(seed = {}) {
  const store = {
    leads: [...(seed.leads || [])],
    users: [...(seed.users || [])],
    whatsapp_intake_log: [...(seed.whatsapp_intake_log || [])],
    lead_checklist_status: [...(seed.lead_checklist_status || [])],
  };
  let idCounter = 1;

  function from(table) {
    const filters = [];
    let insertData = null;
    let updateData = null;
    let limitN = null;

    function applyFilters() {
      let rows = store[table];
      for (const [col, val] of filters) rows = rows.filter((r) => r[col] === val);
      if (limitN) rows = rows.slice(0, limitN);
      return rows;
    }

    const builder = {
      select() { return builder; },
      insert(data) { insertData = data; return builder; },
      update(data) { updateData = data; return builder; },
      eq(col, val) { filters.push([col, val]); return builder; },
      limit(n) { limitN = n; return builder; },
      async maybeSingle() {
        const rows = applyFilters();
        return { data: rows[0] || null, error: null };
      },
      async single() {
        if (insertData) {
          if (table === 'whatsapp_intake_log') {
            const dup = store[table].find(
              (r) => r.provider === insertData.provider && r.provider_message_id === insertData.provider_message_id
            );
            if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          const row = { id: `fake-${idCounter++}`, ...insertData };
          store[table].push(row);
          return { data: row, error: null };
        }
        const rows = applyFilters();
        return { data: rows[0] || null, error: null };
      },
      // Makes `await from(...).update(...).eq(...)` (no .single()) work like supabase-js does.
      then(resolve) {
        if (updateData) {
          applyFilters().forEach((r) => Object.assign(r, updateData));
        }
        resolve({ data: applyFilters(), error: null });
      },
    };

    return builder;
  }

  return { supabase: { from }, store };
}
