

import React, { useContext, useState } from 'react';
import { WebRTCContext } from './WebRTCProvider';
import { RoomContext } from './RoomProvider';
import { AnimatePresence, motion } from 'framer-motion';
import VideoStream from './VideoStream';

const VideoGrid: React.FC = () => {
  const { localStream, peerStreams, isMuted: isLocalMuted, isCameraOn: isLocalCameraOn } = useContext(WebRTCContext);
  const { state } = useContext(RoomContext);
  const { participants, currentUser, isBoardVisible } = state;
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);

  if (!currentUser) return null;

  const allStreams = new Map<string, MediaStream>();
  if (localStream) {
    allStreams.set(currentUser.id, localStream);
  }
  peerStreams.forEach((stream, peerId) => {
    allStreams.set(peerId, stream);
  });
  
  const admittedParticipants = participants.filter(p => p.status === 'admitted');
  const participantStreams = admittedParticipants
    .map(p => ({
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        stream: allStreams.get(p.id),
        isLocal: p.id === currentUser.id,
        isMuted: p.id === currentUser.id ? isLocalMuted : false, // In a real app, peer mute state would be synced
        isCameraOn: p.id === currentUser.id ? isLocalCameraOn : true, // In a real app, peer camera state would be synced
    }))
    .filter(p => p.stream);

  const handleVideoStreamClick = (id: string) => {
    setFocusedStreamId(prevId => (prevId === id ? null : id));
  };
  
  if (isBoardVisible) {
    return (
      <motion.div layout className="fixed top-16 left-0 right-0 z-20 h-[100px] p-2 flex items-center gap-2 overflow-x-auto md:grid md:h-auto md:w-48 md:top-20 md:left-2 md:right-auto md:overflow-x-visible md:p-2">
        {participantStreams.map(p => (
           <motion.div layout="position" key={p.id} className="h-full aspect-video flex-shrink-0 md:w-full md:h-auto md:aspect-auto">
              <VideoStream 
                  stream={p.stream!}
                  isMuted={p.isMuted}
                  isCameraOn={p.isCameraOn}
                  isLocal={p.isLocal}
                  name={p.name}
                  avatarUrl={p.avatarUrl}
                  onClick={() => {}}
              />
          </motion.div>
        ))}
      </motion.div>
    );
  }

  const focusedParticipant = focusedStreamId ? participantStreams.find(p => p.id === focusedStreamId) : null;
  const thumbnailParticipants = focusedStreamId ? participantStreams.filter(p => p.id !== focusedStreamId) : participantStreams;

  if (focusedParticipant) {
     return (
        <div className="absolute inset-0 w-full h-full flex flex-col p-2 md:p-4 gap-2 md:gap-4 items-center justify-center">
            <motion.div layoutId={`video-${focusedParticipant.id}`} className="w-full h-full max-w-6xl max-h-full flex-1">
                <VideoStream 
                  stream={focusedParticipant.stream!}
                  isMuted={focusedParticipant.isMuted}
                  isCameraOn={focusedParticipant.isCameraOn}
                  isLocal={focusedParticipant.isLocal}
                  name={focusedParticipant.name}
                  avatarUrl={focusedParticipant.avatarUrl}
                  onClick={() => handleVideoStreamClick(focusedParticipant.id)}
                />
            </motion.div>
            <div className="h-24 md:h-32 flex justify-center gap-2 md:gap-4">
                 <AnimatePresence>
                {thumbnailParticipants.map(p => (
                    <motion.div layoutId={`video-${p.id}`} key={p.id} className="h-full aspect-video">
                        <VideoStream 
                          stream={p.stream!}
                          isMuted={p.isMuted}
                          isCameraOn={p.isCameraOn}
                          isLocal={p.isLocal}
                          name={p.name}
                          avatarUrl={p.avatarUrl}
                          onClick={() => handleVideoStreamClick(p.id)}
                        />
                    </motion.div>
                ))}
                </AnimatePresence>
            </div>
        </div>
     );
  }
  
  const numStreams = participantStreams.length;
  const gridClasses = 
    numStreams <= 1 ? 'grid-cols-1' :
    numStreams <= 4 ? 'grid-cols-2' :
    numStreams <= 6 ? 'grid-cols-3' : 'grid-cols-3 md:grid-cols-4';


  return (
    <motion.div layout className={`absolute inset-0 w-full h-full p-2 md:p-4 grid gap-2 md:gap-4 ${gridClasses} content-center`}>
        {participantStreams.map(p => (
             <motion.div layoutId={`video-${p.id}`} key={p.id}>
                <VideoStream 
                    stream={p.stream!}
                    isMuted={p.isMuted}
                    isCameraOn={p.isCameraOn}
                    isLocal={p.isLocal}
                    name={p.name}
                    avatarUrl={p.avatarUrl}
                    onClick={() => handleVideoStreamClick(p.id)}
                />
            </motion.div>
          ))}
    </motion.div>
  );
};

export default VideoGrid;
