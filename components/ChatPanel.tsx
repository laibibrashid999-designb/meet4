
import React, { useState, useEffect, useRef, useContext } from 'react';
import { Message } from '../types';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { RoomContext } from './RoomProvider';
import Avatar from './Avatar';

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  // Format to something like "10:32pm"
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
};

interface ChatPanelProps {
  roomId: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ roomId }) => {
  const { state, dispatch } = useContext(RoomContext);
  const { messages, currentUser } = state;

  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && currentUser) {
      const message: Message = {
        id: new Date().getTime().toString(),
        userId: currentUser.id,
        userName: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
        content: newMessage.trim(),
        timestamp: new Date().toISOString(),
      };
      dispatch({ type: 'SEND_MESSAGE', payload: message });
      setNewMessage('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100/30 dark:bg-slate-900/50 backdrop-blur-xl">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => {
          if (!currentUser) return null;
          const isCurrentUser = msg.userId === currentUser.id;
          const prevMessage = messages[index - 1];
          const isSameSenderAsPrev = prevMessage && prevMessage.userId === msg.userId;
          const timeSincePrev = prevMessage ? new Date(msg.timestamp).getTime() - new Date(prevMessage.timestamp).getTime() : Infinity;
          
          // Show avatar and name if it's a new sender or if 5 minutes have passed
          const showHeader = !isSameSenderAsPrev || timeSincePrev > 5 * 60 * 1000;

          return (
            <motion.div
              key={msg.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-3 ${isCurrentUser ? 'flex-row-reverse' : ''}`}
            >
              <div className="w-8 h-8 rounded-full shrink-0">
                {showHeader && (
                  <Avatar name={msg.userName || '?'} avatarUrl={msg.avatarUrl} />
                )}
              </div>
              <div className={`flex flex-col gap-1 ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                {showHeader && (
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                    {msg.userName || 'Unknown User'}
                  </p>
                )}
                <div
                  className={`max-w-xs px-3 py-2 rounded-xl flex items-end gap-2 ${
                    isCurrentUser 
                      ? 'bg-primary text-white rounded-br-none' 
                      : 'bg-white dark:bg-slate-700 rounded-bl-none shadow-sm'
                  }`}
                >
                  <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                  <span className="text-[10px] text-white/70 dark:text-gray-300/70 select-none flex-shrink-0">
                    {formatTimestamp(msg.timestamp)}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="p-2 border-t border-slate-300 dark:border-slate-700 flex items-center gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-800 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          className="p-2 text-white bg-primary rounded-full hover:bg-primary-hover disabled:opacity-50 disabled:scale-100 transition-transform active:scale-95"
          disabled={!newMessage.trim()}
          aria-label="Send message"
        >
            <Send className="w-5 h-5"/>
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;