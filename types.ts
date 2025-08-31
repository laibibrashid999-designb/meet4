export type ParticipantStatus = 'pending' | 'admitted' | 'denied' | 'removed';

export interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  status?: ParticipantStatus;
  role?: string;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  content: string;
  timestamp: string;
}

export enum Tool {
  Select = 'select',
  Hand = 'hand',
  Pen = 'pen',
  Eraser = 'eraser',
  Rectangle = 'rectangle',
  Circle = 'circle',
  Line = 'line',
  Arrow = 'arrow',
  Text = 'text',
  StickyNote = 'stickynote',
}

export interface Point {
  x: number;
  y: number;
}

export interface PathElement {
  id: string;
  type: 'path';
  points: Point[];
  color: string;
  strokeWidth: number;
}

export interface StickyNoteElement {
  id:string;
  type: 'note';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
}

export interface ImageElement {
    id: string;
    type: 'image';
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RectangleElement {
  id: string;
  type: 'rectangle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}

export interface CircleElement {
  id: string;
  type: 'circle';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
}

export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  textAlign: 'left' | 'center' | 'right';
}

export type BoardElement = PathElement | StickyNoteElement | ImageElement | RectangleElement | CircleElement | TextElement;


// Types for RoomContext state management
export interface RoomState {
  currentUser: User | null;
  participants: User[];
  isHost: boolean;
  messages: Message[];
  elements: BoardElement[];
  selectedElementId: string | null;
  history: BoardElement[][];
  historyIndex: number;
  activeTool: Tool;
  color: string;
  strokeWidth: number;
  isBoardVisible: boolean;
  isLoading: boolean;
  isKicked: boolean;
  isExiting: boolean;
}

export type RoomAction =
  | { type: 'SET_CURRENT_USER'; payload: User }
  | { type: 'SET_HOST'; payload: boolean }
  | { type: 'ADD_PARTICIPANT'; payload: User }
  | { type: 'REMOVE_PARTICIPANT'; payload: { userId: string } }
  | { type: 'SET_PARTICIPANTS'; payload: User[] }
  | { type: 'UPDATE_PARTICIPANT'; payload: Partial<User> & { id: string } }
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'SET_COLOR'; payload: string }
  | { type: 'SET_STROKE_WIDTH'; payload: number }
  | { type: 'ADD_ELEMENT'; payload: { element: BoardElement, select: boolean } }
  | { type: 'UPDATE_ELEMENT'; payload: BoardElement }
  | { type: 'DELETE_ELEMENT'; payload: { id: string } }
  | { type: 'SET_SELECTED_ELEMENT'; payload: string | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'SET_INITIAL_ELEMENTS'; payload: BoardElement[] }
  | { type: 'SEND_MESSAGE'; payload: Message }
  | { type: 'TOGGLE_BOARD_VISIBILITY' }
  | { type: 'THEME_CHANGED'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_KICKED' }
  | { type: 'START_LEAVING' }
  | { type: 'LEAVE_ROOM' };