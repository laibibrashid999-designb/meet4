import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { StickyNoteElement } from '../types';

interface StickyNoteProps {
  data: StickyNoteElement;
  onUpdate: (data: StickyNoteElement) => void;
  isSelected: boolean;
}

const StickyNote: React.FC<StickyNoteProps> = ({ data, onUpdate, isSelected }) => {
  const [text, setText] = useState(data.text);

  useEffect(() => {
    setText(data.text);
  }, [data.text]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };
  
  const handleBlur = () => {
    if (text !== data.text) {
        onUpdate({ ...data, text });
    }
  };

  return (
    <motion.div
      style={{
        width: data.width,
        height: data.height,
        x: data.x,
        y: data.y,
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundColor: data.color || '#ffc'
      }}
      className={`p-4 dark:text-gray-900 shadow-lg rounded-md ${isSelected ? 'sticky-note-selected ring-2 ring-blue-500' : ''}`}
    >
      <textarea
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        className="w-full h-full bg-transparent resize-none border-none focus:outline-none p-0 font-sans"
        placeholder="Type here..."
        readOnly={!isSelected}
      />
    </motion.div>
  );
};

export default StickyNote;