// roomprovider.tsx
import React, { createContext, useReducer, Dispatch, ReactNode, useEffect, useRef } from 'react';
import { RoomState, RoomAction, Tool, BoardElement, User, Message, ParticipantStatus } from '../types';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const MAX_PARTICIPANTS = 5;

const getInitialState = (): RoomState => {
  const isDarkMode = typeof window !== 'undefined' ? localStorage.getItem('theme') !== 'light' : true;
  return {
    currentUser: null,
    participants: [],
    isHost: false,
    messages: [],
    elements: [],
    selectedElementId: null,
    history: [[]],
    historyIndex: 0,
    activeTool: Tool.Select,
    color: isDarkMode ? '#FFFFFF' : '#000000',
    strokeWidth: 5,
    isBoardVisible: true,
    isLoading: true,
    isKicked: false,
    isExiting: false,
  };
};

const roomReducer = (state: RoomState, action: RoomAction): RoomState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload };
    case 'SET_HOST':
      return { ...state, isHost: action.payload };
    case 'ADD_PARTICIPANT':
      // This acts as an "upsert": update if exists, add if not.
      if (state.participants.some(p => p.id === action.payload.id)) {
        return { ...state, participants: state.participants.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p) };
      }
      return { ...state, participants: [...state.participants, action.payload] };
    case 'REMOVE_PARTICIPANT':
      return { ...state, participants: state.participants.filter(p => p.id !== action.payload.userId) };
    case 'SET_PARTICIPANTS': {
      const newParticipants = action.payload;
      let isNowHost = state.isHost;
      if (state.currentUser) {
        const self = newParticipants.find(p => p.id === state.currentUser!.id);
        isNowHost = self?.role === 'host';
      }
      return { ...state, participants: newParticipants, isHost: isNowHost };
    }
    case 'UPDATE_PARTICIPANT': {
       return {
        ...state,
        participants: state.participants.map(p =>
            p.id === action.payload.id ? { ...p, ...action.payload } : p
        )
      };
    }
    case 'SET_TOOL':
      return { ...state, activeTool: action.payload, selectedElementId: null };
    case 'SET_COLOR':
      return { ...state, color: action.payload };
    case 'SET_STROKE_WIDTH':
      return { ...state, strokeWidth: action.payload };
    case 'ADD_ELEMENT': {
      const newElements = [...state.elements, action.payload.element];
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), newElements];
      return {
        ...state,
        elements: newElements,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedElementId: action.payload.select ? action.payload.element.id : state.selectedElementId,
        activeTool: action.payload.select ? Tool.Select : state.activeTool,
      };
    }
    case 'UPDATE_ELEMENT': {
      const newElements = state.elements.map(el => el.id === action.payload.id ? action.payload : el);
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), newElements];
      return { ...state, elements: newElements, history: newHistory, historyIndex: newHistory.length - 1 };
    }
    case 'DELETE_ELEMENT': {
      const newElements = state.elements.filter(el => el.id !== action.payload.id);
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), newElements];
      return {
        ...state,
        elements: newElements,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedElementId: state.selectedElementId === action.payload.id ? null : state.selectedElementId,
      };
    }
    case 'SET_SELECTED_ELEMENT':
      return { ...state, selectedElementId: action.payload };
    case 'UNDO': {
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        return { ...state, historyIndex: newIndex, elements: state.history[newIndex], selectedElementId: null };
      }
      return state;
    }
    case 'REDO': {
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        return { ...state, historyIndex: newIndex, elements: state.history[newIndex], selectedElementId: null };
      }
      return state;
    }
    case 'CLEAR_CANVAS': {
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), []];
      return { ...state, elements: [], history: newHistory, historyIndex: newHistory.length - 1, selectedElementId: null };
    }
    case 'SET_INITIAL_ELEMENTS': {
      return { ...state, elements: action.payload, history: [action.payload], historyIndex: 0 };
    }
    case 'SEND_MESSAGE':
       // Avoid adding duplicate messages that might come from the initial fetch + realtime
      if (state.messages.some(m => m.id === action.payload.id)) return state;
      return { ...state, messages: [...state.messages, action.payload] };
    case 'TOGGLE_BOARD_VISIBILITY':
      return { ...state, isBoardVisible: !state.isBoardVisible };
    case 'THEME_CHANGED': {
      const isDarkNow = action.payload === 'dark';
      const oldDefaultColor = isDarkNow ? '#000000' : '#FFFFFF';
      const newDefaultColor = isDarkNow ? '#FFFFFF' : '#000000';
      if (state.color === oldDefaultColor) {
        return { ...state, color: newDefaultColor };
      }
      return state;
    }
    case 'SET_KICKED':
      return { ...state, isKicked: true };
    case 'START_LEAVING':
      return { ...state, isExiting: true, isLoading: false };
    case 'LEAVE_ROOM':
        return getInitialState();
    default:
      return state;
  }
};

