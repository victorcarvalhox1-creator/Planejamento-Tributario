
import { createClient } from '@supabase/supabase-js';

// Credentials provided by user
const SUPABASE_URL = 'https://ijmnswgftotcekzkioyp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbW5zd2dmdG90Y2Vremtpb3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MDgyODEsImV4cCI6MjA3OTQ4NDI4MX0.yARSfFnx12YfgBPHxRr50bzyRepE-OiMqljeJiMrhK4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
