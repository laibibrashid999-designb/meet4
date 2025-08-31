import React, { useRef, useEffect, useState, useCallback, useContext } from 'react';
import { Tool, Point, StickyNoteElement, BoardElement, PathElement, RectangleElement, CircleElement, ImageElement, TextElement } from '../types';
import { v4 as uuidv4 } from 'uuid';
import StickyNote from './StickyNote';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from './Modal';
import { RoomContext } from './RoomProvider';
import ContextMenu from './ContextMenu';
import { ZoomIn, ZoomOut } from 'lucide-react';

type Action = 'none' | 'drawing' | 'panning' | 'moving' | 'resizing';
type ResizeHandle = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'top' | 'bottom' | 'left' | 'right';

// --- Helper Functions ---
const getElementBounds = (element: BoardElement): { x: number; y: number; width: number; height: number } => {
    if (element.type === 'note' || element.type === 'image' || element.type === 'rectangle' || element.type === 'circle' || element.type === 'text') {
        return { x: element.x, y: element.y, width: element.width, height: element.height };
    }
    if (element.type === 'path') {
        if (element.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        element.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
};

const isPointInBounds = (point: Point, bounds: { x: number; y: number; width: number; height: number }): boolean => {
    return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
    );
};

const distanceToSegment = (p: Point, v: Point, w: Point): number => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return Math.sqrt((p.x - projection.x) ** 2 + (p.y - projection.y) ** 2);
};

const isPointNearPath = (point: Point, path: PathElement): boolean => {
    const threshold = path.strokeWidth / 2 + 5;
    for (let i = 0; i < path.points.length - 1; i++) {
        if (distanceToSegment(point, path.points[i], path.points[i + 1]) < threshold) {
            return true;
        }
    }
    return false;
};

