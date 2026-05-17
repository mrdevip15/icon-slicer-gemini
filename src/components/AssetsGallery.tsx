import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { collection, query, where, orderBy, getDocs, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Loader2, Image as ImageIcon, Calendar, Trash2, ArrowRight, RefreshCw, AlertCircle, Download, LayoutGrid } from 'lucide-react';
import { cn } from '../lib/utils';

interface AssetsGalleryProps {
  key?: string;
  onSelect: (url: string) => void;
  onBack: () => void;
}

function SafeAssetImage({ asset, onUrlResolved, className }: { asset: any, onUrlResolved?: (url: string) => void, className?: string }) {
  const [url, setUrl] = useState<string | null>(asset.imageUrl || null);
  const [loading, setLoading] = useState(!asset.imageUrl && !!asset.storagePath);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url && asset.storagePath) {
      setLoading(true);
      const resolveUrl = async () => {
        try {
          const { auth } = await import('../lib/firebase');
          // Wait for auth to be ready if it's currently initializing
          let idToken = await auth.currentUser?.getIdToken();
          
          if (!idToken) {
            // Wait up to 2 seconds for user
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 100));
              idToken = await auth.currentUser?.getIdToken();
              if (idToken) break;
            }
          }

          if (!idToken) throw new Error("Not authenticated after waiting");
          
          const proxyUrl = `/api/asset-proxy?path=${encodeURIComponent(asset.storagePath)}&authToken=${idToken}`;
          setUrl(proxyUrl);
          if (onUrlResolved) onUrlResolved(proxyUrl);
        } catch (err: any) {
          console.error("[SafeImage] Proxy resolution failed:", err.message);
          setError(true);
        } finally {
          setLoading(false);
        }
      };
      
      resolveUrl();
    }
  }, [asset.storagePath, url]);

  if (loading) {
    return (
      <div className={cn("w-full h-full flex items-center justify-center bg-zinc-900/50", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={cn("w-full h-full flex items-center justify-center bg-zinc-900/50", className)}>
        <AlertCircle className="w-4 h-4 text-zinc-700" title={asset.storagePath} />
      </div>
    );
  }

  return (
    <img 
      src={url} 
      alt={asset.prompt} 
      className={cn("w-full h-full object-contain transition-transform duration-500", className)} 
      onError={() => setError(true)}
    />
  );
}

export default function AssetsGallery({ onSelect, onBack }: AssetsGalleryProps) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);

  const updateAssetUrl = (id: string, url: string) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, imageUrl: url } : a));
    if (selectedAsset?.id === id) {
      setSelectedAsset((prev: any) => ({ ...prev, imageUrl: url }));
    }
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      console.log("[Assets] Subscribing to assets for user:", user.uid);
      
      // Use onSnapshot for real-time updates
      const q = query(
        collection(db, 'iconSets'),
        where('ownerId', '==', user.uid)
        // orderBy('createdAt', 'desc') // Leave this commented out to avoid index requirement for now
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log(`[Assets Snapshot] Received update for user: ${user.uid}`);
        console.log(`[Assets Snapshot] Result count: ${snapshot.docs.length}`);
        console.log(`[Assets Snapshot] Source: ${snapshot.metadata.fromCache ? 'cache' : 'server'}`);
        
        const fetchedAssets = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          return { id: doc.id, ...data };
        });
        
        if (fetchedAssets.length > 0) {
           console.log("[Assets Snapshot] First doc ownerId:", fetchedAssets[0].ownerId);
           console.log("[Assets Snapshot] Match check:", fetchedAssets[0].ownerId === user.uid);
        } else {
           console.log("[Assets Snapshot] No documents returned from Firestore.");
        }

        // Sort manually to avoid index issues
        fetchedAssets.sort((a: any, b: any) => {
          const timeA = (a.createdAt?.toMillis?.()) || (a.createdAt?.seconds * 1000) || 0;
          const timeB = (b.createdAt?.toMillis?.()) || (b.createdAt?.seconds * 1000) || 0;
          return timeB - timeA;
        });

        setAssets(fetchedAssets);
        setLoading(false);
        setErrorMsg(null);
        setIsRefreshing(false);
      }, (err) => {
        console.error("[Assets Snapshot] Error Code:", err.code);
        console.error("[Assets Snapshot] Error Message:", err.message);
        setErrorMsg(`FIREBASE_ERR [${err.code}]: ${err.message}`);
        setLoading(false);
        setIsRefreshing(false);
      });

      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [user, refreshKey]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
  };
  
  const handleSyncLibrary = async () => {
    if (!user) return;
    setLoading(true);
    setIsRefreshing(true);
    setErrorMsg("SYNCING_LIBRARY... PLEASE WAIT");
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/sync-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: idToken })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Sync failed");
      
      console.log(`[Sync] Success! Found: ${data.found}, Synced: ${data.synced}`);
      handleRefresh();
    } catch (err: any) {
      console.error("[Sync] Error:", err);
      setErrorMsg(`SYNC ERROR: ${err.message}`);
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleDelete = async (asset: any) => {
    if (!user || !asset) {
      alert("Missing authentication or asset data.");
      return;
    }
    
    if (!window.confirm("Are you sure you want to delete this asset? This will permanently remove the image and its metadata.")) return;
    
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/delete-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          docId: asset.id, 
          storagePath: asset.storagePath,
          authToken: idToken 
        })
      });
      
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || `Server responded with ${resp.status}`);
      }
      
      setSelectedAsset(null);
      // Real-time listener will handle removal from UI
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert(`DELETE_FAILED: ${err.message}`);
    }
  };


  const handleDownload = async (url: string | null, filename: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'icon-sheet.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      window.open(url, '_blank');
    }
  };

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
        <div className="flex items-center gap-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Cloud Assets</h2>
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 hover:bg-white/5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
          </button>
        </div>
        <button onClick={onBack} className="text-xs text-zinc-500 hover:text-white transition-colors mono">CLOSE_GALLERY [ESC]</button>
      </header>

      <div className="flex-1 overflow-y-auto p-8 relative">
        <AnimatePresence>
          {selectedAsset && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/95 backdrop-blur-sm"
              onClick={() => setSelectedAsset(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-bg-panel border border-brand-border rounded-xl max-w-4xl w-full max-h-full overflow-hidden flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex-1 overflow-hidden bg-black/40 flex items-center justify-center p-4">
                  <SafeAssetImage 
                    asset={selectedAsset} 
                    className="max-h-[70vh] w-auto"
                  />
                </div>
                
                <div className="p-6 bg-zinc-900 border-t border-brand-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">{selectedAsset.prompt}</h3>
                    <div className="flex items-center gap-3 text-[10px] mono text-zinc-500 uppercase">
                      <span>Grid: {selectedAsset.gridSize}</span>
                      <span>Style: {selectedAsset.style}</span>
                      <span>Type: {selectedAsset.type || 'generated'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleDelete(selectedAsset)}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-[10px] font-bold uppercase tracking-widest text-red-500 transition-all flex items-center gap-2 mr-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDownload(selectedAsset.imageUrl, `${selectedAsset.prompt.substring(0, 20)}.png`)}
                      disabled={!selectedAsset.imageUrl}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-brand-border rounded text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-all flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    <button 
                      onClick={() => onSelect(selectedAsset.imageUrl)}
                      disabled={!selectedAsset.imageUrl}
                      className="px-5 py-2 bg-brand-accent hover:bg-brand-accent/80 disabled:opacity-50 border border-brand-accent/20 rounded text-[10px] font-bold uppercase tracking-widest text-white transition-all flex items-center gap-2"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Open in Workspace
                    </button>
                    <button 
                      onClick={() => setSelectedAsset(null)}
                      className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-4 p-2 bg-zinc-900 border border-zinc-800 rounded text-[9px] mono text-zinc-500 flex justify-between items-center">
          <span>STATUS: CONNECTED | UID="${user?.uid.substring(0,8)}..." | ASSETS=${assets.length}</span>
          <div className="flex gap-2">
            <button 
              onClick={handleSyncLibrary} 
              disabled={isRefreshing}
              className="px-2 py-0.5 hover:text-white transition-colors border border-white/10 rounded uppercase text-[8px] tracking-tighter"
            >
              Sync_Library
            </button>
            <button onClick={handleRefresh} className="p-1 hover:text-white transition-colors"><RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} /></button>
          </div>
        </div>
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs mono">
            ERR: {errorMsg.toUpperCase()}
          </div>
        )}
        {assets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded bg-zinc-800/50 flex items-center justify-center border border-brand-border">
              <ImageIcon className="w-8 h-8 text-zinc-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-300">No assets found</h3>
              <p className="text-[11px] text-zinc-500 mono uppercase mb-4">Your generated sheets will appear here once you login and generate.</p>
              <button 
                onClick={handleSyncLibrary}
                className="px-6 py-2 bg-zinc-800 border border-brand-border rounded text-[10px] mono text-zinc-400 hover:text-white transition-colors"
              >
                RUN_RECOVERY_SYNC
              </button>
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
                <div 
                  className="aspect-square bg-black/40 relative overflow-hidden cursor-zoom-in"
                  onClick={() => setSelectedAsset(asset)}
                >
                  <SafeAssetImage 
                    asset={asset} 
                    className="group-hover:scale-105"
                    onUrlResolved={(url) => updateAssetUrl(asset.id, url)} 
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAsset(asset);
                      }}
                      className="p-3 bg-brand-accent rounded-full text-white shadow-xl shadow-brand-accent/20 hover:scale-110 transition-transform"
                      title="Preview"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (asset.imageUrl) onSelect(asset.imageUrl);
                      }}
                      disabled={!asset.imageUrl}
                      className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 disabled:opacity-30 hover:scale-110"
                      title="Open in Workspace"
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] text-white font-medium truncate uppercase flex-1">{asset.prompt}</p>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(asset);
                      }}
                      className="p-1 text-zinc-500 hover:text-red-500 transition-all shrink-0"
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
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
