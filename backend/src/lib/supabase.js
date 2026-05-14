import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://sknevfqnfmwjbimdzpjf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set - using anon key (limited permissions)');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrbmV2ZnFuZm13amJpbWR6cGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjEzMTMsImV4cCI6MjA5NDMzNzMxM30.JDRbqHbVWJem_pWsnoN8u0-Ecv7i3ri7SMpkN5o1-Vc');

export default supabase;