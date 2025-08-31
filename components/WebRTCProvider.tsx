

import React, { createContext, useState, useEffect, ReactNode, useContext, useRef } from 'react';
import { RoomContext } from './RoomProvider';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

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

// Configuration for STUN and TURN servers using credentials from user guide
// FIX: Replaced the incorrect, long-lived API keys with the correct, short-lived example credentials.
// This resolves TURN server authentication failures, enabling robust connectivity for clients on restrictive networks like mobile.
const peerConnectionConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun.cloudflare.com:3478",
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp"
      ],
      username: "bc91b63e2b5d759f8eb9f3b58062439e0a0e15893d76317d833265ad08d6631099ce7c7087caabb31ad3e1c386424e3e",
      credential: "ebd71f1d3edbc2b0edae3cd5a6d82284aeb5c3b8fdaa9b8e3bf9cec683e0d45fe9f5b44e5145db3300f06c250a15b4a0"
    },
  ],
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
  };

  const handleSignal = async ({ sender_id, signal_type, payload }: { sender_id: string, signal_type: string, payload: any }) => {
    let pc = peerConnections.current.get(sender_id);
    
    if (signal_type === 'offer') {
      // FIX: Improved glare handling. Do not create a new PeerConnection if one already exists.
      // This prevents destroying a connection that is already in the process of negotiating, which would result in no audio/video.
      if (!pc) {
        pc = createPeerConnection(sender_id);
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
    }
  };
  
  // Get user's media stream and set up robust unmount cleanup
  useEffect(() => {
    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(peerConnectionConfig);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, 'ice-candidate', { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setPeerStreams(prev => new Map(prev).set(peerId, event.streams[0]));
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
            const pc = createPeerConnection(p.id);
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => sendSignal(p.id, 'offer', { sdp: pc.localDescription?.sdp }));
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
      localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
      setIsMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
      setIsCameraOn(localStream.getVideoTracks()[0].enabled);
    }
  };

  const value = { localStream, peerStreams, toggleMute, toggleCamera, isMuted, isCameraOn, leaveRoom };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
};
