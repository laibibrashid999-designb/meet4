
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';

const LeavingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const message = location.state?.message || "You have left the meeting";

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <motion.div
        className="text-center p-8 bg-white/30 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-300 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-md"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <LogOut className="mx-auto h-16 w-16 text-primary mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {message}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Thank you for using Meetboard by Prodai.
        </p>
        <motion.button
          onClick={() => navigate('/')}
          className="px-6 py-3 font-semibold text-white bg-primary rounded-lg shadow-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-hover dark:focus:ring-offset-gray-800"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Create or Join Another Meeting
        </motion.button>
      </motion.div>
    </div>
  );
};

export default LeavingPage;