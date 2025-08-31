
import React, { useState } from 'react';
import ChatPanel from './ChatPanel';
import ParticipantsList from './ParticipantsList';
import { MessageSquare, Users, X } from 'lucide-react';

interface SidePanelProps {
    roomId: string;
    onClose: () => void;
}

type ActiveTab = 'chat' | 'participants';

const SidePanel: React.FC<SidePanelProps> = ({ roomId, onClose }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('participants');
    
    return (
        <div className="h-full flex flex-col bg-slate-100 dark:bg-slate-900 md:bg-white/30 md:dark:bg-slate-900/50 md:backdrop-blur-lg md:shadow-lg md:rounded-l-xl md:border-l md:border-t md:border-b md:border-slate-300 md:dark:border-slate-700">
            <header className="flex-shrink-0">
                 <div className="flex justify-between items-center p-3 border-b border-slate-300 dark:border-slate-700 md:hidden">
                    <h2 className="font-bold text-lg">Panel</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800">
                        <X className="w-5 h-5"/>
                    </button>
                </div>
                <div className="flex border-b border-slate-300 dark:border-slate-700">
                    <button 
                        onClick={() => setActiveTab('participants')}
                        className={`flex-1 p-3 font-semibold text-sm flex items-center justify-center gap-2 ${activeTab === 'participants' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                    >
                        <Users className="w-5 h-5"/> Participants
                    </button>
                    <button 
                        onClick={() => setActiveTab('chat')}
                        className={`flex-1 p-3 font-semibold text-sm flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 dark:text-gray-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                    >
                        <MessageSquare className="w-5 h-5"/> Chat
                    </button>
                </div>
            </header>
            
            <main className="flex-1 min-h-0">
                {activeTab === 'participants' && <ParticipantsList />}
                {activeTab === 'chat' && <ChatPanel roomId={roomId} />}
            </main>
        </div>
    );
};

export default SidePanel;
