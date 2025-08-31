
import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const Modal: React.FC<ModalProps> = ({ onClose, title, children }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 flex justify-between items-center border-b border-slate-300 dark:border-slate-700">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="p-6">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Modal;