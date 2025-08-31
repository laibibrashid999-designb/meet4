
import React from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

const WaitingRoom: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-gray-900 dark:text-gray-100 p-4">
      <motion.div
        className="text-center p-8 bg-white/30 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
            <Clock className="mx-auto h-16 w-16 text-primary mb-4" />
        </motion.div>
        
        <h1 className="text-3xl font-bold mb-2">
          Waiting to join...
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          You'll be let in once the host approves your request.
        </p>
      </motion.div>
    </div>
  );
};

export default WaitingRoom;