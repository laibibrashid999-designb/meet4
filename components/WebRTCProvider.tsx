

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

  useEffect(() => {
    if (!currentUser) return;
    const currentPeerIds = new Set(participants.map(p => p.id));
    peerConnections.current.forEach((pc, peerId) => {
      if (!currentPeerIds.has(peerId) && peerId !== currentUser.id) {
        console.log(`[WebRTC] Cleaning up connection for removed participant ${peerId}`);
        pc.close();
        peerConnections.current.delete(peerId);
        setPeerStreams(prev => {
          const newMap = new Map(prev);
          newMap.delete(peerId);
          return newMap;
        });
      }
    });
  }, [participants, currentUser?.id]);
  
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
  // Queue for outgoing signals until channel is ready
  const isChannelReady = useRef(false);
  const outgoingSignalQueue = useRef<{ receiver_id: string; signal_type: string; payload: any }[]>([]);
  // Queue for incoming ICE candidates per peer until remoteDescription is set
  const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Helper to flush pending ICE candidates once remoteDescription is set
  const flushPendingIceCandidates = async (peerId: string, pc: RTCPeerConnection) => {
    try {
      const queued = pendingIceCandidates.current.get(peerId);
      if (queued && pc.remoteDescription) {
        console.log(`[WebRTC] 🧊 Flushing ${queued.length} queued ICE candidates for ${peerId}`);
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            console.error(`[WebRTC] ❌ Error adding queued ICE candidate for ${peerId}:`, e);
          }
        }
        pendingIceCandidates.current.delete(peerId);
      }
    } catch (e) {
      console.error(`[WebRTC] ❌ Error flushing ICE candidates for ${peerId}:`, e);
    }
  };

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
    console.log(`[WebRTC] 🔄 Processing signal from ${sender_id}: ${signal_type}`);
    console.log(`[WebRTC] 📊 Current connections:`, Array.from(peerConnections.current.keys()));
    console.log(`[WebRTC] 📺 Current streams:`, Array.from(peerStreams.keys()));
    
    let pc = peerConnections.current.get(sender_id);
    
    if (signal_type === 'offer') {
      console.log(`[WebRTC] 📥 Processing offer from ${sender_id}`);
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
      console.log(`[WebRTC] ✅ Set remote description for ${sender_id}`);
      // Flush any queued ICE candidates now that remote description is set
      await flushPendingIceCandidates(sender_id, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(`[WebRTC] 📤 Sending answer to ${sender_id}`);
      sendSignal(sender_id, 'answer', { sdp: answer.sdp });
    } else if (signal_type === 'answer' && pc) {
      console.log(`[WebRTC] 📥 Processing answer from ${sender_id}`);
      await pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: payload.sdp}));
      console.log(`[WebRTC] ✅ Set remote description (answer) for ${sender_id}`);
      // Flush any queued ICE candidates now that remote description is set
      await flushPendingIceCandidates(sender_id, pc);
    } else if (signal_type === 'ice-candidate') {
      // Always handle candidate messages, even if pc hasn't been created yet
      const candidateInit: RTCIceCandidateInit | undefined = payload?.candidate;
      if (!candidateInit) {
        console.warn(`[WebRTC] ⚠️ ICE candidate payload missing from ${sender_id}`);
        return;
      }
      if (!pc) {
        console.warn(`[WebRTC] 🧊 No PeerConnection yet for ${sender_id}. Queueing ICE candidate.`);
        const arr = pendingIceCandidates.current.get(sender_id) || [];
        arr.push(candidateInit);
        pendingIceCandidates.current.set(sender_id, arr);
        return;
      }
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
          console.log(`[WebRTC] ✅ Added ICE candidate from ${sender_id}`);
        } else {
          // Queue until remote description is set
          console.warn(`[WebRTC] 🧊 Remote description not set yet for ${sender_id}. Queueing ICE candidate.`);
          const arr = pendingIceCandidates.current.get(sender_id) || [];
          arr.push(candidateInit);
          pendingIceCandidates.current.set(sender_id, arr);
        }
      } catch (e) {
        console.error(`[WebRTC] ❌ Error adding ICE candidate from ${sender_id}:`, e);
      }
    } else if (signal_type === 'connection-failed' && pc) {
      console.log(`[WebRTC] Received connection failed signal from ${sender_id}, attempting reconnection`);
      await attemptReconnection(sender_id);
    }
  };
  
  // Get user's media stream and set up robust unmount cleanup
  useEffect(() => {
    const startMedia = async () => {
      if (!currentUser?.id || !roomId) {
        console.log('[WebRTC] Waiting for user and room initialization...');
        return;
      }

      const mobile = isMobile();
      console.log(`[WebRTC] 📱 Device detected: ${mobile ? 'Mobile' : 'Desktop'}`);
      console.log(`[WebRTC] 🌐 User Agent:`, navigator.userAgent);
      console.log(`[WebRTC] Starting media for ${mobile ? 'mobile' : 'desktop'} device`);
      
      // Define mobile-friendly constraints with fallbacks
      const getConstraints = (attempt: number) => {
        console.log(`[WebRTC] 📋 Getting constraints for ${mobile ? 'mobile' : 'desktop'} attempt ${attempt + 1}`);
        if (mobile) {
          // Mobile constraints with progressive fallbacks
          switch (attempt) {
            case 0: // First attempt - moderate quality
              return {
                video: {
                  width: { ideal: 640, max: 1280 },
                  height: { ideal: 480, max: 720 },
                  frameRate: { ideal: 15, max: 30 },
                  facingMode: 'user'
                },
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              };
            case 1: // Second attempt - lower quality
              return {
                video: {
                  width: { ideal: 480, max: 640 },
                  height: { ideal: 360, max: 480 },
                  frameRate: { ideal: 15, max: 24 }
                },
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true
                }
              };
            case 2: // Third attempt - basic quality
              return {
                video: {
                  width: { ideal: 320, max: 480 },
                  height: { ideal: 240, max: 360 },
                  frameRate: { ideal: 10, max: 15 }
                },
                audio: true
              };
            default: // Final attempt - audio only
              return {
                video: false,
                audio: true
              };
          }
        } else {
          // Desktop constraints with fallbacks
          switch (attempt) {
            case 0: // First attempt - high quality
              return {
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
            case 1: // Second attempt - medium quality
              return {
                video: {
                  width: { ideal: 640, max: 1280 },
                  height: { ideal: 480, max: 720 },
                  frameRate: { ideal: 24, max: 30 }
                },
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              };
            case 2: // Third attempt - basic quality
              return {
                video: {
                  width: { ideal: 480, max: 640 },
                  height: { ideal: 360, max: 480 },
                  frameRate: { ideal: 15, max: 24 }
                },
                audio: true
              };
            default: // Final attempt - audio only
              return {
                video: false,
                audio: true
              };
          }
        }
      };

      // Try getUserMedia with progressive fallbacks
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const constraints = getConstraints(attempt);
          console.log(`[WebRTC] 🎯 Attempt ${attempt + 1} with constraints:`, constraints);
          
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log(`[WebRTC] ✅ ${mobile ? 'Mobile' : 'Desktop'} stream created successfully!`);
          
          // Log successful stream info
          const videoTracks = stream.getVideoTracks();
          const audioTracks = stream.getAudioTracks();
          console.log(`[WebRTC] 📺 Stream details:`, {
            id: stream.id,
            videoTracks: videoTracks.length,
            audioTracks: audioTracks.length,
            active: stream.active,
            deviceType: mobile ? 'mobile' : 'desktop'
          });
          
          if (videoTracks.length > 0) {
            const settings = videoTracks[0].getSettings();
            console.log(`[WebRTC] Video settings:`, settings);
          }
          
          localStreamRef.current = stream;
          isStreamReady.current = true;
          
          // Set initial track states
          if (audioTracks.length > 0) {
            audioTracks[0].enabled = !isMuted;
          }
          if (videoTracks.length > 0) {
            videoTracks[0].enabled = isCameraOn;
          }
          
          console.log(`[WebRTC] 🎬 Setting local stream for ${mobile ? 'mobile' : 'desktop'} device`);
          setLocalStream(stream);

          // Now that the stream is ready, process any queued signals
          console.log(`[WebRTC] 📤 Processing ${signalQueue.current.length} queued signals`);
          signalQueue.current.forEach(signalPayload => handleSignal(signalPayload));
          signalQueue.current = []; // Clear the queue
          
          return; // Success, exit the retry loop
          
        } catch (error) {
          console.error(`[WebRTC] Attempt ${attempt + 1} failed:`, error);
          
          if (attempt === 3) {
            // All attempts failed
            console.error('[WebRTC] All getUserMedia attempts failed. User may need to grant permissions or check device availability.');
            // Still set isStreamReady to process queued signals even without media
            isStreamReady.current = true;
            signalQueue.current.forEach(signalPayload => handleSignal(signalPayload));
            signalQueue.current = [];
          }
        }
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
  }, [currentUser?.id, roomId]); // Re-run when user or room changes

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
    if (!currentUser) return;
    const channel = channelRef.current;
    if (!channel || !isChannelReady.current) {
      console.warn('[WebRTC] ⏳ Channel not ready. Queueing outgoing signal:', signal_type);
      outgoingSignalQueue.current.push({ receiver_id, signal_type, payload });
      return;
    }
    await channel.send({
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
    isChannelReady.current = false;

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

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('[WebRTC] ✅ Signaling channel subscribed');
        isChannelReady.current = true;
        // Flush any queued outgoing signals
        if (outgoingSignalQueue.current.length > 0) {
          console.log(`[WebRTC] 📤 Flushing ${outgoingSignalQueue.current.length} queued outgoing signals`);
          outgoingSignalQueue.current.forEach(({ receiver_id, signal_type, payload }) => {
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { sender_id: currentUser.id, receiver_id, signal_type, payload }
            });
          });
          outgoingSignalQueue.current = [];
        }
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      isChannelReady.current = false;
    };
  }, [currentUser?.id, roomId]);

  const createPeerConnection = async (peerId: string): Promise<RTCPeerConnection> => {
    try {
      const config = await getPeerConnectionConfig();
      const pc = new RTCPeerConnection(config);
      
      console.log(`[WebRTC] Creating peer connection for ${peerId} with config:`, {
        iceServers: config.iceServers?.map(server => ({ urls: server.urls })),
        iceTransportPolicy: config.iceTransportPolicy
      });
      
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // FIX: Send plain JSON candidate instead of RTCIceCandidate object
          const jsonCandidate = typeof event.candidate.toJSON === 'function'
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                usernameFragment: (event.candidate as any).usernameFragment,
              };
          console.log(`[WebRTC] Sending ICE candidate to ${peerId}:`, jsonCandidate.candidate);
          sendSignal(peerId, 'ice-candidate', { candidate: jsonCandidate });
        } else {
          console.log(`[WebRTC] ICE gathering complete for ${peerId}`);
        }
      };

      pc.ontrack = (event) => {
        console.log(`[WebRTC] 📺 Received ${event.track.kind} track from ${peerId}`);
        console.log(`[WebRTC] 📺 Track details:`, {
          id: event.track.id,
          kind: event.track.kind,
          readyState: event.track.readyState,
          enabled: event.track.enabled,
          muted: event.track.muted
        });
        
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          console.log(`[WebRTC] 🎬 Adding stream for ${peerId}:`, {
            streamId: stream.id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            active: stream.active
          });
          
          setPeerStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.set(peerId, stream);
            console.log(`[WebRTC] 📊 Updated peer streams:`, Array.from(newStreams.keys()));
            return newStreams;
          });
        } else {
          console.warn(`[WebRTC] ⚠️ No streams received with track from ${peerId}`);
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE connection state for ${peerId}:`, pc.iceConnectionState);
        
        switch (pc.iceConnectionState) {
          case 'failed':
          case 'disconnected':
            console.log(`[WebRTC] Connection ${pc.iceConnectionState} for ${peerId}, attempting reconnection`);
            // Add a small delay before reconnection to avoid rapid retries
            setTimeout(() => {
              if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                sendSignal(peerId, 'connection-failed', {});
              }
            }, 2000);
            break;
          case 'connected':
          case 'completed':
            console.log(`[WebRTC] Successfully connected to ${peerId}`);
            connectionAttempts.current.set(peerId, 0);
            break;
        }
      };
      
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state for ${peerId}:`, pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          // Reset connection attempts on successful connection
          connectionAttempts.current.set(peerId, 0);
        } else if (pc.connectionState === 'failed') {
          console.log(`[WebRTC] Peer connection failed for ${peerId}`);
          // Remove failed connection from streams
          setPeerStreams(prev => {
            const newStreams = new Map(prev);
            newStreams.delete(peerId);
            return newStreams;
          });
        }
      };

      // Add error handling for the peer connection
      pc.onerror = (error) => {
        console.error(`[WebRTC] Peer connection error for ${peerId}:`, error);
      };

      // Add local stream tracks if available
      if (localStreamRef.current) {
        try {
          localStreamRef.current.getTracks().forEach(track => {
            const sender = pc.addTrack(track, localStreamRef.current!);
            console.log(`[WebRTC] Added ${track.kind} track to peer connection for ${peerId}`, {
              trackId: track.id,
              enabled: track.enabled,
              sender: sender.track?.id
            });
          });
        } catch (error) {
          console.error(`[WebRTC] Error adding tracks to peer connection for ${peerId}:`, error);
        }
      } else {
        console.warn(`[WebRTC] No local stream available when creating peer connection for ${peerId}`);
      }

      peerConnections.current.set(peerId, pc);
      return pc;
      
    } catch (error) {
      console.error(`[WebRTC] Error creating peer connection for ${peerId}:`, error);
      throw error;
    }
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
        console.log(`[WebRTC] Audio ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      } else {
        console.warn('[WebRTC] No audio track available to toggle');
      }
    } else {
      console.warn('[WebRTC] No local stream available to toggle audio');
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
        console.log(`[WebRTC] Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      } else {
        console.warn('[WebRTC] No video track available to toggle (may be audio-only mode)');
        // In audio-only mode, we still update the state for UI consistency
        setIsCameraOn(!isCameraOn);
      }
    } else {
      console.warn('[WebRTC] No local stream available to toggle video');
    }
  };

  const value = { localStream, peerStreams, toggleMute, toggleCamera, isMuted, isCameraOn, leaveRoom };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
};
