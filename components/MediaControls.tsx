
import React, { useContext } from 'react';
import { WebRTCContext } from './WebRTCProvider';
import { Mic, MicOff, Video, VideoOff, PhoneOff, PanelTopClose, PanelTopOpen, Loader } from 'lucide-react';
import { RoomContext } from './RoomProvider';
import { useNavigate } from 'react-router-dom';

const MediaControls: React.FC = () => {
  const { isMuted, isCameraOn, toggleMute, toggleCamera, leaveRoom: leaveRoomFromWebRTC } = useContext(WebRTCContext);
  const { state, dispatch, leaveRoom } = useContext(RoomContext);
  const { isBoardVisible, isExiting } = state;
  const navigate = useNavigate();
  
  const handleLeaveRoom = async () => {
    console.log('[MediaControls] Leave button clicked - starting cleanup sequence');
    
    // Immediately start the leaving process to prevent UI interactions
    dispatch({ type: 'START_LEAVING' });
    
    let forced = false;
    const timer = setTimeout(() => {
      forced = true;
      console.log('[MediaControls] Forced navigation after 3s timeout');
      navigate('/leaving', { state: { message: "You have left the meeting." }, replace: true });
    }, 3000);
  
    try { 
      console.log('[MediaControls] Starting WebRTC cleanup...');
      await Promise.race([leaveRoomFromWebRTC?.(), new Promise(res => setTimeout(res, 2500))]); 
      console.log('[MediaControls] ✓ WebRTC cleanup completed');
    } catch(e) {
      console.warn('[MediaControls] WebRTC cleanup error:', e);
    }
    
    try { 
      console.log('[MediaControls] Starting Room cleanup...');
      await Promise.race([leaveRoom?.(), new Promise(res => setTimeout(res, 2500))]); 
      console.log('[MediaControls] ✓ Room cleanup completed');
    } catch(e) {
      console.warn('[MediaControls] Room cleanup error:', e);
    }
  
    if (!forced) {
      clearTimeout(timer);
      console.log('[MediaControls] ✓ All cleanup completed, navigating...');
      navigate('/leaving', { state: { message: "You have left the meeting." }, replace: true });
    }
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-white/30 dark:bg-slate-900/50 backdrop-blur-lg rounded-full shadow-xl border border-slate-300 dark:border-slate-700">
      <button
        onClick={toggleMute}
        disabled={isExiting}
        className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600/80'} disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>
      <button
        onClick={toggleCamera}
        disabled={isExiting}
        className={`p-3 rounded-full transition-colors ${!isCameraOn ? 'bg-red-500 text-white' : 'bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600/80'} disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
      >
        {isCameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>
      <button
        onClick={() => dispatch({ type: 'TOGGLE_BOARD_VISIBILITY' })}
        disabled={isExiting}
        className="p-3 rounded-full bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300 dark:hover:bg-slate-600/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title={isBoardVisible ? 'Hide Board' : 'Show Board'}
      >
        {isBoardVisible ? <PanelTopClose className="w-5 h-5" /> : <PanelTopOpen className="w-5 h-5" />}
      </button>
      <div className="w-px h-8 bg-slate-300 dark:bg-slate-600"></div>
       <button
        onClick={handleLeaveRoom}
        disabled={isExiting}
        className={`p-3 rounded-full transition-colors w-[44px] h-[44px] flex items-center justify-center ${isExiting ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}
        title="Leave Room"
      >
        {isExiting ? <Loader className="w-5 h-5 animate-spin"/> : <PhoneOff className="w-5 h-5" />}
      </button>
    </div>
  );
};

export default MediaControls;