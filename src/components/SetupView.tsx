import React from 'react';
import { motion } from 'motion/react';
import { Upload, Sparkles, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { cn } from '../lib/utils';

interface SetupViewProps {
  key?: string;
  onUpload: (file: File) => void;
  onGoToGenerate: () => void;
}

export default function SetupView({ onUpload, onGoToGenerate }: SetupViewProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => acceptedFiles[0] && onUpload(acceptedFiles[0]),
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: false
  } as any);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-bg-dark">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-4">
        {/* Left Side: Upload */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="group"
          {...getRootProps()}
        >
          <input {...getInputProps()} />
          <div className={cn(
            "relative h-72 rounded border transition-all duration-300 cursor-pointer flex flex-col items-center justify-center p-10 overflow-hidden",
            isDragActive ? "border-brand-accent bg-brand-accent/5" : "border-brand-border bg-bg-panel hover:border-zinc-600 hover:bg-[#1E1E20]"
          )}>
            <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center mb-5 group-hover:scale-105 transition-all duration-500 border border-white/5">
              <ImageIcon className="w-6 h-6 text-brand-text-muted group-hover:text-white transition-colors" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300 mb-2">Upload Source</h2>
            <p className="text-zinc-500 text-center text-[11px] leading-relaxed max-w-[200px] mono">
              DROP YOUR IMAGE OR CLICK TO BROWSE LOCAL FILES.
            </p>
          </div>
        </motion.div>

        {/* Right Side: Generate */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="group cursor-pointer"
          onClick={onGoToGenerate}
        >
          <div className="relative h-72 rounded border border-brand-border bg-bg-panel hover:border-brand-accent/50 hover:bg-[#1E1E20] transition-all duration-300 flex flex-col items-center justify-center p-10 overflow-hidden group">
            <div className="w-12 h-12 rounded bg-brand-accent/10 flex items-center justify-center mb-5 border border-brand-accent/20 group-hover:scale-105 transition-all duration-500">
              <Sparkles className="w-6 h-6 text-brand-accent" />
            </div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-300 mb-2">AI Generator</h2>
            <p className="text-zinc-500 text-center text-[11px] leading-relaxed max-w-[200px] mono">
              CREATE CONSISTENT ASSETS WITH GEMINI AI MODELS.
            </p>

            <div className="absolute top-3 right-3 text-brand-accent/40 group-hover:text-brand-accent transition-colors">
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
