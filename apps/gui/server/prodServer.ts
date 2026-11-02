import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import {
  scanInstalledApps,
  scanUnorganizedApps,
  scanRealServices,
  runRealDoctor,
  scanRealStacks,
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
  browseDirectory,
  createDirectory,
  pickNativePath,
  scanSystemPackages,
  controlService,
  terminateAppProcess,
  scanLiveProcesses,
  ROOT_PATH,
  USER_ROOT,
  USER_HOME,
} from './systemScanner.ts';

// ------------------------------------------------------------------
// Production Server Configuration
// ------------------------------------------------------------------
const PORT = parseInt(process.env.APPDEPOT_PORT || '5173', 10);
const HOST = '127.0.0.1';

// Static directory for compiled GUI assets
const STATIC_DIR = process.env.APPDEPOT_STATIC_DIR || path.resolve(__dirname, '../gui');
const FALLBACK_STATIC_DIR = path.resolve(__dirname, '../dist');
const RESOLVED_STATIC = fs.existsSync(STATIC_DIR) ? STATIC_DIR : FALLBACK_STATIC_DIR;

// MIME types lookup
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

// ------------------------------------------------------------------
// SSE Live Telemetry Broadcast
// ------------------------------------------------------------------
const sseClients = new Set<http.ServerResponse>();

const broadcast = (event: string, data: any) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
};

// Filesystem Watchers
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

try {
  fs.watch('/usr/local/bin', (eventType, filename) => {
    broadcast('fs_change', { eventType, filename, root: '/usr/local/bin', time: Date.now() });
  });
} catch {}

const userApps = path.join(USER_HOME, '.local/share/applications');
try {
  if (fs.existsSync(userApps)) {
    fs.watch(userApps, (eventType, filename) => {
      broadcast('fs_change', { eventType, filename, root: userApps, time: Date.now() });
    });
  }
} catch {}

// JSON body parser helper
const parseJsonBody = (req: http.IncomingMessage): Promise<any> =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });

