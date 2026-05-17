import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ArrowLeft, Wand2, Loader2, RefreshCw, Grid3X3, XCircle, Check, Database, Cloud, Terminal, Settings, Key, Info, Save, Copy } from 'lucide-react';
import { STYLE_PRESETS, GenerationConfig } from '../types';
import { formatPrompt, cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getIdToken } from 'firebase/auth';

interface GenerationViewProps {
  key?: string;
  initialPrompt?: string;
  onGenerated: (url: string, gridSize: string) => void;
  onBack: () => void;
}

export default function GenerationView({ initialPrompt, onGenerated, onBack }: GenerationViewProps) {
  const { user } = useAuth();
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: initialPrompt || '',
    style: STYLE_PRESETS[0].prompt,
    id: STYLE_PRESETS[0].id,
    gridSize: '4x4',
    iconSize: '256x256',
    preferredEngine: 'GEMINI',
    field: 'Pendidikan',
    mascotType: 'Hewan',
    category: 'Game',
    colorTheme: 'Biru Professional',
    useCustomPrompt: false
  });

  const FIELDS = ['Pendidikan', 'Kesehatan', 'Hukum', 'Teknologi', 'Bisnis', 'Hiburan', 'Militer', 'Olahraga', 'Lingkungan', 'Seni'];
  const MASCOTS = ['Hewan', 'Manusia', 'Tumbuhan', 'Benda', 'Robot', 'Makhluk Fantasi', 'Abstrak'];
  const CATEGORIES = ['Game', 'Website', 'Mobile App'];
  const COLORS = ['Biru Professional', 'Hijau Sejuk', 'Merah Berani', 'Kuning Ceria', 'Ungu Mewah', 'Hitam Elegan', 'Putih Bersih', 'Neon Cyberpunk', 'Pastel Lembut', 'Emas Mewah'];
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'PREPARING' | 'SYNTHESIZING' | 'UPLOADING' | 'FINALIZING'>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [stabilityKey, setStabilityKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeEngine, setActiveEngine] = useState<'GEMINI' | 'STABILITY' | 'STABILITY_CORE'>('GEMINI');
  const isCancelledRef = useRef(false);

  const STATUS_MESSAGES = {
    IDLE: 'Idle',
    PREPARING: 'Preparing creative brief...',
    SYNTHESIZING: 'Architecting canvas & synthesizing assets...',
    UPLOADING: 'Syncing assets to cloud storage...',
    FINALIZING: 'Finalizing metadata structures...',
  };

  // Fetch recent prompts and config on load
  useEffect(() => {
    const maskKey = (key: string) => {
      if (!key || key.length < 8) return 'sk-*******';
      return `${key.slice(0, 3)}*******${key.slice(-3)}`;
    };

    if (user) {
      const fetchData = async () => {
        try {
          // Fetch history
          const q = query(
            collection(db, `users/${user.uid}/history`),
            orderBy('timestamp', 'desc'),
            limit(5)
          );
          const snapshot = await getDocs(q);
          setRecentPrompts(snapshot.docs.map(doc => doc.data().prompt));

          // Fetch stability key (masked)
          const configDoc = await getDoc(doc(db, `users/${user.uid}/private`, 'config'));
          if (configDoc.exists()) {
            const key = configDoc.data().stabilityApiKey;
            if (key) {
              setStabilityKey(maskKey(key));
              setConfig(prev => ({ ...prev, preferredEngine: 'STABILITY' }));
              setActiveEngine('STABILITY');
            }
          }
        } catch (err) {
          console.error("Failed to fetch user data", err);
        }
      };
      fetchData();
    }
  }, [user]);

  const handleSaveKey = async () => {
    if (!user || !stabilityKey || stabilityKey.includes('*')) return;
    setIsSavingKey(true);
    try {
      await setDoc(doc(db, `users/${user.uid}/private`, 'config'), {
        stabilityApiKey: stabilityKey,
        updatedAt: serverTimestamp()
      });
      // Mask the key immediately after saving
      const masked = `${stabilityKey.slice(0, 3)}*******${stabilityKey.slice(-3)}`;
      setStabilityKey(masked);
      setConfig(prev => ({ ...prev, preferredEngine: 'STABILITY' }));
      setShowSettings(false);
    } catch (err) {
      console.error("Failed to save key", err);
      // More descriptive error for users
      alert("Failed to save API Key. Check your permissions.");
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleTestConnection = async () => {
    if (!user) return;
    setIsTestingConnection(true);
    setTestResult(null);
    try {
      const authToken = await getIdToken(user);
      const response = await fetch('/api/test-firestore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken })
      });
      const data = await response.json();
      
      // Construct a consolidated status message
      let message = "";
      let isSuccess = false;

      const identityMsg = data.identity && data.identity !== 'unknown' 
          ? `\n\nIdentity: ${data.identity}`
          : '';

      const isFirestoreSuccess = data.auth === 'success' && (data.firestore || '').includes('success');
      
      if (isFirestoreSuccess) {
        message = `✅ Auth & Firestore: Project "${data.project}".`;
        isSuccess = true;
      } else {
        message = `❌ Firestore: ${data.firestore === 'error' ? data.error : (data.firestore || 'Failed')}.`;
      }

      if (data.storage === 'success') {
        message += `\n✅ Storage: Accessible.`;
      } else {
        const isBucketMissing = (data.storageError || '').includes('not exist') || (data.storageError || '').includes('404');
        message += `\n❌ Storage: ${data.storageError || 'Access denied'}.`;
        
        if (isBucketMissing) {
           message += `\n\n[STORAGE FIX]: The bucket "${data.project}.firebasestorage.app" (or ".appspot.com") was not found. Please go to the Firebase Console -> Search for "Storage" -> click "Get Started" to initialize your storage bucket.`;
        }
        isSuccess = false; // Even if Firestore works, if Storage fails, it's not a full success
      }

      if (!isSuccess) {
        message += `\n\n[IAM FIX]: Ensure ${data.identity || 'the service account'} has both "Cloud Datastore User" and "Storage Object Admin" roles in project "${data.project || 'juaravibecodingastrea'}".`;
      }

      setTestResult({ 
        success: isSuccess, 
        message: message + identityMsg
      });
    } catch (err: any) {
      setTestResult({ success: false, message: `Error: ${err.message}` });
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleStop = () => {
    isCancelledRef.current = true;
    setIsGenerating(false);
    setError("SYNTHESIS_ABORTED: Generation stopped by user.");
  };

  const handleGenerate = async () => {
    const isGuidedValid = !config.useCustomPrompt && config.field && config.mascotType;
    const isCustomValid = config.useCustomPrompt && config.prompt;
    if (!isGuidedValid && !isCustomValid) return;
    
    setIsGenerating(true);
    setStatus('PREPARING');
    setError(null);
    isCancelledRef.current = false;
    
    try {
      let authToken = null;
      // Save history to Firebase if user is logged in
      if (user) {
        try {
          authToken = await getIdToken(user);
          const historyPrompt = config.useCustomPrompt 
            ? config.prompt 
            : `${config.field} ${config.mascotType} ${config.category} (${config.colorTheme})`;
            
          await addDoc(collection(db, `users/${user.uid}/history`), {
            prompt: historyPrompt,
            timestamp: serverTimestamp()
          });
          setRecentPrompts(prev => [historyPrompt, ...prev.slice(0, 4)]);
        } catch (err) {
          console.error("Auth/History error:", err);
        }
      }

      setStatus('SYNTHESIZING');
      const fullPrompt = formatPrompt(config);
      
      console.log("%c[ICON_SLICER_ENGINE] PROMPT_DISPATCHED", "color: #01ff88; font-weight: bold; background: #000; padding: 2px 5px; border-radius: 3px;");
      console.log("%cPrompt:", "color: #01ff88;", fullPrompt);
      console.log("%cConfig:", "color: #888;", config);
      
      const response = await fetch('/api/generate-icons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: fullPrompt,
          authToken: authToken,
          preferredEngine: config.preferredEngine,
          styleId: config.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const imageUrl = data.image;

      if (data.engine === 'stability') {
        setActiveEngine('STABILITY');
      } else if (data.engine === 'stability_core') {
        setActiveEngine('STABILITY_CORE');
      } else {
        setActiveEngine('GEMINI');
      }

      if (isCancelledRef.current) return;

      if (imageUrl) {
        // Upload to Firebase Storage if user is authenticated
        if (user) {
          setStatus('UPLOADING');
          console.log("[Storage] Starting upload to Firebase Storage...");
          try {
            const storagePath = `users/${user.uid}/generations/${Date.now()}.png`;
            console.log(`[Storage] Target path: ${storagePath}`);
            
            const idToken = await user.getIdToken();
            
            // 1. Upload to server
            const uploadResp = await fetch('/api/upload-to-storage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                authToken: idToken, 
                filePath: storagePath,
                fileData: imageUrl, // Base64 data from Gemini/Stability
                contentType: 'image/png',
                metadata: {
                  prompt: config.prompt,
                  style: config.style,
                  gridSize: config.gridSize,
                  iconSize: config.iconSize,
                  type: 'generated'
                }
              })
            });

            if (!uploadResp.ok) {
               const errData = await uploadResp.json();
               throw new Error(`Upload failed: ${errData.error}`);
            }
            
            const { docId, imageUrl: finalizedUrl } = await uploadResp.json();
            console.log(`[Storage] Server success. Doc ID: ${docId}`);

            if (!isCancelledRef.current) {
              onGenerated(finalizedUrl, config.gridSize);
            }
          } catch (err: any) {
            console.error("Storage/Firestore error during upload phase:", err);
            
            // Helpful message for the user
            let msg = err.message;
            if (msg.includes('storage/unauthorized')) {
               msg = `PERM_DENIED: Firebase Storage bucket permissions error.\n\nACTION: Grant "Storage Object Admin" to "${user?.email || 'your account'}" and the sandbox service account in GCP IAM.`;
            } else if (msg.includes('storage/retry-limit-exceeded')) {
               msg = "STORAGE_ERROR: Network timeout or bucket not found.";
            }

            setError(`PHASE_FAILED (${status}): ${msg}`);

            if (!isCancelledRef.current) {
              console.warn("[Fallback] Defaulting to base64 image due to upload failure. This will NOT be saved to Cloud Assets.");
              onGenerated(imageUrl, config.gridSize); // Fallback to avoid getting stuck
            }
          }
        } else {
          onGenerated(imageUrl, config.gridSize);
        }
      } else {
        throw new Error("No image was returned from the server.");
      }
    } catch (err: any) {
      if (isCancelledRef.current) return;
      console.error("Generation Error:", err);
      setError(err.message || "Failed to generate image. Please check your API key and prompt.");
    } finally {
      if (!isCancelledRef.current) {
        setIsGenerating(false);
        setStatus('IDLE');
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex bg-bg-dark h-full overflow-hidden"
    >
      <div className="w-72 bg-bg-panel border-r border-brand-border flex flex-col shrink-0">
        <div className="p-4 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              onClick={onBack}
              className="p-1.5 hover:bg-white/5 rounded-md text-brand-text-muted hover:text-white transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Config</span>
          </div>
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              "p-1.5 rounded-md transition-all",
              showSettings ? "bg-brand-accent/20 text-brand-accent" : "hover:bg-white/5 text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 relative">
          <AnimatePresence>
            {showSettings && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden border-b border-brand-border mb-6 pb-6"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2 p-2 bg-blue-500/5 border border-blue-500/10 rounded">
                    <Info className="w-3 h-3 text-blue-400 shrink-0" />
                    <p className="text-[9px] text-blue-300 leading-tight">
                      Use SDXL 1.0 engine for higher quality and faster generation. Provide your API key below.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5">
                      <Key className="w-2.5 h-2.5" />
                      Stability API Key
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={stabilityKey}
                        onChange={(e) => setStabilityKey(e.target.value)}
                        placeholder="sk-..."
                        className="input-dark flex-1 h-8 text-[10px] mono"
                      />
                      <button 
                        onClick={handleSaveKey}
                        disabled={isSavingKey || !stabilityKey || stabilityKey.includes('*')}
                        className="p-2 bg-brand-accent rounded text-black disabled:opacity-30 transition-all active:scale-95"
                      >
                        {isSavingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[8px] text-zinc-600 italic">
                      Your key is stored securely in your private user profile and never exposed to other users.
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <button 
                      onClick={handleTestConnection}
                      disabled={isTestingConnection}
                      className={cn(
                        "w-full py-2 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                        "bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300"
                      )}
                    >
                      {isTestingConnection ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                      Test Firestore Connection
                    </button>
                    {testResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "mt-2 p-2 rounded text-[9px] mono leading-tight",
                          testResult.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                        )}
                      >
                        {testResult.message}
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <section>
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Model Core</h3>
            
            <div className="flex bg-zinc-900/50 p-1 rounded-lg border border-brand-border mb-6 flex-wrap gap-1">
              <button 
                onClick={() => setConfig({...config, preferredEngine: 'GEMINI'})}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all",
                  config.preferredEngine === 'GEMINI' ? "bg-white/10 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Gemini
              </button>
              <button 
                onClick={() => {
                  if (stabilityKey && !stabilityKey.includes('*')) {
                    setConfig({...config, preferredEngine: 'STABILITY'});
                  } else {
                    setShowSettings(true);
                  }
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1",
                  config.preferredEngine === 'STABILITY' ? "bg-brand-accent text-black shadow-[0_0_10px_rgba(var(--brand-accent-rgb),0.3)]" : "text-zinc-500 hover:text-zinc-300",
                  (!stabilityKey || stabilityKey.includes('*')) && config.preferredEngine !== 'STABILITY' && "opacity-50"
                )}
              >
                SDXL {!stabilityKey && <Key className="w-2.5 h-2.5" />}
              </button>
              <button 
                onClick={() => {
                  if (stabilityKey && !stabilityKey.includes('*')) {
                    setConfig({...config, preferredEngine: 'STABILITY_CORE'});
                  } else {
                    setShowSettings(true);
                  }
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1",
                  config.preferredEngine === 'STABILITY_CORE' ? "bg-brand-accent text-black shadow-[0_0_10px_rgba(var(--brand-accent-rgb),0.3)]" : "text-zinc-500 hover:text-zinc-300",
                  (!stabilityKey || stabilityKey.includes('*')) && config.preferredEngine !== 'STABILITY_CORE' && "opacity-50"
                )}
              >
                Core 3.5 {!stabilityKey && <Key className="w-2.5 h-2.5" />}
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-zinc-400 font-medium">Guided Generation</label>
                  <button 
                    onClick={() => setConfig({ ...config, useCustomPrompt: !config.useCustomPrompt })}
                    className={cn(
                      "text-[9px] px-2 py-0.5 rounded border transition-all",
                      config.useCustomPrompt 
                        ? "bg-brand-accent/20 border-brand-accent/30 text-brand-accent" 
                        : "bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {config.useCustomPrompt ? "Switch to Guided" : "Switch to Custom"}
                  </button>
                </div>

                {!config.useCustomPrompt ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Bidang / Domain</label>
                      <select 
                        value={config.field}
                        onChange={(e) => setConfig({ ...config, field: e.target.value })}
                        className="input-dark w-full h-9 text-xs"
                      >
                        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Tipe Maskot</label>
                      <select 
                        value={config.mascotType}
                        onChange={(e) => setConfig({ ...config, mascotType: e.target.value })}
                        className="input-dark w-full h-9 text-xs"
                      >
                        {MASCOTS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Kategori</label>
                      <select 
                        value={config.category}
                        onChange={(e) => setConfig({ ...config, category: e.target.value })}
                        className="input-dark w-full h-9 text-xs"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Tema Warna</label>
                      <select 
                        value={config.colorTheme}
                        onChange={(e) => setConfig({ ...config, colorTheme: e.target.value })}
                        className="input-dark w-full h-9 text-xs"
                      >
                        {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold ml-1">Creative Brief (Custom)</label>
                    <textarea 
                      value={config.prompt}
                      onChange={(e) => setConfig({ ...config, prompt: e.target.value })}
                      placeholder="e.g. isometric magic potions with glowing particles..."
                      className="input-dark w-full h-32 resize-none leading-relaxed focus:border-brand-accent/40"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[11px] text-zinc-400 font-medium italic">Style Matrix</label>
                  <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">Select one</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_PRESETS.map((p) => {
                    const isActive = config.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setConfig({ ...config, style: p.prompt, id: p.id } as any)}
                        className={cn(
                          "relative h-20 rounded border flex flex-col items-center justify-center p-2 transition-all transition-all duration-300 overflow-hidden group",
                          isActive 
                            ? "bg-brand-accent/20 border-brand-accent shadow-[0_0_15px_rgba(var(--brand-accent-rgb),0.1)]" 
                            : "bg-zinc-800/30 border-zinc-700/50 hover:border-zinc-500 hover:bg-zinc-800/50"
                        )}
                      >
                        {/* Style representative background (abstract) */}
                        <div className={cn(
                          "absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity",
                          p.id === 'fantasy' && "bg-gradient-to-br from-amber-900 to-stone-900",
                          p.id === 'scifi' && "bg-gradient-to-br from-blue-900 to-cyan-900",
                          p.id === 'pixel' && "bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:4px_4px]",
                          p.id === 'minimal' && "bg-white/5",
                          p.id === '3d-clay' && "bg-gradient-to-br from-pink-900 to-purple-900",
                          p.id === 'flat' && "bg-gradient-to-br from-green-900 to-emerald-900",
                          p.id === 'custom' && "bg-zinc-900",
                        )} />
                        
                        <span className={cn(
                          "text-[9px] font-bold uppercase tracking-tighter mb-1 relative z-10",
                          isActive ? "text-brand-accent" : "text-zinc-400 group-hover:text-zinc-200"
                        )}>
                          {p.name}
                        </span>
                        
                        {isActive && (
                          <div className="absolute top-1 right-1">
                            <Check className="w-2.5 h-2.5 text-brand-accent" />
                          </div>
                        )}
                        
                        <div className="w-8 h-1 bg-white/10 rounded-full mt-2 relative z-10 overflow-hidden">
                           <motion.div 
                             initial={false}
                             animate={{ width: isActive ? "100%" : "0%" }}
                             className="h-full bg-brand-accent"
                           />
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                {/* Style Details */}
                {STYLE_PRESETS.find(p => p.id === (config as any).id) && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-white/5 border border-brand-border rounded-md space-y-2"
                  >
                    <p className="text-[10px] text-zinc-400 leading-relaxed italic">
                      "{STYLE_PRESETS.find(p => p.id === (config as any).id)?.description}"
                    </p>
                    <div className="pt-2 border-t border-white/5">
                       <label className="text-[9px] font-bold text-zinc-500 uppercase mb-1.5 block">Style Modifier Prompt</label>
                       <textarea 
                         value={config.style}
                         onChange={(e) => setConfig({ ...config, style: e.target.value })}
                         className="w-full bg-transparent border-none p-0 text-[10px] text-zinc-300 focus:ring-0 resize-none h-12 mono leading-tight"
                         placeholder="Add specific style details..."
                       />
                    </div>
                  </motion.div>
                )}

                {/* Prompt Generator Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Terminal className="w-2.5 h-2.5" />
                      System Prompt Preview
                    </label>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(formatPrompt(config));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="text-[9px] px-2 py-1 flex items-center gap-1.5 text-zinc-500 hover:text-brand-accent transition-colors"
                    >
                      {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="p-3 bg-black/40 border border-brand-border rounded-md group relative">
                    <p className="text-[9px] text-zinc-400 mono leading-relaxed h-16 overflow-y-auto scrollbar-hide break-words">
                      {formatPrompt(config)}
                    </p>
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                    </div>
                    <div className="absolute bottom-2 right-2 text-[8px] text-zinc-600 font-bold uppercase pointer-events-none">
                      Autogen Live
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 block ml-1 font-medium">Grid</label>
                  <select 
                    value={config.gridSize}
                    onChange={(e) => setConfig({ ...config, gridSize: e.target.value })}
                    className="input-dark w-full focus:border-brand-accent/40"
                  >
                    <option value="4x4">4x4</option>
                    <option value="8x8">8x8</option>
                    <option value="single">1x1</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] text-zinc-400 block ml-1 font-medium">Size</label>
                  <select 
                    value={config.iconSize}
                    onChange={(e) => setConfig({ ...config, iconSize: e.target.value })}
                    className="input-dark w-full focus:border-brand-accent/40"
                  >
                    <option value="256x256">256px</option>
                    <option value="512x512">512px</option>
                  </select>
                </div>
              </div>

              {recentPrompts.length > 0 && (
                <div className="pt-4 mt-2 border-t border-brand-border space-y-3">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Recent History</h4>
                  <div className="space-y-1.5">
                    {recentPrompts.map((p, i) => (
                      <div 
                        key={i} 
                        onClick={() => setConfig({ ...config, prompt: p })}
                        className="text-[10px] text-zinc-400 p-2 bg-zinc-800/30 rounded border border-zinc-700/30 truncate cursor-pointer hover:border-zinc-500 hover:text-white transition-all mono"
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-[10px] mono">
                  ERR: {error.toUpperCase()}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-brand-border space-y-3">
          {!user && (
            <div className="p-2 bg-amber-500/5 border border-amber-500/10 rounded flex items-start gap-2">
               <Info className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
               <p className="text-[9px] text-amber-400 leading-tight">
                 <span className="font-bold">AUTH_REQUIRED:</span> Assets won't be saved to your cloud gallery unless you are signed in.
               </p>
            </div>
          )}
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="w-full py-2.5 bg-red-600/10 text-red-500 border border-red-500/20 rounded text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-600/20 transition-all shadow-lg shadow-red-500/5 active:scale-95"
            >
              <XCircle className="w-3.5 h-3.5" />
              Stop Synthesis
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!config.useCustomPrompt && (!config.field || !config.mascotType) || (config.useCustomPrompt && !config.prompt)}
              className={cn(
                "btn-primary w-full py-2.5 text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/10",
                ((!config.useCustomPrompt && (!config.field || !config.mascotType)) || (config.useCustomPrompt && !config.prompt)) && "opacity-30 cursor-not-allowed"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate Sheet
            </button>
          )}
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 canvas-bg relative flex flex-col">
        <header className="h-10 border-b border-brand-border px-4 flex items-center justify-between bg-bg-panel/50 backdrop-blur-sm">
          <div className="flex gap-4">
             <div className="flex items-center gap-1.5 mono text-[10px] text-zinc-500">
               <div className={cn("w-1.5 h-1.5 rounded-full", isGenerating ? "bg-amber-500 animate-pulse" : "bg-green-500")}></div>
               STATUS: {isGenerating ? "GENERATING" : "IDLE"}
             </div>
             <div className="mono text-[10px] text-zinc-500 uppercase">
               ENGINE: {
                 (isGenerating ? config.preferredEngine : activeEngine) === 'STABILITY' 
                   ? 'STABILITY_XL_1.0' 
                   : (isGenerating ? config.preferredEngine : activeEngine) === 'STABILITY_CORE'
                   ? 'STABILITY_CORE_3.5'
                   : 'GEMINI_2.0_FLASH'
               }
             </div>
          </div>
          {((isGenerating ? config.preferredEngine : activeEngine) === 'STABILITY' || (isGenerating ? config.preferredEngine : activeEngine) === 'STABILITY_CORE') && (
            <div className="flex items-center gap-2 px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/20 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-brand-accent" />
              <span className="text-[9px] text-brand-accent font-bold uppercase tracking-tighter">HD Mode Active</span>
            </div>
          )}
        </header>
        
        <div className="flex-1 flex items-center justify-center p-12">
          {isGenerating ? (
             <div className="max-w-md w-full space-y-8 text-center">
               <div className="flex justify-center gap-4 relative">
                 <motion.div 
                   animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                   transition={{ repeat: Infinity, duration: 4 }}
                   className={cn(
                     "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500",
                     status === 'PREPARING' ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-600"
                   )}
                 >
                   <Terminal className="w-8 h-8" />
                 </motion.div>
                 <motion.div 
                   animate={{ scale: [1, 1.2, 1] }}
                   transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                   className={cn(
                     "w-20 h-20 rounded-full flex items-center justify-center relative transition-all duration-500",
                     status === 'SYNTHESIZING' ? "bg-brand-accent/20 text-brand-accent scale-110" : "bg-zinc-800 text-zinc-600 shadow-none"
                   )}
                 >
                   <div className={cn(
                     "absolute inset-0 rounded-full border-2 border-brand-accent/20 border-t-brand-accent transition-opacity duration-500",
                     status === 'SYNTHESIZING' ? "opacity-100 animate-spin" : "opacity-0"
                   )} />
                   <Wand2 className="w-10 h-10" />
                 </motion.div>
                 <motion.div 
                   animate={{ scale: [1, 1.1, 1], y: [0, -5, 0] }}
                   transition={{ repeat: Infinity, duration: 3, delay: 1 }}
                   className={cn(
                     "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500",
                     (status === 'UPLOADING' || status === 'FINALIZING') ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-600"
                   )}
                 >
                   <Cloud className="w-8 h-8" />
                 </motion.div>
               </div>
               
               <div className="space-y-3">
                 <div className="flex items-center justify-center gap-2">
                   <h2 className="text-sm font-bold uppercase tracking-[0.2em]">{status} PHASE</h2>
                   <div className="flex gap-0.5">
                     {[0, 1, 2].map(i => (
                       <motion.div
                         key={i}
                         animate={{ opacity: [0, 1, 0] }}
                         transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                         className="w-1 h-1 bg-brand-accent rounded-full"
                       />
                     ))}
                   </div>
                 </div>
                 <p className="text-[11px] text-zinc-500 mono uppercase tracking-wider h-4">
                   {STATUS_MESSAGES[status]}
                 </p>
                 
                 <div className="pt-4 flex flex-col items-center gap-4">
                   <div className="w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
                     <motion.div 
                       className="h-full bg-brand-accent shadow-[0_0_10px_rgba(var(--brand-accent-rgb),0.5)]"
                       initial={{ width: "0%" }}
                       animate={{ 
                         width: status === 'PREPARING' ? "15%" : 
                                status === 'SYNTHESIZING' ? "60%" : 
                                status === 'UPLOADING' ? "85%" : 
                                status === 'FINALIZING' ? "95%" : "0%" 
                       }}
                       transition={{ duration: 1 }}
                     />
                   </div>
                   <button 
                    onClick={handleStop} 
                    className="group flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/20 hover:bg-red-500/5 text-[9px] mono text-red-500 uppercase tracking-tighter transition-all"
                   >
                     <XCircle className="w-3 h-3 transition-transform group-hover:rotate-90" />
                     Force Abort Job
                   </button>
                 </div>
               </div>
             </div>
          ) : (
            <div className="max-w-md text-center space-y-4">
               <div className="w-16 h-16 rounded bg-zinc-800/50 flex items-center justify-center mx-auto border border-brand-border text-zinc-600">
                 <Grid3X3 className="w-8 h-8" />
               </div>
               <p className="text-zinc-500 text-[11px] mono uppercase leading-loose">
                 Enter a brief on the left to begin asset synthesis.<br/>
                 The engine will generate a consistent {config.gridSize} layout.
               </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
