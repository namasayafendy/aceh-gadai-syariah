const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// Client untuk frontend (dengan RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client untuk backend/API (bypass RLS) - gunakan ini di semua API routes
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

module.exports = { supabase, supabaseAdmin };