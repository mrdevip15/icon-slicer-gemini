import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Crop, 
  Grid3X3, 
  Download, 
  Undo, 
  Redo, 
  Trash2, 
  Plus, 
  Scissors,
  Settings2,
  Brush,
  Eraser,
  Wand2,
  ChevronRight,
  History,
  LayoutGrid,
  Zap,
  MousePointer2,
  Save,
  Grid
} from 'lucide-react';
import Cropper, { Point, Area } from 'react-easy-crop';
import { cn } from '../lib/utils';
import { IconSlice, GridConfig } from '../types';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';

interface EditorWorkspaceProps {
  key?: string;
  image: string;
  onUpdateImage: (url: string) => void;
}

type EditorTool = 'SELECT' | 'CROP' | 'SLICE' | 'EFFECTS';

export default function EditorWorkspace({ image, onUpdateImage }: EditorWorkspaceProps) {
  const [activeTool, setActiveTool] = useState<EditorTool>('SELECT');
  const [isProcessing, setIsProcessing] = useState(false);

  // Cropping State
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Slicing State
  const [grid, setGrid] = useState<GridConfig>({ rows: 4, cols: 4 });
  const [slices, setSlices] = useState<IconSlice[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Effects State
  const [effects, setEffects] = useState({
    hue: 0,
    saturation: 100,
    brightness: 100,
    contrast: 100
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Background Removal
  const handleRemoveBackground = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image })
      });
      const data = await response.json();
      if (data.image) {
        onUpdateImage(data.image);
      }
    } catch (err) {
      console.error("BG Removal failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApplyCrop = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onUpdateImage(croppedImage);
      setActiveTool('SELECT');
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const img = new Image();
      img.src = image;
      await new Promise((resolve) => (img.onload = resolve));

      const { rows, cols } = grid;
      const cellWidth = img.width / cols;
      const cellHeight = img.height / rows;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = cellWidth;
      canvas.height = cellHeight;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.clearRect(0, 0, cellWidth, cellHeight);
          ctx.drawImage(
            img,
            c * cellWidth, r * cellHeight, cellWidth, cellHeight,
            0, 0, cellWidth, cellHeight
          );
          
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
          if (blob) {
            zip.file(`icon_${r}_${c}.png`, blob);
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `icon_pack_${Date.now()}.zip`;
      link.click();
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#EA580C', '#F59E0B', '#FFFFFF']
      });
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {/* Tools Sidebar */}
      <aside className="w-16 border-r border-brand-border bg-bg-panel flex flex-col items-center py-4 gap-4 z-20 shrink-0">
        <ToolButton 
          icon={<MousePointer2 className="w-4 h-4" />} 
          active={activeTool === 'SELECT'} 
          onClick={() => setActiveTool('SELECT')}
          label="Select"
        />
        <ToolButton 
          icon={<Crop className="w-4 h-4" />} 
          active={activeTool === 'CROP'} 
          onClick={() => setActiveTool('CROP')}
          label="Crop"
        />
        <ToolButton 
          icon={<Grid className="w-4 h-4" />} 
          active={activeTool === 'SLICE'} 
          onClick={() => setActiveTool('SLICE')}
          label="Slice"
        />
        <ToolButton 
          icon={<Settings2 className="w-4 h-4" />} 
          active={activeTool === 'EFFECTS'} 
          onClick={() => setActiveTool('EFFECTS')}
          label="Adjust"
        />
        
        <div className="mt-auto flex flex-col gap-4">
           <button 
            disabled={isProcessing}
            onClick={handleRemoveBackground}
            className="w-10 h-10 rounded bg-white/5 text-zinc-400 flex items-center justify-center hover:bg-white/10 transition-all border border-brand-border disabled:opacity-20 group relative"
          >
            <Eraser className="w-4 h-4" />
            <span className="absolute left-14 bg-zinc-800 text-white text-[9px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity uppercase mono font-bold border border-zinc-700">Remove BG</span>
          </button>
          
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="w-10 h-10 rounded bg-brand-accent text-white flex items-center justify-center hover:opacity-90 transition-all shadow-lg shadow-brand-accent/20 active:scale-95 group relative"
          >
            {isExporting ? <Zap className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="absolute left-14 bg-zinc-800 text-white text-[9px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity uppercase mono font-bold border border-zinc-700">Export ZIP</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 relative canvas-bg overflow-hidden flex flex-col">
         {/* Utility Bar */}
         <div className="h-10 border-b border-brand-border px-4 flex items-center justify-between bg-bg-panel/40 backdrop-blur-sm z-10 shrink-0">
           <div className="flex gap-4">
             <div className="flex items-center gap-2 mono text-[10px] text-zinc-500">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
               SYSTEM: OK
             </div>
             <div className="mono text-[10px] text-zinc-500 uppercase tracking-tighter">TOOL: {activeTool}</div>
           </div>
           <div className="flex gap-1">
             <kbd className="bg-zinc-800 border border-brand-border px-1 px-1.5 text-[9px] mono text-zinc-500 rounded">V</kbd>
             <kbd className="bg-zinc-800 border border-brand-border px-1 px-1.5 text-[9px] mono text-zinc-500 rounded">C</kbd>
             <kbd className="bg-zinc-800 border border-brand-border px-1 px-1.5 text-[9px] mono text-zinc-500 rounded">S</kbd>
           </div>
         </div>

         <div className="flex-1 flex items-center justify-center p-8 relative">
            <div className="relative max-w-full max-h-full shadow-2xl shadow-black ring-1 ring-white/5 rounded overflow-hidden bg-zinc-900/50">
              {activeTool === 'CROP' ? (
                <div className="w-[60vw] h-[60vh] relative min-w-[300px]">
                  <Cropper
                    image={image}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                  />
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 backdrop-blur px-4 py-2 rounded border border-brand-border z-50">
                    <button 
                      onClick={handleApplyCrop}
                      disabled={isProcessing}
                      className="px-4 py-1.5 bg-brand-accent hover:opacity-90 rounded text-[11px] font-bold uppercase tracking-widest text-white shadow-lg shadow-brand-accent/10"
                    >
                      Apply
                    </button>
                    <button 
                      onClick={() => setActiveTool('SELECT')}
                      className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] font-bold uppercase tracking-widest text-zinc-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <img 
                    src={image} 
                    alt="Workspace" 
                    className="max-w-full max-h-[70vh] object-contain"
                    style={{
                      filter: `hue-rotate(${effects.hue}deg) saturate(${effects.saturation}%) brightness(${effects.brightness}%) contrast(${effects.contrast}%)`
                    }}
                  />
                  
                  {/* Grid Overlay */}
                  {activeTool === 'SLICE' && (
                    <div className="absolute inset-0 grid" style={{
                      gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
                      gridTemplateRows: `repeat(${grid.rows}, 1fr)`
                    }}>
                      {Array.from({ length: grid.rows * grid.cols }).map((_, i) => (
                        <div key={i} className="border border-brand-accent/20 hover:bg-brand-accent/5 transition-colors flex items-center justify-center group/cell cursor-crosshair">
                           <span className="mono text-[8px] text-zinc-600 group-hover/cell:text-brand-accent transition-colors opacity-40">{String(i + 1).padStart(2, '0')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
         </div>
      </div>

      {/* Right Properties Panel */}
      <aside className="w-64 border-l border-brand-border bg-bg-panel flex flex-col shrink-0 overflow-hidden">
        <div className="p-4 border-b border-brand-border bg-bg-dark/20 h-full overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTool === 'SLICE' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-2 mb-4 font-bold uppercase tracking-widest text-[10px] text-zinc-500">
                  <Grid3X3 className="w-3 h-3" />
                  Slicing Logic
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[11px] text-zinc-400">
                      <label>Grid Columns</label>
                      <span className="mono text-brand-accent">{grid.cols}</span>
                    </div>
                    <input 
                      type="range" min="1" max="16" step="1" 
                      value={grid.cols} 
                      onChange={(e) => setGrid({...grid, cols: parseInt(e.target.value)})}
                      className="w-full accent-brand-accent h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-[11px] text-zinc-400">
                      <label>Grid Rows</label>
                      <span className="mono text-brand-accent">{grid.rows}</span>
                    </div>
                    <input 
                      type="range" min="1" max="16" step="1" 
                      value={grid.rows} 
                      onChange={(e) => setGrid({...grid, rows: parseInt(e.target.value)})}
                      className="w-full accent-brand-accent h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button 
                      onClick={() => setGrid({ rows: 4, cols: 4 })}
                      className="py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] mono font-bold uppercase border border-zinc-700"
                    >4x4 Matrix</button>
                    <button 
                      onClick={() => setGrid({ rows: 8, cols: 8 })}
                      className="py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded text-[9px] mono font-bold uppercase border border-zinc-700"
                    >8x8 Matrix</button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTool === 'EFFECTS' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-2 mb-4 font-bold uppercase tracking-widest text-[10px] text-zinc-500">
                  <Settings2 className="w-3 h-3" />
                  Color Grading
                </div>
                
                <div className="space-y-5">
                  <Slider label="Hue Rotate" value={effects.hue} min={0} max={360} unit="°" onChange={(v) => setEffects({...effects, hue: v})} />
                  <Slider label="Saturation" value={effects.saturation} min={0} max={200} unit="%" onChange={(v) => setEffects({...effects, saturation: v})} />
                  <Slider label="Brightness" value={effects.brightness} min={0} max={200} unit="%" onChange={(v) => setEffects({...effects, brightness: v})} />
                  <Slider label="Contrast" value={effects.contrast} min={0} max={200} unit="%" onChange={(v) => setEffects({...effects, contrast: v})} />
                </div>
                
                <button 
                  onClick={() => setEffects({ hue: 0, saturation: 100, brightness: 100, contrast: 100 })}
                  className="w-full py-2 border border-brand-border rounded text-[10px] mono uppercase text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                >
                  Reset Grades
                </button>

                <button 
                  onClick={async () => {
                    setIsProcessing(true);
                    const flattened = await flattenEffects(image, effects);
                    onUpdateImage(flattened);
                    setEffects({ hue: 0, saturation: 100, brightness: 100, contrast: 100 });
                    setIsProcessing(false);
                  }}
                  className="w-full py-2.5 bg-brand-accent rounded text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-colors shadow-lg shadow-brand-accent/10 text-white"
                >
                  Bake Visuals
                </button>
              </motion.div>
            )}

            {activeTool === 'SELECT' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-2 mb-4 font-bold uppercase tracking-widest text-[10px] text-zinc-500">
                  <MousePointer2 className="w-4 h-4" />
                  Inspector
                </div>
                
                <div className="p-3 border border-brand-border rounded bg-zinc-900/50 space-y-3">
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Source Identity</span>
                     <span className="mono text-[10px] text-brand-accent">0x3A2...94F</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Format</span>
                     <span className="mono text-[10px] text-white">PNG_RGBA</span>
                   </div>
                   <div className="flex justify-between items-center">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-tighter">Color Space</span>
                     <span className="mono text-[10px] text-white">SRGB_V2</span>
                   </div>
                </div>

                <div className="pt-4 border-t border-brand-border">
                  <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">Recent Prompts</h4>
                  <div className="space-y-2">
                    <div className="text-[9px] mono text-zinc-500 p-2 bg-zinc-800/40 rounded border border-zinc-700/30 truncate">wooden adventure chests...</div>
                    <div className="text-[9px] mono text-zinc-500 p-2 bg-zinc-800/40 rounded border border-zinc-700/30 truncate">elemental scroll spells...</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="mt-auto p-4 border-t border-brand-border bg-bg-dark/40">
           <button className="w-full py-2 border border-dashed border-zinc-700 text-[10px] mono uppercase text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors">
             + ADD MODIFIER
           </button>
        </div>
      </aside>
    </div>
  );
}

function ToolButton({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all group relative",
        active ? "bg-orange-600 text-white shadow-lg shadow-orange-600/20" : "text-white/40 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      <span className="absolute left-16 bg-black text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
        {label}
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string, value: number, min: number, max: number, unit: string, onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className="font-mono">{value}{unit}</span>
      </div>
      <input 
        type="range" min={min} max={max} step="1" 
        value={value} 
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-orange-600 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer"
      />
    </div>
  );
}

// Utility to crop image
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/png');
}

// Utility to apply filters to canvas and export new image
async function flattenEffects(imageSrc: string, effects: { hue: number, saturation: number, brightness: number, contrast: number }): Promise<string> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => (image.onload = resolve));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  canvas.width = image.width;
  canvas.height = image.height;

  ctx.filter = `hue-rotate(${effects.hue}deg) saturate(${effects.saturation}%) brightness(${effects.brightness}%) contrast(${effects.contrast}%)`;
  ctx.drawImage(image, 0, 0);

  return canvas.toDataURL('image/png');
}