// ------------------------------------------------------------------
// HTTP Request Dispatcher
// ------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = urlObj.pathname;

  // Security: CORS and origin validation
  res.setHeader('Access-Control-Allow-Origin', `http://${HOST}:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Strict CSRF Defense: Block any non-loopback Origin or Referer from triggering mutating APIs
  if (req.method === 'POST') {
    const origin = (req.headers['origin'] as string) || '';
    const referer = (req.headers['referer'] as string) || '';
    const isLoopbackOrigin = !origin || origin.includes('127.0.0.1') || origin.includes('localhost');
    const isLoopbackReferer = !referer || referer.includes('127.0.0.1') || referer.includes('localhost');
    if (!isLoopbackOrigin || !isLoopbackReferer) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: '403 Forbidden: Cross-origin request blocked.', success: false }));
      return;
    }
  }

  // ── 1. SSE Stream ───────────────────────────────────────────────
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ time: Date.now(), watching: watchPaths })}\n\n`);
    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); });
    return;
  }

  // ── 2. Real installed apps ──────────────────────────────────────
  if (pathname === '/api/apps') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanInstalledApps()));
    return;
  }

  if (pathname === '/api/apps/kill') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = terminateAppProcess(body.pid || body.command || '', body.signal || 'SIGTERM');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      broadcast('fs_change', { eventType: 'process_kill', time: Date.now() });
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, output: e.message }));
    }
    return;
  }

  // ── 3. Unorganized packages ─────────────────────────────────────
  if (pathname === '/api/unorganized') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanUnorganizedApps()));
    return;
  }

  // ── 4. Real systemd services ────────────────────────────────────
  if (pathname === '/api/services/control') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = controlService(body.unit || '', body.action || '');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      if (result.success) broadcast('fs_change', { eventType: 'service_state', unit: body.unit, time: Date.now() });
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, output: e.message }));
    }
    return;
  }

  if (pathname === '/api/services') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanRealServices()));
    return;
  }

  // ── 4b. Complete System Packages (apt/dpkg + snap) ──────────────
  if (pathname === '/api/packages') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanSystemPackages()));
    return;
  }

  // ── 4c. Live Host Processes ─────────────────────────────────────
  if (pathname === '/api/processes/kill') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = terminateAppProcess(body.pid || body.command || '', body.signal || 'SIGTERM');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      broadcast('fs_change', { eventType: 'process_kill', time: Date.now() });
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, output: e.message }));
    }
    return;
  }

  if (pathname === '/api/processes') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanLiveProcesses()));
    return;
  }

  // ── 5. Doctor diagnostics ───────────────────────────────────────
  if (pathname === '/api/doctor') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(runRealDoctor()));
    return;
  }

  // ── 6. Stacks ───────────────────────────────────────────────────
  if (pathname === '/api/stacks/export') {
    try {
      const id = urlObj.searchParams.get('id') || '';
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(exportStackManifest(id)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (pathname === '/api/stacks') {
    const apps = scanInstalledApps();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(scanRealStacks(apps)));
    return;
  }

  // ── 7. List categories ──────────────────────────────────────────
  if (pathname === '/api/categories') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(listCategories()));
    return;
  }

  // ── 8. Create a new category directory ──────────────────────────
  if (pathname === '/api/categories/create') {
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
    return;
  }

  // ── 9. Initialize root directory ────────────────────────────────
  if (pathname === '/api/init') {
    if (req.method !== 'POST') return;
    try {
      const result = initializeRoot();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, errors: [e.message] }));
    }
    return;
  }

  // ── 10. Archive / source heuristic analysis ──────────────────────
  if (pathname === '/api/analyze') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analyzeSource(body.sourceArchive, body.appName, body.category)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ valid: false, error: e.message }));
    }
    return;
  }

  // ── 11. Real installation ─────────────────────────────────────────
  if (pathname === '/api/install') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(performRealInstall(body.sourceArchive, body.category, body.appName)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 12. Real uninstallation ───────────────────────────────────────
  if (pathname === '/api/uninstall') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(performRealUninstall(body.appId, body.category, body.mode, body.appPath, body.linkPath)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 13. Adopt unorganized app ─────────────────────────────────────
  if (pathname === '/api/adopt') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(performRealAdopt(body.sourcePath, body.category, body.appId)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 14. Apply Doctor fix command ──────────────────────────────────
  if (pathname === '/api/doctor/fix') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(applyDoctorFix(body.fixCmd)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, output: e.message }));
    }
    return;
  }

  // ── 15. Launch application ────────────────────────────────────────
  if (pathname === '/api/launch') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = launchApp(body.command);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      if (result.success) {
        setTimeout(() => {
          broadcast('fs_change', { eventType: 'app_launch', command: body.command, time: Date.now() });
        }, 600);
      }
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 16. Open folder in file manager ───────────────────────────────
  if (pathname === '/api/open-folder') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(openFolder(body.path)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 17. File System Browser (ls) ──────────────────────────────────
  if (pathname === '/api/fs/browse') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(browseDirectory(body.path)));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 18. Directory Creation (mkdir) ────────────────────────────────
  if (pathname === '/api/fs/mkdir') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = createDirectory(body.parentDir, body.folderName);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      if (result.success) broadcast('fs_change', { eventType: 'folder_created', path: result.createdPath, time: Date.now() });
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 19. Native Dialog Picker ──────────────────────────────────────
  if (pathname === '/api/fs/native-pick') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      const result = await pickNativePath(body || {});
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 20. Live Terminal Command Execution ───────────────────────────
  if (pathname === '/api/exec') {
    if (req.method !== 'POST') return;
    try {
      const body = await parseJsonBody(req);
      if (!body.command || typeof body.command !== 'string') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Command missing or invalid', success: false }));
        return;
      }

      const homeDir = USER_HOME;
      exec(
        body.command,
        {
          cwd: homeDir,
          env: {
            ...process.env,
            HOME: homeDir,
            USER: path.basename(homeDir),
            PATH: `/usr/local/bin:/usr/bin:/bin:${homeDir}/.local/bin:${homeDir}/.cargo/bin:/snap/bin`,
          },
          timeout: 45000,
          maxBuffer: 15 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          res.setHeader('Content-Type', 'application/json');
          if (error) {
            res.end(JSON.stringify({
              output: stdout || '',
              error: stderr || error.message,
              success: false,
              code: error.code || 1,
            }));
          } else {
            res.end(JSON.stringify({
              output: stdout || '',
              error: stderr || '',
              success: true,
              code: 0,
            }));
          }
        }
      );
    } catch (e: any) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: e.message, success: false }));
    }
    return;
  }

  // ── 21. Static Assets Serving ─────────────────────────────────────
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  // Prevent directory traversal attacks
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.resolve(RESOLVED_STATIC, '.' + safePath);

  if (!filePath.startsWith(RESOLVED_STATIC)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Directory traversal blocked.');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(RESOLVED_STATIC, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start listening
server.listen(PORT, HOST, () => {
  console.log(`[AppDepot Production Runtime] Running on http://${HOST}:${PORT}`);
  console.log(`[AppDepot Production Runtime] Static root: ${RESOLVED_STATIC}`);

  // Automatically open browser if requested or interactive
  if (!process.argv.includes('--no-open') && !process.env.APPDEPOT_NO_OPEN) {
    exec(`xdg-open "http://${HOST}:${PORT}" 2>/dev/null || true`);
  }
});
