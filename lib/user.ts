import { supabase } from './supabase';

export const getCurrentUser = async () => {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('[getCurrentUser] Auth error:', authError);
      return null;
    }
    if (!user) return null;
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[getCurrentUser] Profile error:', profileError);
      // Try to create profile if it doesn't exist
      if (profileError.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{
            id: user.id,
            full_name: user.user_metadata?.full_name || 'Unknown User'
          }])
          .select()
          .single();

        if (createError) {
          console.error('[getCurrentUser] Profile creation error:', createError);
          return null;
        }

        return newProfile ? {
          id: newProfile.id,
          name: newProfile.full_name || newProfile.username || 'Unknown User',
          avatarUrl: newProfile.avatar_url
        } : null;
      }
      return null;
    }
      
    return profile ? {
      id: profile.id,
      name: profile.full_name || profile.username || 'Unknown User',
      avatarUrl: profile.avatar_url
    } : null;
  } catch (error) {
    console.error('[getCurrentUser] Unexpected error:', error);
    return null;
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
};