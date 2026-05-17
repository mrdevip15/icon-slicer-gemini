import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[Firebase] Loaded config for project: ${firebaseConfig.projectId}`);
  }
} catch (e) {
  console.error("[Firebase] Failed to load firebase-applet-config.json:", e);
}

// Ensure database is initialized correctly with the specific database ID if provided
let db: admin.firestore.Firestore;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  let firebaseApp: admin.app.App;
  const configProjectId = firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
  const envProjectId = process.env.GOOGLE_CLOUD_PROJECT;
  
  console.log(`[Firebase] Config Project ID: "${configProjectId}"`);
  console.log(`[Firebase] Environment Project ID: "${envProjectId}"`);

  // Detect real identity (important for IAM debug)
  try {
    // Standard AbortController for timeouts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    
    const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const email = await response.text();
      console.log(`
[IDENTITY] Your app is executing as service account: 
>> ${email} <<

[IAM ACTION REQUIRED]
1. Open Google Cloud Console: https://console.cloud.google.com/iam-admin/iam?project=${configProjectId}
2. Find (or Add) the email above: ${email}
3. Assign the role: "Cloud Datastore User"
      `);
    } else {
       console.log(`[IDENTITY] Metadata check returned status: ${response.status}`);
    }
  } catch (e) {
    console.log(`[IDENTITY] Metadata check skipped (likely running locally or on non-GCP environment)`);
  }

  if (!admin.apps.length) {
    // Try explicit config project first if it exists, otherwise default
    const initOptions: any = {};
    if (configProjectId) initOptions.projectId = configProjectId;
    if (firebaseConfig.storageBucket) initOptions.storageBucket = firebaseConfig.storageBucket;
    
    console.log(`[Firebase] Initializing admin with options: ${JSON.stringify(initOptions)}`);
    firebaseApp = admin.initializeApp(initOptions);
  } else {
    firebaseApp = admin.app();
    console.log(`[Firebase] Using existing app: ${firebaseApp.options.projectId}`);
  }

  const currentProjectId = firebaseApp.options.projectId;
  console.log(`[Firebase] App Project ID: "${currentProjectId}"`);

  // Initialize Firestore
  try {
    const dbId = firebaseConfig.firestoreDatabaseId;
    console.log(`[Firestore] CONFIG: Project="${currentProjectId}", Database="${dbId || '(default)'}"`);
    
    db = dbId ? getFirestore(firebaseApp, dbId) : getFirestore(firebaseApp);
    console.log(`[Firestore] Connected to: "${dbId || '(default)'}"`);
  } catch (dbInitErr: any) {
    console.error(`[Firestore] Init error: ${dbInitErr.message}`);
    db = getFirestore(firebaseApp);
  }

  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  app.use(express.json({ limit: '10mb' }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // TEST ENDPOINT: Verifies Firestore and Auth without consuming credits
  app.post("/api/test-firestore", async (req, res) => {
    const { authToken } = req.body;
    if (!authToken) return res.status(400).json({ error: "Missing authToken" });

    let status: any = {
      auth: "pending",
      firestore: "pending",
      storage: "pending",
      keyFound: false,
      identity: "unknown",
      details: []
    };

    try {
      // Get identity
      try {
        const response = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: AbortSignal.timeout(1000)
        });
        if (response.ok) {
          status.identity = await response.text();
        }
      } catch (e) {}

      const auth = firebaseApp.auth();
      const decodedToken = await auth.verifyIdToken(authToken);
      const userId = decodedToken.uid;
      status.auth = "success";
      status.userId = userId;
      status.project = currentProjectId;

      const configPath = `users/${userId}/private/config`;
      const currentDbId = firebaseConfig.firestoreDatabaseId || '(default)';
      
      // 1. Test Firestore
      try {
        const configDoc = await db.collection('users').doc(userId).collection('private').doc('config').get();
        if (configDoc.exists) {
          status.firestore = "success";
          status.keyFound = true;
          status.databaseUsed = currentDbId;
        } else {
          status.firestore = "doc_not_found";
          status.path = configPath;
          
          // Try fallback 1
          try {
            const defaultDb = firebaseApp.firestore();
            const fallDoc = await defaultDb.collection('users').doc(userId).collection('private').doc('config').get();
            if (fallDoc.exists) {
              status.firestore = "success_via_fallback_1";
              status.keyFound = true;
              status.databaseUsed = "(default)";
            }
          } catch (e) {}
        }
      } catch (dbErr: any) {
        status.firestore = "error";
        status.error = dbErr.message;
        status.code = dbErr.code;
        
        if (dbErr.code === 7) {
           console.error(`[IAM HELP] To fix PERMISSION_DENIED: Go to GCP Console > IAM & Admin for project "${currentProjectId}", and grant "Cloud Datastore User" to the service account running this app.`);
        }
      }

      // 2. Test Storage (Service Account permissions)
      try {
        const bucketName = firebaseApp.options.storageBucket;
        console.log(`[Storage] Probing bucket: "${bucketName || '(default)'}"`);
        const bucket = firebaseApp.storage().bucket();
        // Just check if bucket exists or list one file with prefix to check permissions
        // We can try to list files with a non-existent prefix
        await bucket.getFiles({ prefix: 'test-permission-check-', maxResults: 1 });
        status.storage = "success";
      } catch (storageErr: any) {
        status.storage = "error";
        status.storageError = storageErr.message;
        console.error(`[Storage] Test failed: ${storageErr.message}`);
        
        if (storageErr.message.includes('permission') || storageErr.message.includes('403')) {
           console.error(`[IAM HELP] To fix STORAGE_PERMISSION_DENIED: Go to GCP Console > IAM & Admin for project "${currentProjectId}", and grant "Storage Object Admin" to the service account running this app.`);
        } else if (storageErr.message.includes('not exist') || storageErr.message.includes('404')) {
           console.error(`[STORAGE HELP] BUCKET NOT FOUND. Ensure you have "Started" Cloud Storage in the Firebase Console and that the bucket name in firebase-applet-config.json is correct.`);
        }
      }

    } catch (authErr: any) {
      status.auth = "failed";
      status.error = authErr.message;
    }

    res.json(status);
  });

  // NEW: Direct upload to Storage (Bypasses rules for authenticated users via Admin SDK)
  app.post("/api/upload-to-storage", async (req, res) => {
    const { authToken, filePath, fileData, contentType, metadata } = req.body;
    if (!authToken || !filePath || !fileData) {
      return res.status(400).json({ error: "Missing parameters (authToken, filePath, or fileData)" });
    }

    try {
      const auth = firebaseApp.auth();
      const decodedToken = await auth.verifyIdToken(authToken);
      const userId = decodedToken.uid;

      // Security Check: Only allow uploads to their own user directory
      if (!filePath.startsWith(`users/${userId}/`)) {
        return res.status(403).json({ error: "Unauthorized: You can only upload to your own directory." });
      }

      console.log(`[Storage Server] Receiving upload for: ${filePath} (${contentType})`);

      // Convert base64 to buffer
      const base64Data = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
      const buffer = Buffer.from(base64Data, 'base64');

      const bucket = firebaseApp.storage().bucket();
      const file = bucket.file(filePath);

      await file.save(buffer, {
        metadata: {
          contentType: contentType || 'image/png',
        },
        resumable: false // Better for small files
      });

      console.log(`[Storage Server] Successfully saved: ${filePath}`);

      // NEW: Also create Firestore entry to ensure sync
      let docId = null;
      if (metadata) {
        try {
          console.log(`[Firestore Server] Creating metadata entry for user: ${userId}`);
          const iconSetsCol = db.collection('iconSets');
          const docRef = await iconSetsCol.add({
            ownerId: userId,
            ...metadata,
            imageUrl: "", // Client will resolve via storagePath
            storagePath: filePath,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            serverUploaded: true
          });
          docId = docRef.id;
          console.log(`[Firestore Server] Entry created: ${docId}`);
        } catch (fsErr: any) {
          console.error("[Firestore Server] Failed to create entry:", fsErr.message);
        }
      }

      const proxyUrl = `/api/asset-proxy?path=${encodeURIComponent(filePath)}&authToken=${authToken}`;
      res.json({ success: true, path: filePath, docId, imageUrl: proxyUrl });
    } catch (err: any) {
      console.error("[Storage Server] Failed to upload:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // NEW: Sync Library - Scans storage and creates missing Firestore documents
  app.post("/api/sync-library", async (req, res) => {
    const { authToken } = req.body;
    if (!authToken) return res.status(400).json({ error: "Missing authToken" });

    try {
      const auth = firebaseApp.auth();
      const decodedToken = await auth.verifyIdToken(authToken);
      const userId = decodedToken.uid;

      console.log(`[Sync Server] Scanning library for user: ${userId}`);
      
      const bucket = firebaseApp.storage().bucket();
      const prefix = `users/${userId}/generations/`;
      
      const [files] = await bucket.getFiles({ prefix });
      console.log(`[Sync Server] Found ${files.length} files in Storage.`);

      // Get existing Firestore assets to avoid duplicates
      const existingDocs = await db.collection('iconSets')
        .where('ownerId', '==', userId)
        .get();
      
      const existingPaths = new Set(existingDocs.docs.map(d => d.data().storagePath));
      console.log(`[Sync Server] ${existingPaths.size} files already indexed in Firestore.`);

      let createdCount = 0;
      const results = [];

      for (const file of files) {
        if (!file.name.endsWith('.png') && !file.name.endsWith('.jpg')) continue;
        if (existingPaths.has(file.name)) continue;

        console.log(`[Sync Server] Indexing missing file: ${file.name}`);
        
        const metadata = {
          ownerId: userId,
          imageUrl: "", // Client will resolve via storagePath
          storagePath: file.name,
          prompt: "Recovered Asset",
          gridSize: "single",
          style: "Recovered",
          type: file.name.includes('_source') ? 'source_upload' : 'generated',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('iconSets').add(metadata);
        createdCount++;
        results.push({ id: docRef.id, path: file.name });
      }

      console.log(`[Sync Server] Sync complete. Created ${createdCount} missing entries.`);
      res.json({ 
        success: true, 
        found: files.length, 
        synced: createdCount,
        results: results 
      });
    } catch (err: any) {
      console.error("[Sync Server] Failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // NEW: Proxy for storage assets (Bypasses rules for thumbnails/previews)
  app.get("/api/asset-proxy", async (req, res) => {
    const { path: storagePath, authToken } = req.query;
    if (!storagePath || !authToken) return res.status(400).send("Missing parameters");

    try {
      const auth = firebaseApp.auth();
      await auth.verifyIdToken(authToken as string);
      // Optional: Check if user owns the asset if path contains userId

      const bucket = firebaseApp.storage().bucket();
      const file = bucket.file(storagePath as string);
      
      const [exists] = await file.exists();
      if (!exists) return res.status(404).send("File not found");

      const [metadata] = await file.getMetadata();
      res.setHeader('Content-Type', metadata.contentType || 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      file.createReadStream().pipe(res);
    } catch (err: any) {
      console.error("[Asset Proxy] Failed:", err.message);
      res.status(500).send(err.message);
    }
  });

  // NEW: Delete asset (Removes from both Storage AND Firestore)
  app.post("/api/delete-asset", async (req, res) => {
    const { docId, storagePath, authToken } = req.body;
    if (!docId || !storagePath || !authToken) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    try {
      const auth = firebaseApp.auth();
      const decodedToken = await auth.verifyIdToken(authToken);
      const userId = decodedToken.uid;

      // Security: Check if path contains userId
      if (!storagePath.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized: You can only delete your own files." });
      }

      console.log(`[Delete Server] deleting storage file: ${storagePath}`);
      const bucket = firebaseApp.storage().bucket();
      const file = bucket.file(storagePath);
      
      try {
        await file.delete();
      } catch (storageErr: any) {
        console.warn(`[Delete Server] Storage file might not exist or failed to delete: ${storageErr.message}`);
      }

      console.log(`[Delete Server] deleting firestore doc: ${docId}`);
      await db.collection('iconSets').doc(docId).delete();

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Delete Server] Failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/generate-icons", async (req, res) => {
    const { prompt, authToken, engineId = 'stable-diffusion-xl-1024-v1-0', preferredEngine, styleId } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    let userId: string | null = null;
    let stabilityKey: string | null = null;

    // Try to get user identity and Stability Key if authToken is provided
    if (authToken) {
      console.log(`[Auth] Attempting to verify token...`);
      try {
        // Explicitly use the admin instance from the initialized app
        const auth = firebaseApp.auth();
        const decodedToken = await auth.verifyIdToken(authToken);
        userId = decodedToken.uid;
        console.log(`[Auth] Token verified for user: ${userId} (UID: ${userId})`);
        
        // Fetch key from Firestore
        const currentDbId = firebaseConfig.firestoreDatabaseId || '(default)';
        try {
          const configPath = `users/${userId}/private/config`;
          console.log(`[Firestore] Fetching config from: ${configPath} (DB: ${currentDbId})`);
          
          const configDoc = await db.collection('users').doc(userId).collection('private').doc('config').get();
          
          if (configDoc.exists) {
            stabilityKey = configDoc.data()?.stabilityApiKey || null;
            console.log(`[Firestore] Key found: ${stabilityKey ? 'YES (masked)' : 'NO (field missing)'}`);
          } else {
            console.warn(`[Firestore] Config document does not exist at ${configPath}. Check if you saved it in the UI.`);
          }
        } catch (dbErr: any) {
          console.error(`[Firestore] Detailed fetch error (${dbErr.code || 'no-code'}):`, dbErr.message);
          
          if (dbErr.code === 7 || dbErr.message.includes('PERMISSION_DENIED')) {
             console.error(`
