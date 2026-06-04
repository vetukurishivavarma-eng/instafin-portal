import { supabase } from './src/lib/supabase.js';

const { data, error } = await supabase.storage.listBuckets();
console.log('Buckets:', JSON.stringify(data?.map(b => b.name)));
console.log('Error:', error?.message);
