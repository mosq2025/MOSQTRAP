/**
 * MOSTRAP — Shared Frontend Configuration
 */

// Initialize Supabase Client
const SUPABASE_URL = 'https://zcdazfkwlkgiyyajnisw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZGF6Zmt3bGtnaXl5YWpuaXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODc2MTYsImV4cCI6MjA5MDI2MzYxNn0.wNhd6C_txAXrmm1Va41r7qL8NSnUmui1IQJ8eXjb5FU';

// We only initialize if the window.supabase object exists (which it will after loading the CDN script)
window.supabaseClient = null;
if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