[IAM ALERT] Permission Denied for Project: "${currentProjectId}", DB: "${currentDbId}". 
To fix:
1. Go to Google Cloud Console > IAM & Admin > IAM.
2. Select project: "${currentProjectId}".
3. Add the "Cloud Datastore User" role to your environment's service account.
             `);
          }

          // If Firestore fails with NOT_FOUND (5) or PERMISSION_DENIED (7)
          const isAccessError = dbErr.code === 5 || dbErr.code === 7 || 
                               dbErr.message.includes('NOT_FOUND') || 
                               dbErr.message.includes('PERMISSION_DENIED');
                               
          if (isAccessError) {
             console.log(`[Firestore] Access issue detected. Trying fallback to "(default)" database...`);
             
             // FALLBACK 1: Try the "(default)" database in the SAME project
             try {
               const defaultDb = firebaseApp.firestore();
               const configDoc = await defaultDb.collection('users').doc(userId).collection('private').doc('config').get();
               if (configDoc.exists) {
                 stabilityKey = configDoc.data()?.stabilityApiKey || null;
                 console.log(`[Firestore] Key found using fallback 1!`);
               }
             } catch (fallbackErr: any) {
               console.error("[Firestore] Fallback 1 failed:", fallbackErr.message);
               
               if (envProjectId && envProjectId !== currentProjectId) {
                 try {
                   const envApp = admin.apps.find(a => a?.options.projectId === envProjectId) || 
                                  admin.initializeApp({ projectId: envProjectId }, `env-fallback-${Date.now()}`);
                   const envDb = envApp.firestore();
                   const configDoc = await envDb.collection('users').doc(userId).collection('private').doc('config').get();
                   if (configDoc.exists) {
                     stabilityKey = configDoc.data()?.stabilityApiKey || null;
                     console.log(`[Firestore] Key found in environment project!`);
                   }
                 } catch (envErr: any) {
                   console.error("[Firestore] Fallback 2 failed:", envErr.message);
                 }
               }
             }
          }
        }
      } catch (authErr: any) {
        console.error("[Auth] Token verification failed:", authErr.message);
        
        // If audience mismatch, try to re-initialize or verify with explicit project IDs
        if (authErr.message.includes('aud') || authErr.message.includes('audience')) {
           console.log("[Auth] Audience mismatch detected. Attempting re-verification with alternative project IDs...");
           const alternatives = [configProjectId, envProjectId].filter(p => p && p !== currentProjectId);
           for (const altId of alternatives) {
             try {
               console.log(`[Auth] Trying verification with project: ${altId}`);
               const altApp = admin.apps.find(a => a?.options.projectId === altId) || 
                              admin.initializeApp({ projectId: altId }, `alt-${altId}`);
               const decodedToken = await altApp.auth().verifyIdToken(authToken);
               userId = decodedToken.uid;
               console.log(`[Auth] SUCCESS verified with project ${altId}. User: ${userId}`);
               // Now try Firestore with this App
               const altDb = firebaseConfig.firestoreDatabaseId 
                 ? getFirestore(altApp, firebaseConfig.firestoreDatabaseId)
                 : getFirestore(altApp);
               const configDoc = await altDb.collection('users').doc(userId).collection('private').doc('config').get();
               if (configDoc.exists) {
                 stabilityKey = configDoc.data()?.stabilityApiKey || null;
                 console.log(`[Firestore] Key found using alternative app!`);
               }
               break; 
             } catch (e: any) {
               console.warn(`[Auth] Failed with ${altId}: ${e.message}`);
             }
           }
        }
      }
    }

    // NO FALLBACK: We strictly use the key from Firestore for Stability AI
    // to prevent accidental consumption of server-side keys.
    if (!stabilityKey) {
      console.log("[Stability] No user-provided key found in Firestore.");
    } else {
      console.log("[Stability] Using user-provided key from Firestore.");
    }

    // If SDXL is preferred, enforce it
    if (preferredEngine === 'STABILITY') {
      if (!stabilityKey) {
        console.log("[Stability] Aborting: No key available for STABILITY engine");
        return res.status(400).json({ 
          error: "Stability API Key not found. Please save your key in the settings panel to use SDXL 1.0 or contact the administrator." 
        });
      }

      console.log(`[Stability] Starting generation for: "${prompt.substring(0, 50)}..."`);
      
      const stylePresetMap: Record<string, string> = {
        'fantasy': 'fantasy-art',
        'scifi': 'digital-art',
        'pixel': 'pixel-art',
        'minimal': 'line-art',
        '3d-clay': '3d-model',
        'flat': 'digital-art'
      };
      const stylePreset = (styleId && stylePresetMap[styleId]) || 'digital-art';
      console.log(`[Stability] Using style preset: ${stylePreset} for styleId: ${styleId}`);

      try {
        const response = await fetch(
          `https://api.stability.ai/v1/generation/${engineId}/text-to-image`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${stabilityKey}`,
            },
            body: JSON.stringify({
              text_prompts: [
                { text: prompt, weight: 1 },
                { text: "text, watermark, low quality, distorted, blurry, artifacts, cropped, worst quality", weight: -1 }
              ],
              cfg_scale: 7,
              height: 1024,
              width: 1024,
              samples: 1,
              steps: 35, 
              style_preset: stylePreset
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Stability API error: ${response.status}`);
        }

        const data: any = await response.json();
        const imageData = data.artifacts[0].base64;
        
        console.log("[Stability] Generation successful");
        return res.json({ image: `data:image/png;base64,${imageData}`, engine: 'stability' });
      } catch (error: any) {
        console.error("[Stability] API error:", error);
        return res.status(500).json({ error: `Stability AI Error: ${error.message}` });
      }
    }

    // Default to Gemini (or if explicitly Gemini)
    console.log(`[Gemini] Starting fallback/default generation for: "${prompt.substring(0, 50)}..."`);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash', 
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let imageData = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageData = part.inlineData.data;
            break;
          }
        }
      }

      if (!imageData) {
        console.error("[Gemini] No image data in response");
        return res.status(500).json({ error: "No image was generated. Please try a different prompt or check your API quota." });
      }

      console.log("[Gemini] Generation successful");
      res.json({ image: `data:image/png;base64,${imageData}` });
    } catch (error: any) {
      console.error("[Gemini] Generation API error:", error);
      
      let message = "Gemini API Error";
      if (error.status === 403) message = "Permission denied. Please check your API key in Settings > Secrets.";
      if (error.status === 429) message = "Quota exceeded. Please wait a moment or upgrade to a paid tier.";
      
      res.status(error.status || 500).json({ error: error.message || message });
    }
  });

  // Mock rembg API route
  // In a real scenario, this would call a real background removal model
  app.post("/api/remove-bg", async (req, res) => {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing image data" });
    }

    try {
      // NOTE: This is a placeholder. 
      // Real background removal usually requires a dedicated model (ONNX/TFLite/Python).
      // For this prototype, if we don't have a backend rembg, we inform the user
      // or use a client-side library.
      // We'll return the same image for now with a warning.
      res.json({ image, message: "Background removal is currently simulated. Use a client-side WASM library for real results in this environment." });
    } catch (error) {
      console.error("BG Removal Error:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
