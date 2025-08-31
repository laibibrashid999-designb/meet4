

import React, { useContext, useState, useRef, useEffect } from 'react';
import { User } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, MoreVertical, UserX } from 'lucide-react';
import { RoomContext } from './RoomProvider';
import { supabase } from '../lib/supabase';
import { useParams } from 'react-router-dom';
import Avatar from './Avatar';

const ParticipantsList: React.FC = () => {
  const { state } = useContext(RoomContext);
  const { participants, currentUser, isHost } = state;
  const { roomId } = useParams<{ roomId: string }>();

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenFor(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRemoveParticipant = async (userId: string) => {
    if (!roomId) return;
    await supabase
      .from('meetboard_participants')
      .update({ status: 'removed' })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    setMenuOpenFor(null);
  };
  
  const admittedParticipants = participants.filter(p => p.status === 'admitted');

  return (
    <div className="h-full flex flex-col bg-white/10 dark:bg-slate-900/30 backdrop-blur-xl">
      <div className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {admittedParticipants.map((p, index) => (
            <motion.li
              key={p.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-200/80 dark:hover:bg-slate-700/80"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full">
                  <Avatar name={p.name} avatarUrl={p.avatarUrl} />
                </div>
                <span className="font-medium text-sm flex items-center gap-2">
                  {p.name} {p.id === currentUser?.id && '(You)'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {/* FIX: The `title` prop is not valid on lucide-react icons. Wrapped in a span with an HTML title attribute for tooltip. */}
                {p.role === 'host' && <span title="Host"><Crown className="w-4 h-4 text-yellow-500" /></span>}
                {isHost && p.id !== currentUser?.id && (
                  <div className="relative">
                    <button onClick={() => setMenuOpenFor(menuOpenFor === p.id ? null : p.id)} className="p-1 rounded-full hover:bg-slate-300 dark:hover:bg-gray-600">
                      <MoreVertical className="w-4 h-4"/>
                    </button>
                    <AnimatePresence>
                    {menuOpenFor === p.id && (
                       <motion.div
                        ref={menuRef}
                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute top-full right-0 z-10 w-40 mt-1 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-600"
                       >
                        <button 
                          onClick={() => handleRemoveParticipant(p.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10"
                        >
                          <UserX className="w-4 h-4"/> Remove
                        </button>
                       </motion.div>
                    )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ParticipantsList;