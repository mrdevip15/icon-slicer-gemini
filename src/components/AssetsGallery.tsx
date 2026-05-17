import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Loader2, Image as ImageIcon, Calendar, Trash2, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface AssetsGalleryProps {
  onSelect: (url: string) => void;
  onBack: () => void;
}

export default function AssetsGallery({ onSelect, onBack }: AssetsGalleryProps) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchAssets = async () => {
        try {
          const q = query(
            collection(db, 'iconSets'),
            where('ownerId', '==', user.uid),
            orderBy('createdAt', 'desc')
          );
          const snapshot = await getDocs(q);
          setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Error fetching assets:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchAssets();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-accent" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-dark">
      <header className="h-12 border-b border-brand-border px-6 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cloud Assets</h2>
        <button onClick={onBack} className="text-xs text-zinc-500 hover:text-white transition-colors mono">CLOSE_GALLERY [ESC]</button>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        {assets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded bg-zinc-800/50 flex items-center justify-center border border-brand-border">
              <ImageIcon className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300">No assets found</h3>
              <p className="text-[11px] text-zinc-500 mono uppercase">Your generated sheets will appear here once you login and generate.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {assets.map((asset) => (
              <motion.div 
                key={asset.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative bg-bg-panel border border-brand-border rounded overflow-hidden flex flex-col"
              >
                <div className="aspect-square bg-black/40 relative overflow-hidden">
                  <img src={asset.imageUrl} alt={asset.prompt} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button 
                      onClick={() => onSelect(asset.imageUrl)}
                      className="p-2 bg-brand-accent rounded-full text-white shadow-xl shadow-brand-accent/20 hover:scale-110 transition-transform"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <p className="text-[10px] text-white font-medium truncate uppercase">{asset.prompt}</p>
                  <div className="flex justify-between items-center text-[9px] mono text-zinc-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {asset.createdAt?.toDate ? asset.createdAt.toDate().toLocaleDateString() : 'recent'}
                    </div>
                    <span>{asset.gridSize}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
