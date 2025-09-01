
import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sketchboard from '../components/Sketchboard';
import Toolbar from '../components/Toolbar';
import VideoGrid from '../components/VideoGrid';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, Share2, CheckCircle, Loader, PanelRight, Users } from 'lucide-react';
import { RoomProvider, RoomContext } from '../components/RoomProvider';
import { WebRTCProvider, WebRTCContext } from '../components/WebRTCProvider';
import MediaControls from '../components/MediaControls';
import { getCurrentUser } from '../lib/user';
import WaitingRoom from '../components/WaitingRoom';
import AdmissionModal from '../components/AdmissionModal';
import { User } from '../types';
import SidePanel from '../components/SidePanel';
import Modal from '../components/Modal';

const RoomPageContent: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { state, dispatch, leaveRoom } = useContext(RoomContext);
  const { leaveRoom: leaveWebRTCRoom } = useContext(WebRTCContext);
  const { isLoading, isBoardVisible, currentUser, isHost, participants, isKicked, isExiting } = state;

  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [admissionRequests, setAdmissionRequests] = useState<User[]>([]);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/');
        return;
      }
      
      // Only dispatch if currentUser is not set or if the user ID has changed
      if (!currentUser || currentUser.id !== user.id) {
        dispatch({ type: 'SET_CURRENT_USER', payload: user });
      }
    };
    
    if (!currentUser) {
      loadUser();
    }
  }, [dispatch, navigate, currentUser]);

  useEffect(() => {
    if (isHost) {
      const requests = participants.filter(p => p.status === 'pending');
      setAdmissionRequests(requests);
    }
  }, [participants, isHost]);

  useEffect(() => {
    if (isKicked) {
      const message = participants.length >= 5 ? "This room is full." : "You've been removed from the meeting.";
      navigate('/leaving', { state: { message } });
    }
  }, [isKicked, navigate, participants.length]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConfirmAndGoHome = async () => {
    console.log('[RoomPage] Going home - starting cleanup sequence');
    
    // Immediately start the leaving process
    dispatch({ type: 'START_LEAVING' });
    
    let forced = false;
    const timer = setTimeout(() => {
        forced = true;
        console.log('[RoomPage] Forced navigation home after 3s timeout');
        navigate('/', { replace: true });
    }, 3000);

    try { 
      console.log('[RoomPage] Starting WebRTC cleanup...');
      await Promise.race([leaveWebRTCRoom?.(), new Promise(res => setTimeout(res, 2500))]); 
      console.log('[RoomPage] ✓ WebRTC cleanup completed');
    } catch (e) { 
      console.warn('[RoomPage] WebRTC cleanup error:', e);
    }
    
    try { 
      console.log('[RoomPage] Starting Room cleanup...');
      await Promise.race([leaveRoom?.(), new Promise(res => setTimeout(res, 2500))]); 
      console.log('[RoomPage] ✓ Room cleanup completed');
    } catch (e) { 
      console.warn('[RoomPage] Room cleanup error:', e);
    }

    if (!forced) {
        clearTimeout(timer);
        console.log('[RoomPage] ✓ All cleanup completed, navigating home...');
        navigate('/', { replace: true });
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-gray-900 dark:text-gray-100">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg font-semibold">Connecting to room...</p>
        </div>
      </div>
    );
  }

  const isAdmitted = currentUser && participants.find(p => p.id === currentUser.id)?.status === 'admitted';

  if (!isAdmitted && !isHost) {
    return <WaitingRoom />;
  }
  
  const admittedParticipantCount = participants.filter(p => p.status === 'admitted').length;
  const pendingParticipantCount = participants.filter(p => p.status === 'pending').length;


  return (
    <>
      {admissionRequests.map(user => (
        <AdmissionModal key={user.id} user={user} roomId={roomId!} currentParticipantCount={admittedParticipantCount}/>
      ))}
     <div className="flex h-screen w-screen overflow-hidden text-gray-900 dark:text-gray-100">
      <main className="flex-1 flex flex-col relative">
        <header className="absolute top-0 left-0 right-0 z-40 flex justify-between items-start p-2 pointer-events-none">
            <div className="flex items-center gap-2 p-1 md:p-1.5 bg-white/30 dark:bg-slate-900/50 backdrop-blur-lg border border-slate-300 dark:border-slate-700 rounded-lg shadow-md pointer-events-auto">
                <button onClick={() => setShowHomeConfirm(true)} className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-md" title="Go Home"><Home className="h-5 w-5"/></button>
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
                <div className="px-2 text-left">
                    <h1 className="text-xs text-gray-500 dark:text-gray-400">ROOM CODE</h1>
                    <p className="text-sm font-semibold font-mono tracking-wide">{roomId}</p>
                </div>
                <div className="w-px h-6 bg-slate-300 dark:bg-slate-600"></div>
                <div className="relative">
                  <button onClick={handleShare} className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-md" title="Copy Room Link">
                    {copied ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Share2 className="h-5 w-5"/>}
                  </button>
                  <AnimatePresence>
                    {copied && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-secondary text-white text-xs font-semibold rounded-md shadow-lg whitespace-nowrap"
                      >
                        Link Copied!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
                 <button onClick={() => setIsSidePanelOpen(!isSidePanelOpen)} className="p-2 bg-white/30 dark:bg-slate-800/50 backdrop-blur-lg border border-slate-300 dark:border-slate-700 hover:bg-white/50 dark:hover:bg-slate-700/80 rounded-full shadow-lg relative" title="Toggle Panel">
                    <Users className="h-5 w-5 md:hidden" />
                    <PanelRight className="h-5 w-5 hidden md:block" />
                    {pendingParticipantCount > 0 && isHost && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-white text-xs rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
                        {pendingParticipantCount}
                      </div>
                    )}
                </button>
            </div>
        </header>
       
        <VideoGrid />

        <AnimatePresence>
            {isBoardVisible && (
                <motion.div
                    className="absolute inset-0 z-10"
                    initial={{ y: '100%' }}
                    animate={{ y: '0%' }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                    <Sketchboard />
                </motion.div>
            )}
        </AnimatePresence>
        
        <div className="fixed bottom-0 left-0 right-0 md:absolute md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:w-auto z-50 p-2 flex flex-col items-center gap-2 pointer-events-none">
            <AnimatePresence>
            {isBoardVisible && (
                <motion.div
                    className="pointer-events-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                    <Toolbar />
                </motion.div>
            )}
            </AnimatePresence>
            <div className="pointer-events-auto">
               <MediaControls />
            </div>
        </div>

      </main>

      <AnimatePresence>
        {isSidePanelOpen && (
            <>
                 {/* Mobile backdrop */}
                <motion.div
                    key="backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 z-40 md:hidden"
                    onClick={() => setIsSidePanelOpen(false)}
                />
                {/* Panel for both mobile and desktop */}
                <motion.div
                    key="panel-content"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="fixed top-0 right-0 w-full max-w-sm h-full z-50 md:relative md:w-80 md:h-screen md:max-w-none"
                >
                    <SidePanel roomId={roomId || 'default'} onClose={() => setIsSidePanelOpen(false)} />
                </motion.div>
            </>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showHomeConfirm && (
            <Modal onClose={() => setShowHomeConfirm(false)} title="Leave Meeting?">
                <p className="text-gray-600 dark:text-gray-300">Are you sure you want to leave the meeting and return to the homepage?</p>
                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={() => setShowHomeConfirm(false)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50" disabled={isExiting}>Cancel</button>
                    <button onClick={handleConfirmAndGoHome} className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 w-28 flex items-center justify-center disabled:bg-red-400" disabled={isExiting}>
                        {isExiting ? <Loader className="w-5 h-5 animate-spin" /> : 'Leave'}
                    </button>
                </div>
            </Modal>
        )}
    </AnimatePresence>
    </div>
    </>
  );
}

const RoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <RoomProvider roomId={roomId || 'default-room'}>
      <WebRTCProvider roomId={roomId || 'default-room'}>
        <RoomPageContent />
      </WebRTCProvider>
    </RoomProvider>
  );
};

export default RoomPage;
