

import React, { createContext, useState, useEffect, ReactNode, useContext, useRef } from 'react';
import { RoomContext } from './RoomProvider';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { turnCredentialManager } from '../lib/turnCredentials';

// The shape of the context
interface WebRTCContextType {
  localStream: MediaStream | null;
  peerStreams: Map<string, MediaStream>;
  toggleMute: () => void;
  toggleCamera: () => void;
  isMuted: boolean;
  isCameraOn: boolean;
  leaveRoom: () => Promise<void>;
}

// Create the context
export const WebRTCContext = createContext<WebRTCContextType>({
  localStream: null,
  peerStreams: new Map(),
  toggleMute: () => {},
  toggleCamera: () => {},
  isMuted: false,
  isCameraOn: true,
  leaveRoom: async () => {},
});

interface WebRTCProviderProps {
  children: ReactNode;
  roomId: string;
}

// Detect if user is on mobile for enhanced TURN usage
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
};

// Get peer connection configuration with fresh TURN credentials
const getPeerConnectionConfig = async (): Promise<RTCConfiguration> => {
  const iceServers = await turnCredentialManager.getICEServers();
  
  return {
    iceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: isMobile() ? 'relay' : 'all', // Force TURN on mobile
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };
};

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({ children, roomId }) => {
  const { state } = useContext(RoomContext);
  const { currentUser, participants } = state;
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Map<string, MediaStream>>(new Map());
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);

  const signalQueue = useRef<any[]>([]);
  const isStreamReady = useRef(false);
  const connectionAttempts = useRef<Map<string, number>>(new Map());

  const leaveRoom = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    
    peerConnections.current.forEach(pc => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.onsignalingstatechange = null;
        pc.onicegatheringstatechange = null;
        pc.onnegotiationneeded = null;

        if (pc.signalingState !== 'closed') {
          pc.close();
        }
      } catch (e) {
        console.warn('Error closing peer connection', e);
      }
    });
    peerConnections.current.clear();
    setPeerStreams(new Map());

    if (channelRef.current) {
        try {
            await supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        } catch (e) {
            console.warn('Error removing signaling channel', e);
        }
    }
    
    // Reset connection attempts
    connectionAttempts.current.clear();
  };

  const handleSignal = async ({ sender_id, signal_type, payload }: { sender_id: string, signal_type: string, payload: any }) => {
    let pc = peerConnections.current.get(sender_id);
    
    if (signal_type === 'offer') {
      // FIX: Improved glare handling. Do not create a new PeerConnection if one already exists.
      // This prevents destroying a connection that is already in the process of negotiating, which would result in no audio/video.
      if (!pc) {
        pc = await createPeerConnection(sender_id);
      } else {
        console.warn(`[WebRTC] Received offer, but a connection already exists for ${sender_id}. State: ${pc.signalingState}`);
        // Simple glare resolution: The peer with the smaller ID is the initiator and their offer takes precedence.
        // If we are the initiator, we ignore the incoming offer from the other peer to let our original offer complete.
        const amInitiator = currentUser!.id < sender_id;
        if (amInitiator && pc.signalingState !== 'stable') {
          console.log(`[WebRTC] Glare detected. As initiator, ignoring incoming offer from ${sender_id}.`);
          return;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription({type: 'offer', sdp: payload.sdp}));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(sender_id, 'answer', { sdp: answer.sdp });
    } else if (signal_type === 'answer' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: payload.sdp}));
    } else if (signal_type === 'ice-candidate' && pc) {
      try {
        // FIX: Add candidate only if remoteDescription is set, to avoid errors during connection setup.
        if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (e) {
        console.error('Error adding received ice candidate', e);
      }
    } else if (signal_type === 'connection-failed' && pc) {
      console.log(`[WebRTC] Received connection failed signal from ${sender_id}, attempting reconnection`);
      await attemptReconnection(sender_id);
    }
  };
  
  // Get user's media stream and set up robust unmount cleanup
  useEffect(() => {
    const startMedia = async () => {
      try {
        const constraints = {
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000
          }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        isStreamReady.current = true;
        stream.getAudioTracks()[0].enabled = !isMuted;
        stream.getVideoTracks()[0].enabled = isCameraOn;
        setLocalStream(stream);

        // Now that the stream is ready, process any queued signals
        signalQueue.current.forEach(signalPayload => handleSignal(signalPayload));
        signalQueue.current = []; // Clear the queue

      } catch (error) {
        console.error("Error accessing media devices.", error);
      }
    };
    startMedia();
    
    return () => {
      // This cleanup runs when the component unmounts for any reason (leaving, kicked, etc.).
      console.log("WebRTCProvider unmounting, cleaning up all resources...");
      isStreamReady.current = false;
      
      // Stop local stream tracks to turn off camera/mic
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Close all active peer connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
    };
  }, []); // This effect should only run once on mount

  const attemptReconnection = async (peerId: string) => {
    const attempts = connectionAttempts.current.get(peerId) || 0;
    if (attempts >= 3) {
      console.log(`[WebRTC] Max reconnection attempts reached for ${peerId}`);
      return;
    }
    
    connectionAttempts.current.set(peerId, attempts + 1);
    
    // Close existing connection
    const existingPc = peerConnections.current.get(peerId);
    if (existingPc) {
      existingPc.close();
      peerConnections.current.delete(peerId);
    }
    
    // Create new connection and initiate offer
    if (currentUser!.id < peerId) {
      const pc = await createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(peerId, 'offer', { sdp: offer.sdp });
    }
  };
  const sendSignal = async (receiver_id: string, signal_type: string, payload: any) => {
    if (!currentUser || !channelRef.current) return;
    await channelRef.current.send({
      type: 'broadcast',
      event: 'signal',
      payload: { sender_id: currentUser.id, receiver_id, signal_type, payload }
    });
  };

  // 2. Setup Signaling Listener
  useEffect(() => {
    if (!currentUser || !roomId) return;
    
    const channel = supabase.channel(`webrtc-${roomId}`);
    channelRef.current = channel;

    const handleBroadcast = ({ payload }: { payload: any }) => {
      if (payload.receiver_id === currentUser.id) {
        if (isStreamReady.current) {
          handleSignal(payload);
        } else {
          // If stream is not ready, queue the signal to be processed later
          signalQueue.current.push(payload);
        }
      }
    };

    channel.on('broadcast', { event: 'signal' }, handleBroadcast);
    channel.subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentUser?.id, roomId]);

  const createPeerConnection = async (peerId: string): Promise<RTCPeerConnection> => {
    const config = await getPeerConnectionConfig();
    const pc = new RTCPeerConnection(config);
    
    console.log(`[WebRTC] Creating peer connection for ${peerId} with config:`, {
      iceServers: config.iceServers?.map(server => ({ urls: server.urls })),
      iceTransportPolicy: config.iceTransportPolicy
    });
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] Sending ICE candidate to ${peerId}:`, event.candidate.type);
        sendSignal(peerId, 'ice-candidate', { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${peerId}:`, event.track.kind);
      setPeerStreams(prev => new Map(prev).set(peerId, event.streams[0]));
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state for ${peerId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log(`[WebRTC] Connection failed for ${peerId}, signaling for reconnection`);
        sendSignal(peerId, 'connection-failed', {});
      }
    };
    
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state for ${peerId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        // Reset connection attempts on successful connection
        connectionAttempts.current.set(peerId, 0);
      }
    };

    // Use the ref, which is guaranteed to be available because of the queueing logic
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

    peerConnections.current.set(peerId, pc);
    return pc;
  };

  useEffect(() => {
    if (!localStream || !currentUser || !participants) return;
    
    const admittedParticipants = participants.filter(p => p.id !== currentUser.id && p.status === 'admitted');

    // Connect to new participants
    admittedParticipants.forEach(p => {
      if (!peerConnections.current.has(p.id)) {
        // Simple "politeness" check to avoid both peers creating an offer at the same time (glare)
        if (currentUser.id < p.id) {
            createPeerConnection(p.id).then(pc => {
              return pc.createOffer();
            }).then(offer => {
              const pc = peerConnections.current.get(p.id);
              if (pc) {
                return pc.setLocalDescription(offer);
              }
            }).then(() => {
              const pc = peerConnections.current.get(p.id);
              if (pc && pc.localDescription) {
                sendSignal(p.id, 'offer', { sdp: pc.localDescription.sdp });
              }
            }).catch(error => {
              console.error(`[WebRTC] Error creating offer for ${p.id}:`, error);
            });
        }
      }
    });

    // Clean up disconnected peers
    peerConnections.current.forEach((pc, peerId) => {
      if (!admittedParticipants.some(p => p.id === peerId)) {
        pc.close();
        peerConnections.current.delete(peerId);
        setPeerStreams(prev => {
          const newStreams = new Map(prev);
          newStreams.delete(peerId);
          return newStreams;
        });
      }
    });

  }, [participants, localStream, currentUser]);

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const value = { localStream, peerStreams, toggleMute, toggleCamera, isMuted, isCameraOn, leaveRoom };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
};
