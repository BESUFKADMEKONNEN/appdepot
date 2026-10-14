import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { scanInstalledApps, scanUnorganizedApps, scanRealServices, runRealDoctor } from './server/systemScanner.ts';
import { exec } from 'child_process';

// Custom Vite plugin exposing real Linux system APIs
function appDepotApiPlugin() {
  return {
    name: 'appdepot-api',
    configureServer(server: any) {
      server.middlewares.use('/api/apps', (_req: any, res: any) => {
        const data = scanInstalledApps();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      server.middlewares.use('/api/unorganized', (_req: any, res: any) => {
        const data = scanUnorganizedApps();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      server.middlewares.use('/api/services', (_req: any, res: any) => {
        const data = scanRealServices();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      server.middlewares.use('/api/doctor', (_req: any, res: any) => {
        const data = runRealDoctor();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      });

      server.middlewares.use('/api/exec', (req: any, res: any) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const { command } = JSON.parse(body);
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
          });
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), appDepotApiPlugin()],
});
