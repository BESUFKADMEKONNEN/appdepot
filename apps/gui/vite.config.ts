import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  scanInstalledApps,
  scanUnorganizedApps,
  scanRealServices,
  runRealDoctor,
  analyzeSource,
  performRealInstall,
  performRealUninstall,
  performRealAdopt,
  launchApp,
  openFolder,
  ROOT_PATH
} from './server/systemScanner.ts';
import { exec } from 'child_process';
import fs from 'fs';

// Custom Vite plugin exposing real Linux system APIs & Live Inotify Watcher
function appDepotApiPlugin() {
  const sseClients = new Set<any>();

  // Initialize native recursive filesystem watcher on /opt/Application
  try {
    if (fs.existsSync(ROOT_PATH)) {
      fs.watch(ROOT_PATH, { recursive: true }, (eventType, filename) => {
        const payload = `event: fs_change\ndata: ${JSON.stringify({ eventType, filename, time: Date.now() })}\n\n`;
        sseClients.forEach(client => {
          try { client.write(payload); } catch (e) { sseClients.delete(client); }
        });
      });
    }
  } catch (e) {
    console.error('Filesystem watcher init error:', e);
  }

  const parseJsonBody = (req: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (err) {
          reject(err);
        }
      });
    });
  };

  return {
    name: 'appdepot-api',
    configureServer(server: any) {
      // 1. Live SSE stream for real-time filesystem updates (like Windows/macOS Finder)
      server.middlewares.use('/api/events', (req: any, res: any) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('event: connected\ndata: "ok"\n\n');
        sseClients.add(res);
        req.on('close', () => { sseClients.delete(res); });
      });

      // 2. Real installed applications in /opt/Application
      server.middlewares.use('/api/apps', (_req: any, res: any) => {
        const data = scanInstalledApps();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      // 3. Real unorganized packages on the host
      server.middlewares.use('/api/unorganized', (_req: any, res: any) => {
        const data = scanUnorganizedApps();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      // 4. Real systemd services
      server.middlewares.use('/api/services', (_req: any, res: any) => {
        const data = scanRealServices();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      // 5. Real doctor diagnostic health checks
      server.middlewares.use('/api/doctor', (_req: any, res: any) => {
        const data = runRealDoctor();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      // 6. Source archive / directory heuristic analysis
      server.middlewares.use('/api/analyze', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { sourceArchive, appName, category } = body;
            const result = analyzeSource(sourceArchive, appName, category);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ valid: false, error: e.message }));
          }
        }
      });

      // 7. Real package installation execution
      server.middlewares.use('/api/install', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { sourceArchive, category, appName } = body;
            const result = performRealInstall(sourceArchive, category, appName);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });

      // 8. Real package uninstallation / removal
      server.middlewares.use('/api/uninstall', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { appId, category, mode, appPath, linkPath } = body;
            const result = performRealUninstall(appId, category, mode, appPath, linkPath);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });

      // 9. Real adoption of unorganized application
      server.middlewares.use('/api/adopt', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { sourcePath, category, appId } = body;
            const result = performRealAdopt(sourcePath, category, appId);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });

      // 10. Real launch application
      server.middlewares.use('/api/launch', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { command } = body;
            const result = launchApp(command);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });

      // 11. Real open folder in host file manager
      server.middlewares.use('/api/open-folder', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { path: folderPath } = body;
            const result = openFolder(folderPath);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });

      // 12. Command execution in live terminal
      server.middlewares.use('/api/exec', async (req: any, res: any) => {
        if (req.method === 'POST') {
          try {
            const body = await parseJsonBody(req);
            const { command } = body;
            exec(command, { encoding: 'utf-8' }, (err: any, stdout: any, stderr: any) => {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                output: stdout || stderr || (err ? err.message : 'OK'),
                success: !err
              }));
            });
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message, success: false }));
          }
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), appDepotApiPlugin()],
});
