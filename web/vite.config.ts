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
                const model = data.models?.find((m: { name: string }) =>
                  m.name.startsWith("bae-test-gen") || m.name.startsWith("qwen3.5")
                );
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
      } else if (req.url === "/api/jira/test-connection" && req.method === "POST") {
        // Proxy test-connection request to Jira
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk));
        req.on("end", () => {
          try {
            const { baseUrl, pat, pemPath } = JSON.parse(body);
            const url = new URL(`${baseUrl}/rest/api/2/myself`);

            import("node:https").then(({ default: https }) => {
              const pemFullPath = path.isAbsolute(pemPath || "") ? pemPath : path.resolve(__dirname, "..", pemPath || "BAE-Systems-Root-CA-UK-2015.pem");
              const options: import("node:https").RequestOptions = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: "GET",
                headers: {
                  Accept: "application/json",
                  Authorization: `Bearer ${pat}`,
                },
                ...(fs.existsSync(pemFullPath) ? { ca: fs.readFileSync(pemFullPath) } : {}),
              };

              const jiraReq = https.request(options, (jiraRes) => {
                let data = "";
                jiraRes.on("data", (chunk: Buffer) => (data += chunk));
                jiraRes.on("end", () => {
                  res.setHeader("Content-Type", "application/json");
                  if (jiraRes.statusCode && jiraRes.statusCode >= 200 && jiraRes.statusCode < 300) {
                    res.end(JSON.stringify({ ok: true, user: JSON.parse(data) }));
                  } else {
                    res.statusCode = jiraRes.statusCode ?? 500;
                    res.end(JSON.stringify({ error: `Jira returned ${jiraRes.statusCode}: ${data.slice(0, 500)}` }));
                  }
                });
              });

              jiraReq.on("error", (err) => {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Connection failed: ${err.message}` }));
              });

              jiraReq.end();
            });
          } catch (err) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Invalid request: ${err}` }));
          }
        });
      } else if (req.url === "/api/jira/create-issue" && req.method === "POST") {
        // Proxy issue creation to Jira
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk));
        req.on("end", () => {
          try {
            const { baseUrl, pat, pemPath, issue } = JSON.parse(body);
            const url = new URL(`${baseUrl}/rest/api/2/issue`);
            const payload = JSON.stringify(issue);

            import("node:https").then(({ default: https }) => {
              const pemFullPath = path.isAbsolute(pemPath || "") ? pemPath : path.resolve(__dirname, "..", pemPath || "BAE-Systems-Root-CA-UK-2015.pem");
              const options: import("node:https").RequestOptions = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${pat}`,
                  "Content-Length": Buffer.byteLength(payload),
                },
                ...(fs.existsSync(pemFullPath) ? { ca: fs.readFileSync(pemFullPath) } : {}),
              };

              const jiraReq = https.request(options, (jiraRes) => {
                let data = "";
                jiraRes.on("data", (chunk: Buffer) => (data += chunk));
                jiraRes.on("end", () => {
                  res.setHeader("Content-Type", "application/json");
                  if (jiraRes.statusCode && jiraRes.statusCode >= 200 && jiraRes.statusCode < 300) {
                    res.end(data);
                  } else {
                    res.statusCode = jiraRes.statusCode ?? 500;
                    res.end(JSON.stringify({ error: `Jira returned ${jiraRes.statusCode}: ${data.slice(0, 500)}` }));
                  }
                });
              });

              jiraReq.on("error", (err) => {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Connection failed: ${err.message}` }));
              });

              jiraReq.write(payload);
              jiraReq.end();
            });
          } catch (err) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Invalid request: ${err}` }));
          }
        });
      } else if (req.url?.startsWith("/api/jira/issue/") && req.method === "GET") {
        // Fetch a single Jira issue by key (e.g. /api/jira/issue/ECR-7167)
        const issueKey = req.url.replace("/api/jira/issue/", "");
        // Read config from query params or localStorage - we'll pass via headers
        const pat = req.headers["x-jira-pat"] as string;
        const baseUrl = (req.headers["x-jira-url"] as string) || "https://air-jira.intranet.baesystems.com";
        const pemPath = (req.headers["x-jira-pem"] as string) || "BAE-Systems-Root-CA-UK-2015.pem";

        if (!pat) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "No PAT provided" }));
          return;
        }

        const url = new URL(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=summary,description,labels,components`);

        import("node:https").then(({ default: https }) => {
          const pemFullPath = path.resolve(__dirname, "..", pemPath);
          const options: import("node:https").RequestOptions = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${pat}`,
            },
            ...(fs.existsSync(pemFullPath) ? { ca: fs.readFileSync(pemFullPath) } : {}),
          };

          const jiraReq = https.request(options, (jiraRes) => {
            let data = "";
            jiraRes.on("data", (chunk: Buffer) => (data += chunk));
            jiraRes.on("end", () => {
              res.setHeader("Content-Type", "application/json");
              if (jiraRes.statusCode && jiraRes.statusCode >= 200 && jiraRes.statusCode < 300) {
                res.end(data);
              } else {
                res.statusCode = jiraRes.statusCode ?? 500;
                res.end(JSON.stringify({ error: `Jira returned ${jiraRes.statusCode}: ${data.slice(0, 500)}` }));
              }
            });
          });

          jiraReq.on("error", (err) => {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Connection failed: ${err.message}` }));
          });

          jiraReq.end();
        });
      } else if (req.url?.startsWith("/api/jira/search") && req.method === "POST") {
        // Search Jira issues via JQL
        let body = "";
        req.on("data", (chunk: Buffer) => (body += chunk));
        req.on("end", () => {
          try {
            const { baseUrl, pat, pemPath, jql, maxResults } = JSON.parse(body);
            const url = new URL(`${baseUrl}/rest/api/2/search`);
            const payload = JSON.stringify({
              jql,
              maxResults: maxResults ?? 10,
              fields: ["summary", "description", "labels", "components"],
            });

            import("node:https").then(({ default: https }) => {
              const pemFullPath = path.isAbsolute(pemPath || "") ? pemPath : path.resolve(__dirname, "..", pemPath || "BAE-Systems-Root-CA-UK-2015.pem");
              const options: import("node:https").RequestOptions = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname,
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${pat}`,
                  "Content-Length": Buffer.byteLength(payload),
                },
                ...(fs.existsSync(pemFullPath) ? { ca: fs.readFileSync(pemFullPath) } : {}),
              };

              const jiraReq = https.request(options, (jiraRes) => {
                let data = "";
                jiraRes.on("data", (chunk: Buffer) => (data += chunk));
                jiraRes.on("end", () => {
                  res.setHeader("Content-Type", "application/json");
                  if (jiraRes.statusCode && jiraRes.statusCode >= 200 && jiraRes.statusCode < 300) {
                    res.end(data);
                  } else {
                    res.statusCode = jiraRes.statusCode ?? 500;
                    res.end(JSON.stringify({ error: `Jira returned ${jiraRes.statusCode}: ${data.slice(0, 500)}` }));
                  }
                });
              });

              jiraReq.on("error", (err) => {
                res.statusCode = 502;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: `Connection failed: ${err.message}` }));
              });

              jiraReq.write(payload);
              jiraReq.end();
            });
          } catch (err) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Invalid request: ${err}` }));
          }
        });
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
