import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rwvmbgpbvfjpiktfruzg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3dm1iZ3BidmZqcGlrdGZydXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwOTA5OTcsImV4cCI6MjA3MDY2Njk5N30.x7wQ3FwF5oERk0s9kAeBtN9yIdPh1y4d0gFEZUdM7eU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);