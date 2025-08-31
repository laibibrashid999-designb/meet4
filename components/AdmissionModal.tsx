
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '../types';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const MAX_PARTICIPANTS = 5;

interface AdmissionModalProps {
  user: User;
  roomId: string;
  currentParticipantCount: number;
}

const AdmissionModal: React.FC<AdmissionModalProps> = ({ user, roomId, currentParticipantCount }) => {
  
  const isRoomFull = currentParticipantCount >= MAX_PARTICIPANTS;

  const handleAdmission = async (admit: boolean) => {
    if (admit && isRoomFull) return;

    const newStatus = admit ? 'admitted' : 'denied';
    await supabase
      .from('meetboard_participants')
      .update({ status: newStatus })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  };

  return (
    <AnimatePresence>
       <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50, transition: {duration: 0.2} }}
        className="fixed top-20 md:bottom-20 md:top-auto left-1/2 -translate-x-1/2 z-[100] p-4 bg-white/50 dark:bg-slate-900/80 backdrop-blur-lg rounded-xl shadow-2xl border border-slate-300 dark:border-slate-700 flex items-center gap-4"
       >
        <div className="w-10 h-10 rounded-full">
            <Avatar name={user.name} avatarUrl={user.avatarUrl} />
        </div>
        <div>
            <p className="font-semibold">{user.name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">wants to join the meeting.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => handleAdmission(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500"
            >
                Deny
            </button>
            <button 
                onClick={() => handleAdmission(true)}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary-hover disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={isRoomFull}
                title={isRoomFull ? "Room is full" : "Admit user"}
            >
                Admit
            </button>
        </div>
       </motion.div>
    </AnimatePresence>
  );
};

export default AdmissionModal;
