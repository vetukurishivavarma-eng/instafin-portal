/**
 * Run a Supabase `.in(column, ids)` query in slices and concatenate the rows — a few hundred
 * UUIDs in one PostgREST URL is enough to hit request-line limits.
 */
export async function inChunks(ids, fetchChunk, size = 150) {
  const rows = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await fetchChunk(ids.slice(i, i + size));
    if (error) throw error;
    if (data) rows.push(...data);
  }
  return rows;
}
