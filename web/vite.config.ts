import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

const apiPlugin = () => ({
  name: "local-api",
  configureServer(server: import("vite").ViteDevServer) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/api/model-info") {
        // Proxy to Ollama to get model details
        import("node:http").then(({ default: http }) => {
          http.get("http://localhost:11434/api/tags", (ollamaRes) => {
            let body = "";
            ollamaRes.on("data", (chunk: Buffer) => (body += chunk));
            ollamaRes.on("end", () => {
              try {
                const data = JSON.parse(body);
                const model = data.models?.find((m: { name: string }) => m.name.startsWith("bae-test-gen"));
                const baseModel = model?.details?.family ?? "unknown";
                const paramSize = model?.details?.parameter_size ?? "unknown";
                const quantization = model?.details?.quantization_level ?? "";
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ family: baseModel, parameter_size: paramSize, quantization }));
              } catch {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: "Failed to parse Ollama response" }));
              }
            });
          }).on("error", () => {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Ollama not running" }));
          });
        });
        return;
      } else if (req.url === "/api/prompts") {
        // Serve all prompt*.txt files from parent directory
        const dir = path.resolve(__dirname, "..");
        const files = fs
          .readdirSync(dir)
          .filter((f: string) => f.startsWith("prompt") && f.endsWith(".txt"))
          .sort();
        const prompts = files.map((f: string) => ({
          name: f.replace(".txt", ""),
          content: fs.readFileSync(path.join(dir, f), "utf-8"),
        }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(prompts));
      } else if (req.url === "/api/ecrs") {
        const dir = path.resolve(__dirname, "../ecrs");
        if (!fs.existsSync(dir)) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify([]));
          return;
        }
        const files = fs
          .readdirSync(dir)
          .filter((f: string) => f.endsWith(".txt"));
        const ecrs = files.map((f: string) => ({
          name: f.replace(".txt", ""),
          content: fs.readFileSync(path.join(dir, f), "utf-8"),
        }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(ecrs));
      } else {
        next();
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { port: 3000 },
});
