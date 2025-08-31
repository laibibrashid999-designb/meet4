import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Trash2, Check, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { BoardElement, TextElement } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  element: BoardElement;
  onDelete: (id: string) => void;
  onUpdateElement: (element: BoardElement) => void;
  onClose: () => void;
}

const stickyNoteColors = ['#FFF9B1', '#FFC3C3', '#C3E5FF', '#D4FFC3'];
const fontFamilies = ['Poppins', 'Arial', 'Courier New', 'Georgia', 'Times New Roman'];

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, element, onDelete, onUpdateElement, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu if clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);
  
  const handleColorChange = (color: string) => {
    if (element && element.type === 'note') {
      onUpdateElement({ ...element, color });
      onClose();
    }
  };

  const handlePropertyChange = (property: keyof TextElement, value: any) => {
    if (element.type === 'text') {
      onUpdateElement({ ...element, [property]: value });
    }
  };

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.1 }}
      className="fixed z-50 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700"
      style={{ top: y, left: x }}
    >
      <ul className="p-1">
        <li>
          <button
            onClick={() => onDelete(element.id)}
            className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </li>
        {element.type === 'note' && (
          <>
            <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
            <li className="px-3 pt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Color</li>
            <li>
              <div className="flex items-center justify-around px-2 py-1.5">
                {stickyNoteColors.map(c => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(c)}
                    className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center"
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {element.color === c && <Check className="w-4 h-4 text-gray-700" />}
                  </button>
                ))}
              </div>
            </li>
          </>
        )}
        {element.type === 'text' && (
          <>
            <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
            <li className="px-3 pt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Text Options</li>
            <li className="p-1 space-y-2">
              <div className="flex items-center justify-between gap-2 px-2">
                  <label className="text-sm text-gray-600 dark:text-gray-300">Size</label>
                  <input 
                    type="number" 
                    value={element.fontSize} 
                    onChange={e => handlePropertyChange('fontSize', parseInt(e.target.value, 10) || 16)}
                    className="w-20 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
              </div>
               <div className="flex items-center justify-between gap-2 px-2">
                  <label className="text-sm text-gray-600 dark:text-gray-300">Font</label>
                  <select 
                    value={element.fontFamily} 
                    onChange={e => handlePropertyChange('fontFamily', e.target.value)}
                    className="w-28 text-sm px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ fontFamily: element.fontFamily }}
                  >
                    {fontFamilies.map(font => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}
                  </select>
              </div>
               <div className="flex items-center justify-between gap-2 px-2">
                   <label className="text-sm text-gray-600 dark:text-gray-300">Align</label>
                  <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-md p-0.5">
                    <button onClick={() => handlePropertyChange('textAlign', 'left')} className={`p-1 rounded ${element.textAlign === 'left' ? 'bg-primary text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}><AlignLeft className="w-4 h-4"/></button>
                    <button onClick={() => handlePropertyChange('textAlign', 'center')} className={`p-1 rounded ${element.textAlign === 'center' ? 'bg-primary text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}><AlignCenter className="w-4 h-4"/></button>
                    <button onClick={() => handlePropertyChange('textAlign', 'right')} className={`p-1 rounded ${element.textAlign === 'right' ? 'bg-primary text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}><AlignRight className="w-4 h-4"/></button>
                  </div>
              </div>
            </li>
          </>
        )}
      </ul>
    </motion.div>
  );
};

export default ContextMenu;