import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  scanInstalledApps,
  scanUnorganizedApps,
  scanRealServices,
  scanRealStacks,
  runRealDoctor,
  listCategories,
  createCategory,
  initializeRoot,
  analyzeSource,
  performRealInstall,
  performRealUninstall,
  performRealAdopt,
  applyDoctorFix,
  launchApp,
  openFolder,
  exportStackManifest,
  ROOT_PATH,
  USER_ROOT,
} from './server/systemScanner.ts';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// ------------------------------------------------------------------
// AppDepot API Plugin — real Linux system APIs over Vite middleware
// ------------------------------------------------------------------
function appDepotApiPlugin() {
  const sseClients = new Set<any>();

  // Broadcast helper
  const broadcast = (event: string, data: any) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
      try { client.write(payload); } catch (e) { sseClients.delete(client); }
    });
  };

  // Watch both /opt/Application AND ~/Applications for live changes
  const watchPaths = [ROOT_PATH, USER_ROOT];
  for (const watchPath of watchPaths) {
    try {
      if (fs.existsSync(watchPath)) {
        fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
          broadcast('fs_change', { eventType, filename, root: watchPath, time: Date.now() });
        });
      }
    } catch (e) {
      console.warn('[AppDepot] Watcher init warning for', watchPath, e);
    }
  }

  // Also watch /usr/local/bin for symlink changes
  try {
    fs.watch('/usr/local/bin', (eventType, filename) => {
      broadcast('fs_change', { eventType, filename, root: '/usr/local/bin', time: Date.now() });
    });
  } catch (e) {}

  // Also watch ~/.local/share/applications for desktop entry changes
  const userApps = path.join(process.env.HOME || '/home/besu', '.local/share/applications');
  try {
    if (fs.existsSync(userApps)) {
      fs.watch(userApps, (eventType, filename) => {
        broadcast('fs_change', { eventType, filename, root: userApps, time: Date.now() });
      });
    }
  } catch (e) {}

  const parseJsonBody = (req: any): Promise<any> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); } catch (err) { reject(err); }
      });
    });

  return {
    name: 'appdepot-api',
    configureServer(server: any) {

      // ── 1. Live SSE stream ──────────────────────────────────────────
      server.middlewares.use('/api/events', (req: any, res: any) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ time: Date.now(), watching: watchPaths })}\n\n`);
        sseClients.add(res);
        req.on('close', () => { sseClients.delete(res); });
      });

      // ── 2. Real installed apps ──────────────────────────────────────
      server.middlewares.use('/api/apps', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanInstalledApps()));
      });

      // ── 3. Unorganized packages ─────────────────────────────────────
      server.middlewares.use('/api/unorganized', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanUnorganizedApps()));
      });

      // ── 4. Real systemd services ────────────────────────────────────
      server.middlewares.use('/api/services', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanRealServices()));
      });

      // ── 5. Doctor diagnostics ───────────────────────────────────────
      server.middlewares.use('/api/doctor', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(runRealDoctor()));
      });

      // ── 6. Stacks (derived from real installed apps) ────────────────
      server.middlewares.use('/api/stacks', (req: any, res: any) => {
        if (req.url && req.url.startsWith('/export')) {
          try {
            const url = new URL(req.url, 'http://localhost');
            const id = url.searchParams.get('id') || '';
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(exportStackManifest(id)));
          } catch (e: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }
        const apps = scanInstalledApps();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(scanRealStacks(apps)));
      });

      // ── 7. List categories (real on-disk + known not-yet-created) ───
      server.middlewares.use('/api/categories', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(listCategories()));
      });

      // ── 8. Create a new category directory ─────────────────────────
      server.middlewares.use('/api/categories/create', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          const result = createCategory(body.name || '');
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
          if (result.success) broadcast('fs_change', { eventType: 'category_created', filename: body.name, time: Date.now() });
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });

      // ── 9. Initialize root /opt/Application with standard categories
      server.middlewares.use('/api/init', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const result = initializeRoot();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, errors: [e.message] }));
        }
      });

      // ── 10. Archive / source heuristic analysis ─────────────────────
      server.middlewares.use('/api/analyze', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(analyzeSource(body.sourceArchive, body.appName, body.category)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ valid: false, error: e.message }));
        }
      });

      // ── 11. Real installation ────────────────────────────────────────
      server.middlewares.use('/api/install', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(performRealInstall(body.sourceArchive, body.category, body.appName)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });

      // ── 12. Real uninstallation ──────────────────────────────────────
      server.middlewares.use('/api/uninstall', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(performRealUninstall(body.appId, body.category, body.mode, body.appPath, body.linkPath)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });

      // ── 13. Adopt unorganized app ────────────────────────────────────
      server.middlewares.use('/api/adopt', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(performRealAdopt(body.sourcePath, body.category, body.appId)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });

      // ── 14. Apply a Doctor fix command ──────────────────────────────
      server.middlewares.use('/api/doctor/fix', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(applyDoctorFix(body.fixCmd)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, output: e.message }));
        }
      });

      // ── 15. Launch application ───────────────────────────────────────
      server.middlewares.use('/api/launch', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(launchApp(body.command)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });

      // ── 16. Open folder in host file manager ────────────────────────
      server.middlewares.use('/api/open-folder', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          const body = await parseJsonBody(req);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(openFolder(body.path)));
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });

      // ── 17. Live terminal command execution ──────────────────────────
      server.middlewares.use('/api/exec', async (req: any, res: any) => {
        if (req.method !== 'POST') return;
        try {
          // Security: loopback origin validation against CSRF
          const origin = req.headers['origin'] || req.headers['referer'] || '';
          if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Forbidden: Cross-origin execution blocked.', success: false }));
            return;
          }

          const body = await parseJsonBody(req);
          if (!body.command || typeof body.command !== 'string') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Command missing or invalid', success: false }));
            return;
          }

          const homeDir = process.env.HOME || '/home/besu';
          const customEnv = {
            ...process.env,
            HOME: homeDir,
            PATH: `${homeDir}/.local/bin:/opt/Application/tools:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ''}`,
          };

          exec(body.command, { encoding: 'utf-8', timeout: 30000, env: customEnv }, (err: any, stdout: any, stderr: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              output: stdout || stderr || (err ? err.message : 'Command completed.'),
              success: !err,
            }));
          });
        } catch (e: any) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e.message, success: false }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appDepotApiPlugin()],
});
