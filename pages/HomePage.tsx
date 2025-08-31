
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { motion } from 'framer-motion';
import { getCurrentUser, signOut } from '../lib/user';
import { LogOut, User } from 'lucide-react';
import { useEffect } from 'react';

const HomePage: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
  }, []);

  const handleCreateRoom = () => {
    const newRoomId = uuidv4();
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
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
          {currentUser && (
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
          )}
        </div>
        
        <div className="space-y-4">
          <motion.button
            onClick={handleCreateRoom}
            className="w-full px-4 py-3 font-semibold text-white bg-primary rounded-lg shadow-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-hover dark:focus:ring-offset-gray-800"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Create New Room
          </motion.button>

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
              className="w-full px-4 py-3 font-semibold text-white bg-secondary rounded-lg shadow-md hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-hover dark:focus:ring-offset-gray-800"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Join Room
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default HomePage;