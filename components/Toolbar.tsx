import React, { useState, useContext, useRef } from 'react';
import { Tool, ImageElement } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Pen, Circle, Square, Minus, ArrowRight, Type, Eraser, Image as ImageIcon, Trash2, Sticker, Hand, Undo, Redo, MousePointer2 } from 'lucide-react';
import { RoomContext } from './RoomProvider';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const tools = [
  { id: Tool.Select, icon: MousePointer2, label: 'Select (V)' },
  { id: Tool.Hand, icon: Hand, label: 'Pan (H)' },
  { id: Tool.Pen, icon: Pen, label: 'Pen (P)' },
  { id: Tool.Eraser, icon: Eraser, label: 'Eraser (E)' },
  { id: Tool.StickyNote, icon: Sticker, label: 'Sticky Note (S)' },
  { id: Tool.Rectangle, icon: Square, label: 'Rectangle (R)' },
  { id: Tool.Circle, icon: Circle, label: 'Circle (C)' },
  { id: Tool.Text, icon: Type, label: 'Text (T)' },
];

const colors = ['#FFFFFF', '#000000', '#ef4444', '#f97316', '#eab308', '#84cc16', '#3b82f6', '#d946ef'];

const Toolbar: React.FC = () => {
  const { state, dispatch } = useContext(RoomContext);
  const { activeTool, color, strokeWidth } = state;

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokeWidth, setShowStrokeWidth] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = `${uuidv4()}-${file.name}`;
    const { data, error } = await supabase.storage
      .from('meetboard_images')
      .upload(fileName, file);

    if (error) {
      console.error('Error uploading image:', error);
      // TODO: Show a proper error message to the user
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('meetboard_images')
      .getPublicUrl(data.path);

    // Get image dimensions to place it on the canvas with its original size
    const img = new Image();
    img.onload = () => {
        const newImageElement: ImageElement = {
            id: uuidv4(),
            type: 'image',
            src: publicUrl,
            x: 200, // A default position, user can move it
            y: 200,
            width: img.width > 500 ? 500 : img.width, // Set a max width to avoid huge images
            height: img.width > 500 ? (500/img.width) * img.height : img.height
        };
        dispatch({ type: 'ADD_ELEMENT', payload: { element: newImageElement, select: true } });
    };
    img.src = URL.createObjectURL(file);
    
    // Reset file input so the same file can be uploaded again
    if(imageInputRef.current) {
        imageInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-1 md:gap-2 p-1 md:p-2 bg-white/30 dark:bg-slate-900/50 backdrop-blur-lg border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl overflow-x-auto">
      {tools.map(tool => (
        <button
          key={tool.id}
          title={tool.label}
          onClick={() => dispatch({ type: 'SET_TOOL', payload: tool.id })}
          className={`p-1.5 md:p-2 rounded-md flex-shrink-0 ${activeTool === tool.id ? 'bg-primary text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'}`}
        >
          <tool.icon className="w-4 h-4 md:w-5 md:h-5" />
        </button>
      ))}
      <div className="w-px h-6 md:h-8 bg-slate-300 dark:bg-slate-600 mx-1 md:mx-2"></div>
      
      {/* Color Picker */}
      <div className="relative">
        <button 
          onClick={() => setShowColorPicker(!showColorPicker)} 
          className="w-7 h-7 md:w-8 md:h-8 rounded-full border-2 border-slate-300 dark:border-slate-500" 
          style={{ backgroundColor: color }}
          title="Select Color"
        />
        <AnimatePresence>
          {showColorPicker && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute bottom-12 left-0 z-10 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg flex flex-wrap gap-2 w-40"
            >
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => { dispatch({ type: 'SET_COLOR', payload: c }); setShowColorPicker(false); }}
                  className={`w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 ${color === c ? 'ring-2 ring-offset-2 ring-primary dark:ring-offset-slate-800' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input type="color" value={color} onChange={(e) => dispatch({ type: 'SET_COLOR', payload: e.target.value })} className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stroke Width */}
       <div className="relative">
        <button 
            onClick={() => setShowStrokeWidth(!showStrokeWidth)} 
            className="p-1.5 md:p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
            title="Adjust Stroke Width"
        >
            <div className="flex items-center justify-center w-4 h-4 md:w-5 md:h-5">
                <div className="rounded-full bg-current" style={{width: strokeWidth/1.5, height: strokeWidth/1.5, maxWidth: '20px', maxHeight: '20px'}}></div>
            </div>
        </button>
         <AnimatePresence>
            {showStrokeWidth && (
                 <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-12 left-0 z-10 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md shadow-lg"
                 >
                    <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        value={strokeWidth}
                        onChange={(e) => dispatch({ type: 'SET_STROKE_WIDTH', payload: parseInt(e.target.value) })}
                        className="w-24"
                    />
                 </motion.div>
            )}
        </AnimatePresence>
       </div>
       <div className="w-px h-6 md:h-8 bg-slate-300 dark:bg-slate-600 mx-1 md:mx-2"></div>

       <input
           type="file"
           ref={imageInputRef}
           onChange={handleImageUpload}
           accept="image/png, image/jpeg, image/gif"
           className="hidden"
        />
       <button onClick={() => imageInputRef.current?.click()} className="p-1.5 md:p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Upload Image">
           <ImageIcon className="w-4 h-4 md:w-5 md:h-5"/>
       </button>
       <div className="w-px h-6 md:h-8 bg-slate-300 dark:bg-slate-600 mx-1 md:mx-2"></div>
       <button onClick={() => dispatch({ type: 'UNDO' })} className="p-1.5 md:p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Undo (Ctrl+Z)"><Undo className="w-4 h-4 md:w-5 md:h-5"/></button>
       <button onClick={() => dispatch({ type: 'REDO' })} className="p-1.5 md:p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Redo (Ctrl+Y)"><Redo className="w-4 h-4 md:w-5 md:h-5"/></button>
    </div>
  );
};

export default Toolbar;