import { supabase } from './supabase';

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .eq('id', user.id)
    .single();
    
  return profile ? {
    id: profile.id,
    name: profile.full_name || profile.username || 'Unknown User',
    avatarUrl: profile.avatar_url
  } : null;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};