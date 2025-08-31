

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MicOff, Volume2, VolumeX, Volume1 } from 'lucide-react';
import Avatar from './Avatar';

interface VideoStreamProps {
  stream: MediaStream;
  isMuted: boolean;
  isCameraOn: boolean;
  isLocal: boolean;
  name: string;
  avatarUrl?: string;
  onClick: () => void;
}

const VideoStream: React.FC<VideoStreamProps> = ({ stream, isMuted, isCameraOn, isLocal, name, avatarUrl, onClick }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1); // 1 is 100%

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      if (!isLocal) {
        videoRef.current.volume = volume;
      }
    }
  }, [stream, volume, isLocal]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const getVolumeIcon = () => {
    if (isLocal) return null;
    if (volume === 0) return <VolumeX className="w-5 h-5 text-white" />;
    if (volume < 0.5) return <Volume1 className="w-5 h-5 text-white" />;
    return <Volume2 className="w-5 h-5 text-white" />;
  };

  return (
    <div 
        className={`relative group w-full h-full bg-slate-800 dark:bg-slate-700 rounded-lg overflow-hidden shadow-lg border-2 transition-colors cursor-pointer ${isMuted ? 'border-red-500' : 'border-transparent'}`}
        onClick={onClick}
    >
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`w-full h-full object-cover transition-opacity duration-300 ${isCameraOn ? 'opacity-100' : 'opacity-0'}`} />
      
      {!isCameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800 dark:bg-slate-700">
           <div className="w-16 h-16 text-2xl">
                <Avatar name={name} avatarUrl={avatarUrl} />
           </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-white text-xs md:text-sm font-medium drop-shadow-md">{name} {isLocal && '(You)'}</span>
        {!isLocal && (
             <motion.div 
                className="relative flex items-center"
                onClick={(e) => e.stopPropagation()}
             >
                <div className="p-1">{getVolumeIcon()}</div>
                <div className="absolute right-full mr-2 w-24 origin-right">
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
             </motion.div>
        )}
      </div>

       {isMuted && (
        <div className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full">
            <MicOff className="w-4 h-4 text-white" />
        </div>
      )}
    </div>
  );
};

export default VideoStream;
