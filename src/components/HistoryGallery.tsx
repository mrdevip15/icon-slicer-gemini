import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Loader2, History, Wand2, Clock, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface HistoryGalleryProps {
  key?: string;
  onSelectPrompt: (prompt: string) => void;
  onBack: () => void;
}

export default function HistoryGallery({ onSelectPrompt, onBack }: HistoryGalleryProps) {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchHistory = async () => {
        try {
          const q = query(
            collection(db, `users/${user.uid}/history`),
            orderBy('timestamp', 'desc'),
            limit(50)
          );
          const snapshot = await getDocs(q);
          setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Error fetching history:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchHistory();
    } else {
        setLoading(false);
    }
  }, [user]);

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/history`, id));
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Error deleting history item:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-dark">
        <Loader2 className="w-8 h-8 animate-spin text-brand-accent" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-dark">
      <header className="h-12 border-b border-brand-border px-6 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Prompt History</h2>
        <button onClick={onBack} className="text-xs text-zinc-500 hover:text-white transition-colors mono">CLOSE_HISTORY [ESC]</button>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {!user ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
             <div className="w-16 h-16 rounded bg-zinc-800/50 flex items-center justify-center border border-brand-border">
              <History className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300">Login Required</h3>
              <p className="text-[11px] text-zinc-500 mono uppercase">Please login to view your prompt history across sessions.</p>
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded bg-zinc-800/50 flex items-center justify-center border border-brand-border">
              <History className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300">No history found</h3>
              <p className="text-[11px] text-zinc-500 mono uppercase">Your AI generation prompts will be recorded here.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto w-full space-y-4">
            {history.map((item, idx) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group bg-bg-panel border border-brand-border rounded p-4 flex items-start gap-4 hover:border-brand-accent/40 transition-all cursor-pointer"
                onClick={() => onSelectPrompt(item.prompt)}
              >
                <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center border border-zinc-700 shrink-0 group-hover:scale-105 transition-transform">
                  <Wand2 className="w-5 h-5 text-zinc-500 group-hover:text-brand-accent transition-colors" />
                </div>
                <div className="flex-1 space-y-1 overflow-hidden">
                  <p className="text-sm text-zinc-200 line-clamp-2 leading-relaxed">{item.prompt}</p>
                  <div className="flex items-center gap-3 text-[10px] mono text-zinc-500 uppercase">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleString() : 'recent'}
                    </span>
                    <span className="text-brand-accent/50 group-hover:text-brand-accent transition-colors">Click to reuse prompt</span>
                  </div>
                </div>
                <button 
                  onClick={(e) => handleDeleteItem(e, item.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-500 transition-all"
                  title="Delete from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
