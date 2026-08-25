import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const isPlaceholder = (value) => {
  if (!value) return true;
  return /your[-_ ]?(project|supabase|anon|key|ref)/i.test(value) || value.includes('example');
};

const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseKey));

export const checkSupabaseConfig = () => {
  const missing = [];

  if (!supabaseUrl || isPlaceholder(supabaseUrl)) missing.push('VITE_SUPABASE_URL');
  if (!supabaseKey || isPlaceholder(supabaseKey)) missing.push('VITE_SUPABASE_ANON_KEY');

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length
      ? 'Supabase credentials are missing or still unset. Add the real values to the local .env file.'
      : 'Supabase configuration is loaded.',
  };
};

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseKey) : null;

export const getSupabaseClient = () => {
  if (!supabase) {
    throw new Error(checkSupabaseConfig().message);
  }

  return supabase;
};