const TextElementComponent: React.FC<{
  data: TextElement;
  onUpdate: (data: TextElement) => void;
  isSelected: boolean;
}> = ({ data, onUpdate, isSelected }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    const newText = contentRef.current?.innerText || '';
    const newHeight = contentRef.current?.offsetHeight || data.height;
    if (newText !== data.text || newHeight !== data.height) {
      onUpdate({ ...data, text: newText, height: newHeight });
    }
    setIsEditing(false);
  };
  
  const handleDoubleClick = () => {
      if (isSelected) {
          setIsEditing(true);
          setTimeout(() => contentRef.current?.focus(), 0);
      }
  }
  
  // Auto-enter edit mode for newly created text elements
  useEffect(() => {
    if(isSelected && data.text === "Type something...") {
        setIsEditing(true);
        setTimeout(() => {
            if (contentRef.current) {
                contentRef.current.focus();
                document.execCommand('selectAll', false, undefined);
            }
        }, 0);
    }
  }, [isSelected, data.text]);

  const styles: React.CSSProperties = {
    color: data.color,
    fontSize: `${data.fontSize}px`,
    fontFamily: data.fontFamily,
    textAlign: data.textAlign,
    width: data.width,
    minHeight: data.height,
    lineHeight: 1.3,
    outline: 'none',
    cursor: isEditing ? 'text' : 'default',
  };

  return (
    <motion.div
      style={{
        width: data.width,
        height: 'auto',
        x: data.x,
        y: data.y,
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'all',
      }}
      className={`whitespace-pre-wrap break-words p-1 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-transparent' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={contentRef}
        contentEditable={isEditing && isSelected}
        onBlur={handleBlur}
        style={styles}
        dangerouslySetInnerHTML={{ __html: data.text }}
        suppressContentEditableWarning
      />
    </motion.div>
  );
};


const Sketchboard: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { state, dispatch } = useContext(RoomContext);
    const { activeTool, color, strokeWidth, elements, selectedElementId } = state;

    const [action, setAction] = useState<Action>('none');
    const [startPoint, setStartPoint] = useState<Point>({ x: 0, y: 0 });
    const [currentElement, setCurrentElement] = useState<BoardElement | null>(null);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
    const lastPointRef = useRef<Point | null>(null);
    const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
    const [cursor, setCursor] = useState('auto');

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; elementId: string | null }>({ visible: false, x: 0, y: 0, elementId: null });
    
    const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map());

    // Preload images
    useEffect(() => {
        const imageElements = elements.filter(el => el.type === 'image') as ImageElement[];
        imageElements.forEach(el => {
            if (el.src && !loadedImages.has(el.src)) {
                const img = new Image();
                img.src = el.src;
                img.crossOrigin = "anonymous"; // Handle potential CORS issues
                img.onload = () => {
                    setLoadedImages(prev => new Map(prev).set(el.src, img));
                    redrawCanvas();
                };
            }
        });
    }, [elements]);

     // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
                return;
            }

            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const isCtrlCmd = isMac ? e.metaKey : e.ctrlKey;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
                e.preventDefault();
                dispatch({ type: 'DELETE_ELEMENT', payload: { id: selectedElementId } });
            } else if (isCtrlCmd && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    dispatch({ type: 'REDO' });
                } else {
                    dispatch({ type: 'UNDO' });
                }
            } else if (isCtrlCmd && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                dispatch({ type: 'REDO' });
            } else {
                if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                     switch (e.key.toLowerCase()) {
                        case 'v': dispatch({ type: 'SET_TOOL', payload: Tool.Select }); break;
                        case 'h': dispatch({ type: 'SET_TOOL', payload: Tool.Hand }); break;
                        case 'p': dispatch({ type: 'SET_TOOL', payload: Tool.Pen }); break;
                        case 'e': dispatch({ type: 'SET_TOOL', payload: Tool.Eraser }); break;
                        case 's': dispatch({ type: 'SET_TOOL', payload: Tool.StickyNote }); break;
                        case 'r': dispatch({ type: 'SET_TOOL', payload: Tool.Rectangle }); break;
                        case 'c': dispatch({ type: 'SET_TOOL', payload: Tool.Circle }); break;
                        case 't': dispatch({ type: 'SET_TOOL', payload: Tool.Text }); break;
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [dispatch, selectedElementId]);

    const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent): Point => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left - pan.x) / zoom,
            y: (clientY - rect.top - pan.y) / zoom,
        };
    };
    
    const drawElement = (ctx: CanvasRenderingContext2D, element: BoardElement) => {
        if (element.type === 'image') {
            const img = loadedImages.get((element as ImageElement).src);
            if (img) {
                ctx.drawImage(img, element.x, element.y, element.width, element.height);
            }
            return;
        }

        if (element.type !== 'path' && element.type !== 'rectangle' && element.type !== 'circle') {
            return;
        }

        ctx.strokeStyle = element.color;
        ctx.lineWidth = element.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch(element.type){
            case 'path':
                drawPath(ctx, element);
                break;
            case 'rectangle':
                ctx.strokeRect(element.x, element.y, element.width, element.height);
                break;
            case 'circle':
                 ctx.beginPath();
                 ctx.ellipse(element.x + element.width/2, element.y + element.height / 2, Math.abs(element.width/2), Math.abs(element.height/2), 0, 0, 2 * Math.PI);
                 ctx.stroke();
                 break;
        }
    }

    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);
        
        const visibleElements = [...elements, currentElement].filter((el): el is BoardElement => el !== null);
        const selectedElement = visibleElements.find(el => el.id === selectedElementId);
        
        visibleElements.forEach(element => {
            if (element.type !== 'note' && element.type !== 'text') {
                drawElement(ctx, element);
            }
        });

        if (selectedElement && activeTool === Tool.Select && selectedElement.type !== 'note' && selectedElement.type !== 'text') {
            const bounds = getElementBounds(selectedElement);
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([4 / zoom, 2 / zoom]);
            ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.setLineDash([]);
            
            drawResizeHandles(ctx, bounds);
        }
        
        ctx.restore();
    }, [elements, pan, zoom, currentElement, selectedElementId, activeTool, loadedImages]);
    
    const drawResizeHandles = (ctx: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }) => {
        const handleSize = 8 / zoom;
        const handles = {
            topLeft: { x: bounds.x, y: bounds.y },
            topRight: { x: bounds.x + bounds.width, y: bounds.y },
            bottomLeft: { x: bounds.x, y: bounds.y + bounds.height },
            bottomRight: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        };
        ctx.fillStyle = '#3B82F6';
        Object.values(handles).forEach(pos => {
            ctx.fillRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
        });
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const resizeCanvas = () => {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            redrawCanvas();
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        return () => window.removeEventListener('resize', resizeCanvas);
    }, [redrawCanvas]);

    useEffect(() => {
        redrawCanvas();
    }, [redrawCanvas]);

    const getElementAtPosition = (point: Point): BoardElement | null => {
        return [...elements].reverse().find(el => {
            if (el.type === 'path') return isPointNearPath(point, el);
            if (el.type === 'note' || el.type === 'rectangle' || el.type === 'image' || el.type === 'text') return isPointInBounds(point, getElementBounds(el));
            if (el.type === 'circle') {
                const { x, y, width, height } = getElementBounds(el);
                const cx = x + width / 2;
                const cy = y + height / 2;
                const rx = width / 2;
                const ry = height / 2;
                return ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2) <= 1;
            }
            return false;
        }) || null;
    };
    
    const getResizeHandleAtPosition = (point: Point, element: BoardElement): ResizeHandle | null => {
         const bounds = getElementBounds(element);
         const handleSize = 8 / zoom;
         const handles = {
            topLeft: { x: bounds.x, y: bounds.y },
            topRight: { x: bounds.x + bounds.width, y: bounds.y },
            bottomLeft: { x: bounds.x, y: bounds.y + bounds.height },
            bottomRight: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
         };
         for (const [name, pos] of Object.entries(handles)) {
             if (Math.abs(point.x - pos.x) < handleSize && Math.abs(point.y - pos.y) < handleSize) {
                 return name as ResizeHandle;
             }
         }
         return null;
    }

    const handleMouseDown = (e: React.MouseEvent) => {
        if (contextMenu.visible) setContextMenu({ visible: false, x: 0, y: 0, elementId: null });
        if (e.button !== 0) return;

        const point = getCanvasPoint(e);
        setStartPoint(point);
        lastPointRef.current = point;

        if (activeTool === Tool.Hand || e.ctrlKey || e.metaKey) {
            setAction('panning');
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            return;
        }

        if (activeTool === Tool.Select) {
            const selectedElement = elements.find(el => el.id === selectedElementId);
            if (selectedElement) {
                const handle = getResizeHandleAtPosition(point, selectedElement);
                if (handle) {
                    setAction('resizing');
                    setResizeHandle(handle);
                    setCurrentElement(selectedElement);
                    return;
                }
            }
            const elementAtPos = getElementAtPosition(point);
            if (elementAtPos) {
                dispatch({ type: 'SET_SELECTED_ELEMENT', payload: elementAtPos.id });
                setAction('moving');
                setCurrentElement(elementAtPos);
            } else {
                dispatch({ type: 'SET_SELECTED_ELEMENT', payload: null });
                setAction('none');
            }
            return;
        }
        
        setAction('drawing');
        if (activeTool === Tool.Pen) {
            const newPath: PathElement = { id: uuidv4(), type: 'path', points: [point], color, strokeWidth };
            setCurrentElement(newPath);
        } else if (activeTool === Tool.Eraser) {
            const elementToDelete = getElementAtPosition(point);
            if (elementToDelete) {
                dispatch({ type: 'DELETE_ELEMENT', payload: { id: elementToDelete.id } });
            }
        } else if (activeTool === Tool.StickyNote) {
            const newNote: StickyNoteElement = { id: uuidv4(), type: 'note', x: point.x, y: point.y, width: 200, height: 200, text: '', color: '#FFF9B1' };
            dispatch({ type: 'ADD_ELEMENT', payload: { element: newNote, select: true } });
            setAction('none');
        } else if (activeTool === Tool.Rectangle) {
            const newRect: RectangleElement = { id: uuidv4(), type: 'rectangle', x: point.x, y: point.y, width: 0, height: 0, color, strokeWidth };
            setCurrentElement(newRect);
        } else if (activeTool === Tool.Circle) {
            const newCircle: CircleElement = { id: uuidv4(), type: 'circle', x: point.x, y: point.y, width: 0, height: 0, color, strokeWidth };
            setCurrentElement(newCircle);
        } else if (activeTool === Tool.Text) {
            const newText: TextElement = {
                id: uuidv4(), type: 'text', x: point.x, y: point.y, width: 200, height: 24,
                text: 'Type something...', color, fontSize: 16, fontFamily: 'Poppins', textAlign: 'left'
            };
            dispatch({ type: 'ADD_ELEMENT', payload: { element: newText, select: true } });
            setAction('none');
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const point = getCanvasPoint(e);

        if (activeTool === Tool.Select) {
            const selectedEl = elements.find(el => el.id === selectedElementId);
            let newCursor = 'default';
            if (selectedEl) {
                const handle = getResizeHandleAtPosition(point, selectedEl);
                if (handle) {
                    if (handle.includes('Left') || handle.includes('Right')) newCursor = 'ew-resize';
                    if (handle.includes('Top') || handle.includes('Bottom')) newCursor = 'ns-resize';
                    if (handle === 'topLeft' || handle === 'bottomRight') newCursor = 'nwse-resize';
                    if (handle === 'topRight' || handle === 'bottomLeft') newCursor = 'nesw-resize';
                } else if (getElementAtPosition(point)) {
                    newCursor = 'move';
                }
            }
            setCursor(newCursor);
        } else if (activeTool === Tool.Hand) {
            setCursor(action === 'panning' ? 'grabbing' : 'grab');
        } else {
            setCursor('crosshair');
        }
        
        if (action === 'panning') {
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
            return;
        }
        
        if (action !== 'drawing') {
            if (action === 'none' || !currentElement || !lastPointRef.current) return;
            const dx = point.x - lastPointRef.current.x;
            const dy = point.y - lastPointRef.current.y;
    
            if (action === 'moving') {
                if (currentElement.type === 'path') {
                    setCurrentElement({
                        ...currentElement,
                        points: currentElement.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
                    });
                } else {
                    setCurrentElement({ ...currentElement, x: (currentElement as any).x + dx, y: (currentElement as any).y + dy });
                }
            } else if (action === 'resizing' && currentElement.type !== 'path') {
                const { x, y, width, height } = currentElement as any;
                let newX = x, newY = y, newWidth = width, newHeight = height;
    
                if (resizeHandle?.includes('Left')) { newWidth -= dx; newX += dx; }
                if (resizeHandle?.includes('Right')) { newWidth += dx; }
                if (resizeHandle?.includes('Top')) { newHeight -= dy; newY += dy; }
                if (resizeHandle?.includes('Bottom')) { newHeight += dy; }
                
                if (newWidth > 10 && newHeight > 10) {
                     setCurrentElement({ ...currentElement, x: newX, y: newY, width: newWidth, height: newHeight });
                }
            }
            lastPointRef.current = point;
            return;
        }

        if (currentElement?.type === 'path') {
            setCurrentElement(prev => ({ ...prev, points: [...(prev as PathElement).points, point] } as PathElement));
        } else if (currentElement?.type === 'rectangle' || currentElement?.type === 'circle') {
            const newWidth = point.x - startPoint.x;
            const newHeight = point.y - startPoint.y;
            setCurrentElement({
                ...currentElement,
                x: newWidth > 0 ? startPoint.x : point.x,
                y: newHeight > 0 ? startPoint.y : point.y,
                width: Math.abs(newWidth),
                height: Math.abs(newHeight),
            });
        } else if (activeTool === Tool.Eraser) {
             const elementToDelete = getElementAtPosition(point);
            if (elementToDelete) {
                dispatch({ type: 'DELETE_ELEMENT', payload: { id: elementToDelete.id } });
            }
        }
    };

    const handleMouseUp = () => {
        if (action === 'drawing' && currentElement) {
             if (currentElement.type === 'rectangle' || currentElement.type === 'circle') {
                if (currentElement.width > 0 || currentElement.height > 0) {
                    dispatch({ type: 'ADD_ELEMENT', payload: { element: currentElement, select: true } });
                }
            } else {
                 dispatch({ type: 'ADD_ELEMENT', payload: { element: currentElement, select: false } });
            }
        } else if ((action === 'moving' || action === 'resizing') && currentElement) {
            dispatch({ type: 'UPDATE_ELEMENT', payload: currentElement });
        }
        setAction('none');
        setCurrentElement(null);
        lastPointRef.current = null;
        setResizeHandle(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        applyZoom(Math.max(0.1, Math.min(5, zoom + scaleAmount)), e.clientX, e.clientY);
    };

    const applyZoom = (newZoom: number, clientX?: number, clientY?: number) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const mouseX = clientX ? clientX - rect.left : canvas.width / 2;
        const mouseY = clientY ? clientY - rect.top : canvas.height / 2;
        const mousePoint = { x: (mouseX - pan.x) / zoom, y: (mouseY - pan.y) / zoom };
        const newPanX = mouseX - mousePoint.x * newZoom;
        const newPanY = mouseY - mousePoint.y * newZoom;
        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const handleZoomIn = () => applyZoom(Math.min(5, zoom * 1.2));
    const handleZoomOut = () => applyZoom(Math.max(0.1, zoom / 1.2));
    const handleResetZoom = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        const point = getCanvasPoint(e);
        const clickedElement = getElementAtPosition(point);
        if (clickedElement) {
            dispatch({ type: 'SET_SELECTED_ELEMENT', payload: clickedElement.id });
            setContextMenu({ visible: true, x: e.clientX, y: e.clientY, elementId: clickedElement.id });
        } else {
            setContextMenu({ visible: false, x: 0, y: 0, elementId: null });
        }
    };

    const handleDeleteElement = (id: string) => {
        dispatch({ type: 'DELETE_ELEMENT', payload: { id } });
        setContextMenu({ visible: false, x: 0, y: 0, elementId: null });
    };

    const handleUpdateElement = (element: BoardElement) => {
        dispatch({ type: 'UPDATE_ELEMENT', payload: element });
    };
    
    const drawPath = (ctx: CanvasRenderingContext2D, data: PathElement) => {
        ctx.beginPath();
        if (data.points.length > 0) {
            ctx.moveTo(data.points[0].x, data.points[0].y);
            for (let i = 1; i < data.points.length; i++) {
                ctx.lineTo(data.points[i].x, data.points[i].y);
            }
        }
        ctx.stroke();
    };
    
    const updateStickyNote = (updatedNote: StickyNoteElement) => {
        dispatch({ type: 'UPDATE_ELEMENT', payload: updatedNote });
    };
    
    const updateTextElement = (updatedText: TextElement) => {
        dispatch({ type: 'UPDATE_ELEMENT', payload: updatedText });
    };

    const confirmClearCanvas = () => {
        dispatch({ type: 'CLEAR_CANVAS' });
        setShowClearConfirm(false);
    };

    const elementForMenu = contextMenu.elementId ? elements.find(el => el.id === contextMenu.elementId) : null;

    return (
        <div className="relative w-full h-full bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm overflow-hidden" style={{ cursor }} onContextMenu={handleContextMenu}>
            <div className="absolute inset-0 bg-repeat bg-center text-slate-300 dark:text-slate-700" style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3e%3cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='currentColor' stroke-width='0.5'/%3e%3c/svg%3e")` }}></div>
            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} className="absolute top-0 left-0" />
            <div className="absolute top-0 left-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', pointerEvents: action !== 'none' ? 'none' : 'auto' }}>
                {elements.filter(el => el.type === 'note').map(note => (
                    <StickyNote key={note.id} data={note as StickyNoteElement} onUpdate={updateStickyNote} isSelected={note.id === selectedElementId} />
                ))}
                {elements.filter(el => el.type === 'text').map(text => (
                    <TextElementComponent key={text.id} data={text as TextElement} onUpdate={updateTextElement} isSelected={text.id === selectedElementId} />
                ))}
            </div>
            
            <button onClick={() => setShowClearConfirm(true)} className="absolute top-16 right-4 z-20 p-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600" title="Clear Entire Canvas">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            </button>

            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 p-1.5 bg-white/30 dark:bg-slate-900/50 backdrop-blur-lg border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl">
                <button onClick={handleZoomOut} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Zoom Out"><ZoomOut className="w-5 h-5"/></button>
                <button onClick={handleResetZoom} className="px-2 py-1.5 text-sm font-semibold rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Reset Zoom">{Math.round(zoom * 100)}%</button>
                <button onClick={handleZoomIn} className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700" title="Zoom In"><ZoomIn className="w-5 h-5"/></button>
            </div>
            
            <AnimatePresence>
                {showClearConfirm && (
                    <Modal onClose={() => setShowClearConfirm(false)} title="Clear Canvas">
                        <p className="text-gray-600 dark:text-gray-300">Are you sure you want to clear the entire canvas for everyone? This action cannot be undone.</p>
                        <div className="mt-6 flex justify-end space-x-4">
                            <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500">Cancel</button>
                            <button onClick={confirmClearCanvas} className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600">Clear Canvas</button>
                        </div>
                    </Modal>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {contextMenu.visible && contextMenu.elementId && elementForMenu && (
                     <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        element={elementForMenu}
                        onDelete={handleDeleteElement}
                        onUpdateElement={handleUpdateElement}
                        onClose={() => setContextMenu({ ...contextMenu, visible: false })}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Sketchboard;