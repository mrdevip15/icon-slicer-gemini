import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Sparkles, 
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
  LayoutGrid
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';
import { cn } from './lib/utils';
import { AppMode, STYLE_PRESETS, GenerationConfig } from './types';

// Components
import SetupView from './components/SetupView';
import GenerationView from './components/GenerationView';
import EditorWorkspace from './components/EditorWorkspace';
import AssetsGallery from './components/AssetsGallery';

import { useAuth } from './lib/AuthContext';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

export default function App() {
  const { user, login, logout, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<AppMode>('START');
  const [image, setImage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushToHistory = (newImage: string) => {
    const newHistory = [...history.slice(0, historyIndex + 1), newImage];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setImage(newImage);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setImage(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setImage(next);
    }
  };

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      pushToHistory(url);
      setMode('EDIT');
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setImage(null);
    setHistory([]);
    setHistoryIndex(-1);
    setMode('START');
  };

  const activeTabClass = "text-white border-b-2 border-brand-accent pb-3.5 pt-4 cursor-pointer";
  const inactiveTabClass = "hover:text-white transition-colors cursor-pointer py-3.5 pt-4 text-brand-text-muted";

  return (
    <div className="h-screen bg-bg-dark text-[#E0E0E0] font-sans selection:bg-brand-accent/30 selection:text-white overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-12 border-b border-brand-border bg-[#151517] flex items-center justify-between px-4 z-50 shrink-0">
        <div className="flex items-center gap-6 cursor-pointer">
          <div className="flex items-center gap-2" onClick={reset}>
            <div className="w-5 h-5 bg-brand-accent rounded shadow-sm"></div>
            <span className="font-bold tracking-tight text-white uppercase text-sm">
              IconSlicer <span className="text-[10px] bg-brand-accent/20 text-brand-accent px-1.5 py-0.5 rounded ml-1 tracking-normal font-mono">BETA</span>
            </span>
          </div>
          
          <nav className="hidden md:flex gap-4 text-[11px] font-bold tracking-wider uppercase">
            <span 
              onClick={() => {
                if (image) setMode('EDIT');
                else setMode('START');
              }} 
              className={mode !== 'ASSETS' ? activeTabClass : inactiveTabClass}
            >
              Workspace
            </span>
            <span 
              onClick={() => setMode('ASSETS')}
              className={mode === 'ASSETS' ? activeTabClass : inactiveTabClass}
            >
              Assets
            </span>
            <span className="hover:text-white transition-colors cursor-pointer py-3.5 pt-4 text-brand-text-muted opacity-50">History</span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end hidden sm:flex">
                    <span className="text-[10px] text-white font-bold leading-none">{user.displayName}</span>
                    <span className="text-[9px] text-zinc-500 font-mono leading-none mt-1 uppercase">Cloud Sync On</span>
                  </div>
                  <button 
                    onClick={() => logout()}
                    className="p-1.5 hover:bg-white/5 rounded-md text-zinc-500 hover:text-white transition-all group"
                    title="Logout"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                  {user.photoURL && (
                    <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-brand-border" />
                  )}
                </div>
              ) : (
                <button 
                  onClick={() => login()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-brand-accent/10 border border-brand-accent/20 rounded text-[10px] font-bold uppercase tracking-widest text-brand-accent hover:bg-brand-accent/20 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Login
                </button>
              )
            )}
          </div>

          {(mode === 'EDIT' || mode === 'GENERATE') && (
            <div className="flex items-center gap-1 bg-white/5 rounded p-1 border border-brand-border mr-2">
              <button 
                onClick={handleUndo} 
                disabled={historyIndex <= 0}
                className="p-1 hover:bg-white/10 rounded disabled:opacity-20 transition-all"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-1 hover:bg-white/10 rounded disabled:opacity-20 transition-all"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {image && (
            <button 
              onClick={reset}
              className="btn-secondary uppercase tracking-widest text-[10px] font-bold px-3 py-1.5"
            >
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          {mode === 'START' && (
            <SetupView key="start" onUpload={onUpload} onGoToGenerate={() => setMode('GENERATE')} />
          )}

          {mode === 'GENERATE' && (
            <GenerationView 
              key="generate" 
              onGenerated={(url) => {
                pushToHistory(url);
                setMode('EDIT');
              }} 
              onBack={() => setMode('START')}
            />
          )}

          {mode === 'ASSETS' && (
            <AssetsGallery 
              key="assets"
              onSelect={(url) => {
                pushToHistory(url);
                setMode('EDIT');
              }}
              onBack={() => setMode(image ? 'EDIT' : 'START')}
            />
          )}

          {mode === 'EDIT' && image && (
            <EditorWorkspace 
              key="edit"
              image={image}
              onUpdateImage={pushToHistory}
            />
          )}
        </AnimatePresence>
      </main>
      <footer className="h-6 border-t border-brand-border bg-[#151517] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 mono text-[9px] text-zinc-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_3px_rgba(34,197,94,0.5)]"></div>
            SYSTEM: READY
          </div>
          <div className="h-3 w-px bg-zinc-800"></div>
          <span className="mono text-[9px] text-zinc-500 uppercase">Session: BLU-742-X</span>
        </div>
        <div className="mono text-[9px] text-zinc-500 uppercase">
           Generated via Gemini Flash 2.5 • Latency 2.4s
        </div>
      </footer>
    </div>
  );
}
