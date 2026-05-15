import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
