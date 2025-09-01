
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import { getCurrentUser, signOut } from '../lib/user';
import { LogOut, User } from 'lucide-react';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

const HomePage: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const initUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[HomePage] Session:', session);

      if (session) {
        const user = await getCurrentUser();
        console.log('[HomePage] Current user loaded:', user);
        setCurrentUser(user);
      } else {
        console.log('[HomePage] No active session');
        setCurrentUser(null);
      }
    };

    initUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[HomePage] Auth state changed:', event, session);
      if (session) {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const handleCreateRoom = async () => {
    setError('');
    setIsLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[HomePage] No active session found');
      setError('Please sign in to create a room.');
      setIsLoading(false);
      return;
    }

    if (!currentUser) {
      console.error('[HomePage] No current user found:', currentUser);
      setError('Please sign in to create a room.');
      setIsLoading(false);
      return;
    }

    // Verify user has permission to create rooms
    const { data: testRoom, error: testError } = await supabase
      .from('meetboard_rooms')
      .select()
      .limit(1);

    if (testError?.code === 'PGRST301') {
      console.error('[HomePage] Permission error:', testError);
      setError('You do not have permission to create rooms.');
      setIsLoading(false);
      return;
    }

    console.log('[HomePage] Creating room with user:', currentUser);
    try {
      const newRoomId = uuidv4();
      const { data, error } = await supabase
        .from('meetboard_rooms')
        .insert([{ 
          id: newRoomId, 
          status: 'active',
          creator_id: currentUser.id,
          host_id: currentUser.id,
          name: `${currentUser.name}'s Room`
        }])
        .select()
        .single();

      console.log('[HomePage] Room creation response:', { data, error });

      if (error) {
        console.error('[HomePage] Error creating room:', error);
        setError('Failed to create room. Please try again.');
        return;
      }

      navigate(`/room/${newRoomId}`);
    } catch (err) {
      console.error('[HomePage] Failed to create room:', err);
      setError('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRoomId = roomId.trim();
    if (!trimmedRoomId) {
      setError('Please enter a room ID');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('meetboard_rooms')
        .select('status')
        .eq('id', trimmedRoomId)
        .single();

      if (error || !data) {
        console.error('[HomePage] Room not found:', error);
        setError('Room not found. Please check the room ID.');
        return;
      }

      if (data.status !== 'active') {
        console.error('[HomePage] Room is not active:', data.status);
        setError('This room is no longer active.');
        return;
      }

      navigate(`/room/${trimmedRoomId}`);
    } catch (err) {
      console.error('[HomePage] Failed to join room:', err);
      setError('Failed to join room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.reload();
  };
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div 
        className="w-full max-w-md p-8 space-y-8 bg-white/30 dark:bg-black/20 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Meetboard by Prodai</h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">Collaborate visually. Connect instantly.</p>
          {currentUser ? (
            <div className="mt-4 flex items-center justify-center gap-2 p-3 bg-white/20 dark:bg-slate-800/20 rounded-lg">
              <User className="w-5 h-5" />
              <span className="font-medium">{currentUser.name}</span>
              <button
                onClick={handleSignOut}
                className="ml-2 p-1 hover:bg-white/20 dark:hover:bg-slate-700/50 rounded"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <button
                onClick={() => window.location.href = '/auth'}
                className="px-4 py-2 font-semibold text-white bg-primary rounded-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary-hover focus:ring-offset-2"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
        
        <div className="space-y-4">
          <motion.button
            onClick={handleCreateRoom}
            disabled={isLoading || !currentUser}
            className={`w-full px-4 py-3 font-semibold text-white rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${isLoading || !currentUser ? 'bg-primary/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover focus:ring-primary-hover'}`}
            whileHover={isLoading || !currentUser ? {} : { scale: 1.02 }}
            whileTap={isLoading || !currentUser ? {} : { scale: 0.98 }}
          >
            {isLoading ? 'Creating Room...' : !currentUser ? 'Sign In to Create Room' : 'Create New Room'}
          </motion.button>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 p-2 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 rounded-md text-center"
            >
              {error}
            </motion.div>
          )}

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative px-2 bg-slate-100 dark:bg-[#0D0B14] text-sm text-gray-500 dark:text-gray-400">OR</div>
          </div>
        
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room Link or ID"
              className="w-full px-4 py-3 text-gray-900 dark:text-white bg-white/50 dark:bg-slate-800/50 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-600 dark:placeholder:text-gray-400"
            />
            <motion.button
              type="submit"
              disabled={isLoading || !currentUser}
              className={`w-full px-4 py-3 font-semibold text-white rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${isLoading || !currentUser ? 'bg-secondary/50 cursor-not-allowed' : 'bg-secondary hover:bg-secondary-hover focus:ring-secondary-hover'}`}
              whileHover={isLoading || !currentUser ? {} : { scale: 1.02 }}
              whileTap={isLoading || !currentUser ? {} : { scale: 0.98 }}
            >
              {isLoading ? 'Joining Room...' : !currentUser ? 'Sign In to Join Room' : 'Join Room'}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default HomePage;