export const RoomContext = createContext<{
  state: RoomState;
  dispatch: Dispatch<RoomAction>;
  leaveRoom: () => Promise<void>;
}>({
  state: getInitialState(),
  dispatch: () => null,
  leaveRoom: async () => {},
});

interface RoomProviderProps {
  children: ReactNode;
  roomId: string;
}

const applyEventToState = (elements: BoardElement[], event: { event_type: string, data: any }): BoardElement[] => {
  switch (event.event_type) {
    case 'ADD_ELEMENT': return [...elements, event.data.element];
    case 'UPDATE_ELEMENT': return elements.map(el => el.id === event.data.id ? event.data : el);
    case 'DELETE_ELEMENT': return elements.filter(el => el.id !== event.data.id);
    case 'CLEAR_CANVAS': return [];
    default: return elements;
  }
};

export const RoomProvider: React.FC<RoomProviderProps> = ({ children, roomId }) => {
  const [state, dispatch] = useReducer(roomReducer, getInitialState());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const navigate = useNavigate();
  
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const settleWithTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T | 'timeout' | 'error'> => {
    try {
      return await Promise.race([
        p,
        new Promise<'timeout'>(res => setTimeout(() => res('timeout'), ms))
      ]);
    } catch (e) {
      console.warn('settleWithTimeout caught', e);
      return 'error';
    }
  };

  const leaveRoom = async (): Promise<void> => {
    console.log('[RoomProvider] leaveRoom called - START_LEAVING dispatch');
    // Freeze incoming updates immediately
    dispatch({ type: 'START_LEAVING' } as any);
  
    // 1) Remove real-time channel (timed)
    try {
      if (channelRef.current) {
        const res = await settleWithTimeout(supabase.removeChannel(channelRef.current), 2000);
        if (res === 'timeout') console.warn('[RoomProvider] removeChannel timed out');
        channelRef.current = null;
      }
    } catch (e) {
      console.warn('[RoomProvider] removeChannel error', e);
    }
  
    // 2) Remove participant row (timed)
    try {
      if (stateRef.current.currentUser) {
        const userId = stateRef.current.currentUser.id;
        // FIX: The Supabase client returns a "thenable" object, not a true Promise, which caused a type error.
        // Wrapped the Supabase call in `Promise.resolve()` to convert it into a standard Promise, satisfying the type requirement.
        // FIX: The table name was incorrect (`participants` instead of `meetboard_participants`), preventing the participant from being properly removed on leave.
        const res = await settleWithTimeout(
          Promise.resolve(supabase.from('meetboard_participants').delete().eq('user_id', userId).eq('room_id', roomId)),
          2000
        );
        if (res === 'timeout') console.warn('[RoomProvider] delete participant timed out');
      }
    } catch (e) {
      console.warn('[RoomProvider] delete participant error', e);
    }
  
    // The LEAVE_ROOM dispatch is removed. Navigating away will unmount this provider,
    // and the state will be naturally reset when the user joins a new room.
    // This prevents a race condition where the UI unmounts before navigation completes.
    console.log('[RoomProvider] leaveRoom finished');
  };


  useEffect(() => {
    if (!state.currentUser?.id) return;

    let mounted = true;

    const initializeAndSubscribe = async () => {
      if (stateRef.current.isExiting) {
        console.log('[RoomProvider] initializeAndSubscribe aborted because isExiting is true');
        return;
      }
      dispatch({ type: 'SET_LOADING', payload: true });
      const userId = state.currentUser!.id;

      // Check if room is full
      const { data: participantsData, error: countError } = await supabase
        .from('meetboard_participants')
        .select('user_id, status')
        .eq('room_id', roomId);

      if (countError) {
        console.error("Error checking room capacity", countError);
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      const admittedCount = participantsData.filter(p => p.status === 'admitted').length;
      const isAlreadyAdmitted = participantsData.some(p => p.user_id === userId && p.status === 'admitted');

      if (admittedCount >= MAX_PARTICIPANTS && !isAlreadyAdmitted) {
        if(mounted) navigate('/leaving', { state: { message: "This room is full." } });
        return;
      }
      
      const { name } = state.currentUser!;
      const dummyEmail = `${userId}@meetboard.app`;
      const { error: userUpsertError } = await supabase.from('profiles').upsert(
        { id: userId, full_name: name, username: name.toLowerCase().replace(/\s+/g, '') },
        { onConflict: 'id' }
      );

      if (userUpsertError) {
        console.error("Fatal: Could not save user profile.", userUpsertError);
        dispatch({ type: 'SET_LOADING', payload: false });
        return;
      }

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
      }
      const channel = supabase.channel(roomId);
      channelRef.current = channel;

      channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meetboard_participants', filter: `room_id=eq.${roomId}` }, async (payload) => {
          if (!mounted || stateRef.current.isExiting) return;
          
          console.debug('participants realtime event', payload);
          switch (payload.eventType) {
            case 'INSERT':
            case 'UPDATE': {
              const participantData = payload.new as { user_id: string; status: ParticipantStatus; role: string };
              const { user_id, status, role } = participantData;

              if (payload.eventType === 'UPDATE' && user_id === stateRef.current.currentUser?.id && (status === 'removed' || status === 'denied')) {
                dispatch({ type: 'SET_KICKED' });
                return;
              }
              // FIX: Make handler more robust. If profile lookup fails (e.g., replication lag),
              // still add the participant with a placeholder name so the admission request appears for the host.
              const { data: user } = await supabase.from('profiles').select('id, full_name, avatar_url').eq('id', user_id).single();
              dispatch({ type: 'ADD_PARTICIPANT', payload: { 
                  id: user_id, 
                  name: user?.full_name || 'New User', 
                  avatarUrl: user?.avatar_url, 
                  status, 
                  role 
              } });
              break;
            }
            case 'DELETE': {
              const oldParticipantData = payload.old as { user_id: string };
              if (oldParticipantData?.user_id) {
                 dispatch({ type: 'REMOVE_PARTICIPANT', payload: { userId: oldParticipantData.user_id } });
              }
              break;
            }
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetboard_whiteboard_events', filter: `room_id=eq.${roomId}` }, (payload) => {
          if (!mounted || payload.new.user_id === stateRef.current.currentUser?.id || stateRef.current.isExiting) return;
          dispatch({ type: payload.new.event_type, payload: payload.new.data });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'meetboard_messages', filter: `room_id=eq.${roomId}` }, async (payload) => {
          if (!mounted || payload.new.user_id === stateRef.current.currentUser?.id || stateRef.current.isExiting) return;
          const { data: user } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', payload.new.user_id).single();
          dispatch({ type: 'SEND_MESSAGE', payload: { id: payload.new.id.toString(), userId: payload.new.user_id, userName: user?.full_name || 'Unknown', avatarUrl: user?.avatar_url, content: payload.new.content, timestamp: payload.new.created_at } });
        })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED' || !mounted) {
            return;
          }

          const { data: roomDataArray } = await supabase.from('meetboard_rooms').select('id, host_id').eq('id', roomId);
          const roomData = roomDataArray && roomDataArray.length > 0 ? roomDataArray[0] : null;
          const isHost = !roomData || roomData.host_id === null || roomData.host_id === userId;

          const { data: myParticipantDataArray } = await supabase.from('meetboard_participants').select('status').eq('room_id', roomId).eq('user_id', userId);
          const myParticipantData = myParticipantDataArray && myParticipantDataArray.length > 0 ? myParticipantDataArray[0] : null;
          
          if (myParticipantData && ['removed', 'denied'].includes(myParticipantData.status)) {
            navigate('/leaving', { state: { message: "You cannot rejoin this meeting." } });
            return;
          }

          const participantStatus = myParticipantData?.status ?? (isHost ? 'admitted' : 'pending');
          const participantRole = isHost ? 'host' : 'participant';
          
          const userForState: User = { ...state.currentUser!, role: participantRole, status: participantStatus };
          dispatch({ type: 'SET_HOST', payload: isHost });
          dispatch({ type: 'SET_CURRENT_USER', payload: userForState });

          if (isHost && (!roomData || roomData.host_id !== userId)) {
             await supabase.from('meetboard_rooms').upsert({ id: roomId, name: `Room ${roomId}`, creator_id: userId, host_id: userId }, { onConflict: 'id' });
          }

          // FIX: The upsert call was malformed, preventing guests from creating their 'pending' request.
          // This has been corrected to upsert the proper participant data.
          const { error: upsertErr } = await supabase.from('meetboard_participants').upsert(
            {
                user_id: userId,
                room_id: roomId,
                status: participantStatus,
                role: participantRole
            },
            { onConflict: 'user_id,room_id' }
          );
          if (upsertErr) {
              console.error('Error upserting participant:', upsertErr);
          }
          // FIX: Corrected the Supabase join syntax from 'user:profiles' to the standard 'profiles'.
          // This ensures participant profiles are fetched correctly on initial load.
          const [
            participantsRes,
            messagesRes,
            eventsRes
          ] = await Promise.all([
            supabase.from('meetboard_participants').select('status, role, profiles(id, full_name, avatar_url)').eq('room_id', roomId),
            supabase.from('meetboard_messages').select('*, profiles(full_name, avatar_url)').eq('room_id', roomId).order('created_at'),
            supabase.from('meetboard_whiteboard_events').select('*').eq('room_id', roomId).order('created_at')
          ]);
          
          if (!mounted) return;
          
          if (participantsRes.error) console.error('Error fetching participants:', participantsRes.error);
          if (messagesRes.error) console.error('Error fetching messages:', messagesRes.error);
          if (eventsRes.error) console.error('Error fetching whiteboard events:', eventsRes.error);
          
          let users: User[] = [];
          if (participantsRes.data) {
            users = participantsRes.data
              .map((p): User | null => {
                // FIX: Map from 'p.profiles' which is the correct property name after fixing the query.
                const rawUser = p.profiles;
                if (!rawUser) {
                  return null;
                }
                const userObj = Array.isArray(rawUser) ? rawUser[0] : rawUser;
                if (!userObj || !userObj.id) {
                  return null;
                }
                return {
                  id: userObj.id,
                  name: userObj.full_name || '?',
                  avatarUrl: userObj.avatar_url,
                  status: p.status as ParticipantStatus,
                  role: p.role,
                };
              })
              .filter((u): u is User => u !== null);
          }
    
          if (stateRef.current.currentUser && !users.some(u => u.id === stateRef.current.currentUser!.id)) {
            const currentUser = stateRef.current.currentUser;
            users.push({
              id: currentUser.id,
              name: currentUser.name,
              avatarUrl: currentUser.avatarUrl,
              status: (currentUser.status as ParticipantStatus) || 'admitted',
              role: currentUser.role || 'participant',
            });
          }
          dispatch({ type: 'SET_PARTICIPANTS', payload: users });


          if (messagesRes.data) {
            messagesRes.data.forEach(msg => {
              // FIX: Map from 'msg.profiles' to get the joined user data correctly.
              const userProfile = (msg.profiles && (Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles)) as { full_name: string, avatar_url?: string } | null;
              const userName = userProfile?.full_name || 'Unknown';
              const avatarUrl = userProfile?.avatar_url;
              dispatch({ type: 'SEND_MESSAGE', payload: { id: msg.id.toString(), userId: msg.user_id, userName, avatarUrl, content: msg.content, timestamp: msg.created_at } });
            });
          }

          if (eventsRes.data) {
            dispatch({ type: 'SET_INITIAL_ELEMENTS', payload: eventsRes.data.reduce(applyEventToState, []) });
          }
          
          dispatch({ type: 'SET_LOADING', payload: false });
        });
    };

    initializeAndSubscribe().catch(err => {
        console.error('Initialization error:', err);
        if(mounted) dispatch({ type: 'SET_LOADING', payload: false });
    });

    return () => {
      mounted = false;
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).then(() => {
            channelRef.current = null;
        });
      }

      if (stateRef.current.currentUser) {
        supabase
          .from('meetboard_participants')
          .delete()
          .eq('user_id', stateRef.current.currentUser.id)
          .eq('room_id', roomId)
          .then(({ error }) => {
            if (error) console.error("Error removing participant on unmount:", error);
          });
      }
    };
  }, [roomId, state.currentUser?.id, navigate]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      dispatch({ type: 'THEME_CHANGED', payload: (event as CustomEvent).detail.theme });
    };
    window.addEventListener('themeChanged', handleThemeChange);
    return () => window.removeEventListener('themeChanged', handleThemeChange);
  }, []);

  const dispatchAndBroadcast: Dispatch<RoomAction> = async (action) => {
    dispatch(action);
    if (!stateRef.current.currentUser) return;
    const { id: user_id } = stateRef.current.currentUser;
    try {
      switch (action.type) {
        case 'ADD_ELEMENT':
        case 'UPDATE_ELEMENT':
        case 'DELETE_ELEMENT':
          await supabase.from('meetboard_whiteboard_events').insert({ room_id: roomId, user_id, event_type: action.type, data: action.payload });
          break;
        case 'UNDO':
        case 'REDO':
        case 'CLEAR_CANVAS':
          await supabase.from('meetboard_whiteboard_events').insert({ room_id: roomId, user_id, event_type: action.type, data: {} });
          break;
        case 'SEND_MESSAGE':
          await supabase.from('meetboard_messages').insert({ room_id: roomId, user_id, content: action.payload.content });
          break;
      }
    } catch (error) {
      console.error('Supabase dispatch error:', error);
    }
  };

  return (
    <RoomContext.Provider value={{ state, dispatch: dispatchAndBroadcast, leaveRoom }}>
      {children}
    </RoomContext.Provider>
  );
};