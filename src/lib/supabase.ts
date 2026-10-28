import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

// Keep the app importable so it can show a setup message instead of a blank screen.
export const supabase = createClient(
  supabaseUrl || 'https://setup-required.supabase.co',
  supabaseKey || 'setup-required-anon-key',
)
