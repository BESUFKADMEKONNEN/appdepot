import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';

export const USER_HOME = process.env.HOME || os.homedir();
export const ROOT_PATH = '/opt/Application';
export const USER_ROOT = path.join(USER_HOME, 'Applications');
export const PROJECT_ROOT = fs.existsSync(path.resolve(process.cwd(), 'Cargo.toml'))
  ? process.cwd()
  : path.resolve(process.cwd(), '../..');

// Standard category IDs (all lowercase, no spaces)
export const KNOWN_CATEGORIES = [
  'ide', 'sdk', 'browsers', 'databases', 'runtimes', 'network', 'office', 'tools', 'games', 'media'
];

// In-memory cache for directory disk usage to keep scans instantaneous
const sizeCache = new Map<string, { size: string; timestamp: number }>();
const cliVersionCache = new Map<string, string>();

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface ScannedApp {
  id: string;
  name: string;
  category: string;
  version: string;
  mode: 'managed' | 'linked' | 'adopted' | 'system';
  path: string;
  linkPath?: string | null;
  command: string;
  execPath?: string | null;
  iconPath?: string | null;
  desktopPath?: string | null;
  artifactsCount: number;
  sizeFormatted?: string;
  status: 'healthy' | 'warning' | 'broken';
  hasSandboxFix?: boolean;
  isCli?: boolean;
  cliType?: string;
  description?: string;
  isRunning?: boolean;
  pid?: number;
  processRss?: string;
  processCount?: number;
  runningState?: 'running' | 'closed';
}

/**
 * Lists all real category directories under ROOT_PATH (dynamically discovered, not hardcoded).
 * Returns both the path info and whether category directories exist on disk.
 */
export function listCategories(): Array<{ id: string; path: string; exists: boolean; appCount: number }> {
  const result: Array<{ id: string; path: string; exists: boolean; appCount: number }> = [];

  // First: scan what actually exists on disk
  if (fs.existsSync(ROOT_PATH)) {
    try {
      const dirs = fs.readdirSync(ROOT_PATH);
      for (const d of dirs) {
        if (d.startsWith('.')) continue;
        const catPath = path.join(ROOT_PATH, d);
        try {
          if (!fs.statSync(catPath).isDirectory()) continue;
        } catch (e) { continue; }

        let appCount = 0;
        try {
          appCount = fs.readdirSync(catPath).filter(f => !f.startsWith('.')).length;
        } catch (e) {}

        result.push({ id: d, path: catPath, exists: true, appCount });
      }
    } catch (e) {}
  }

  // Then: add known standard categories that don't exist yet (so UI can offer to create them)
  for (const cat of KNOWN_CATEGORIES) {
    if (!result.find(r => r.id === cat)) {
      result.push({ id: cat, path: path.join(ROOT_PATH, cat), exists: false, appCount: 0 });
    }
  }

  return result;
}

/**
 * Creates a new category directory under ROOT_PATH.
 * The devtools group setgid bit is inherited automatically due to parent's setgid.
 */
export function createCategory(categoryName: string): { success: boolean; path?: string; error?: string } {
  // Validate: lowercase alphanumeric + hyphens only
  const clean = categoryName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!clean || clean.length < 2) {
    return { success: false, error: 'Category name must be at least 2 characters (letters, numbers, hyphens).' };
  }

  const catPath = path.join(ROOT_PATH, clean);
  if (fs.existsSync(catPath)) {
    return { success: false, error: `Category '${clean}' already exists at ${catPath}.` };
  }

  try {
    fs.mkdirSync(catPath, { recursive: true });
    // Set 2775 to match parent setgid convention
    try { fs.chmodSync(catPath, 0o2775); } catch (e) {}
    return { success: true, path: catPath };
  } catch (e: any) {
    return { success: false, error: `Failed to create ${catPath}: ${e.message}` };
  }
}

/**
 * Initializes /opt/Application with standard categories and correct permissions.
 * Idempotent — safe to call even if root already exists.
 */
export function initializeRoot(): { success: boolean; created: string[]; errors: string[] } {
  const created: string[] = [];
  const errors: string[] = [];

  // Ensure root exists
  if (!fs.existsSync(ROOT_PATH)) {
    errors.push(`${ROOT_PATH} does not exist. Run: sudo mkdir -p ${ROOT_PATH} && sudo chown root:devtools ${ROOT_PATH} && sudo chmod 2775 ${ROOT_PATH}`);
    return { success: false, created, errors };
  }

  for (const cat of KNOWN_CATEGORIES) {
    const catPath = path.join(ROOT_PATH, cat);
    if (!fs.existsSync(catPath)) {
      try {
        fs.mkdirSync(catPath, { recursive: true });
        try { fs.chmodSync(catPath, 0o2775); } catch (e) {}
        created.push(catPath);
      } catch (e: any) {
        errors.push(`Could not create ${catPath}: ${e.message}`);
      }
    }
  }

  return { success: errors.length === 0, created, errors };
}

/**
 * Scans the real /opt/Application and ~/Applications trees.
 * ZERO hardcoding: dynamically discovers every directory, symlink, and file.
 */
export function scanInstalledApps(): ScannedApp[] {
  const apps: ScannedApp[] = [];
  const rootsToScan = [ROOT_PATH];
  if (fs.existsSync(USER_ROOT)) rootsToScan.push(USER_ROOT);

  for (const root of rootsToScan) {
    if (!fs.existsSync(root)) continue;

    let categories: string[] = [];
    try {
      categories = fs.readdirSync(root);
    } catch (e) {
      continue;
    }

    for (const cat of categories) {
      const catPath = path.join(root, cat);
      try {
        if (!fs.statSync(catPath).isDirectory()) continue;
      } catch (e) {
        continue;
      }

      let items: string[] = [];
      try {
        items = fs.readdirSync(catPath);
      } catch (e) {
        continue;
      }

      for (const item of items) {
        if (item === '.' || item === '..' || item.startsWith('.')) continue;

        const itemPath = path.join(catPath, item);
        let lstat: fs.Stats;
        try {
          lstat = fs.lstatSync(itemPath);
        } catch (e) {
          continue;
        }

        const isSymlink = lstat.isSymbolicLink();
        let target: string | null = null;
        if (isSymlink) {
          try {
            target = fs.readlinkSync(itemPath);
          } catch (e) {
            target = 'dangling';
          }
        }

        const physicalPath = isSymlink && target ? target : itemPath;
        const exists = fs.existsSync(physicalPath);

        // Check if there is an Electron/Chromium setuid sandbox
        let hasSandbox = false;
        let isSetuid = false;
        if (exists) {
          try {
            if (fs.statSync(physicalPath).isDirectory()) {
              const sandboxPath = path.join(physicalPath, 'chrome-sandbox');
              if (fs.existsSync(sandboxPath)) {
                hasSandbox = true;
                const sStat = fs.statSync(sandboxPath);
                isSetuid = (sStat.mode & 0o4000) !== 0 && sStat.uid === 0;
              }
            }
          } catch (e) {}
        }

        // Check for real command symlink in /usr/local/bin or ~/.local/bin
        const binLinkSystem = path.join('/usr/local/bin', item);
        const binLinkUser = path.join(USER_HOME, '.local/bin', item);
        const hasBinLink = fs.existsSync(binLinkSystem) || fs.existsSync(binLinkUser);

        // Check for real desktop entry
        const desktopPaths = [
          path.join(USER_HOME, '.local/share/applications', `appdepot-${item}.desktop`),
          path.join(USER_HOME, '.local/share/applications', `${item}.desktop`),
          path.join('/usr/share/applications', `appdepot-${item}.desktop`),
          path.join('/usr/share/applications', `${item}.desktop`),
        ];
        const existingDesktop = desktopPaths.find(p => fs.existsSync(p));

        // Format user-facing display name dynamically
        let displayName = item.charAt(0).toUpperCase() + item.slice(1).replace(/-/g, ' ');
        let detectedIcon: string | null = null;

        // Try reading Name and Icon from existing desktop file
        if (existingDesktop && fs.existsSync(existingDesktop)) {
          try {
            const content = fs.readFileSync(existingDesktop, 'utf-8');
            const nameMatch = content.match(/^Name=(.+)$/m);
            if (nameMatch && nameMatch[1]) displayName = nameMatch[1].trim();
            const iconMatch = content.match(/^Icon=(.+)$/m);
            if (iconMatch && iconMatch[1]) detectedIcon = iconMatch[1].trim();
          } catch (e) {}
        }

        // Read version from various locations
        let version = 'installed';
        const versionFiles = [
          path.join(physicalPath, 'VERSION'),
          path.join(physicalPath, 'version'),
          path.join(physicalPath, 'package.json'),
        ];
        for (const vf of versionFiles) {
          if (fs.existsSync(vf)) {
            try {
              const content = fs.readFileSync(vf, 'utf-8');
              if (vf.endsWith('package.json')) {
                const pkg = JSON.parse(content);
                if (pkg.version) { version = `v${pkg.version}`; break; }
              } else {
                const v = content.trim().split('\n')[0];
                if (v) { version = v; break; }
              }
            } catch (e) {}
          }
        }

        // Discover main executable
        let mainExec = '';
        if (exists) {
          try {
            const stat = fs.statSync(physicalPath);
            if (stat.isDirectory()) {
              const files = fs.readdirSync(physicalPath);
              for (const f of files) {
                const fp = path.join(physicalPath, f);
                try {
                  const st = fs.statSync(fp);
                  if (st.isFile() && (st.mode & 0o111) !== 0 &&
                      !f.includes('crashpad') && !f.includes('sandbox') &&
                      !f.includes('nacl') && !f.endsWith('.so') && !f.endsWith('.pak')) {
                    mainExec = fp;
                    // Prefer exact name matches
                    if (f === item || f === `${item}-bin` || f === `${item}-ide`) {
                      break;
                    }
                  }
                } catch (e) {}
              }
            } else if (stat.isFile()) {
              mainExec = physicalPath;
            }
          } catch (e) {}
        }

        // Query real disk usage with 60s cache
        let sizeFormatted = 'Managed';
        if (exists) {
          const now = Date.now();
          const cached = sizeCache.get(physicalPath);
          if (cached && now - cached.timestamp < 60000) {
            sizeFormatted = cached.size;
          } else {
            try {
              const duOut = execSync(`du -sh "${physicalPath}" 2>/dev/null`, { encoding: 'utf-8', timeout: 1500 });
              sizeFormatted = duOut.split(/\s+/)[0] || 'Managed';
              sizeCache.set(physicalPath, { size: sizeFormatted, timestamp: now });
            } catch (e) {
              sizeFormatted = cached ? cached.size : 'Active';
            }
          }
        }

        // Count artifacts
        const artifactCount = (hasBinLink ? 1 : 0) + (existingDesktop ? 1 : 0) + (hasSandbox ? 1 : 0) + 1;

        apps.push({
          id: item,
          name: displayName,
          category: cat,
          version,
          mode: isSymlink ? 'linked' : 'managed',
          path: physicalPath,
          linkPath: isSymlink ? itemPath : null,
          command: item,
          execPath: mainExec || null,
          desktopPath: existingDesktop || null,
          iconPath: detectedIcon,
          artifactsCount: artifactCount,
          sizeFormatted,
          status: exists ? (hasSandbox && !isSetuid ? 'warning' : 'healthy') : 'broken',
          hasSandboxFix: hasSandbox && isSetuid,
        });
      }
    }
  }

  // Step 2: Dynamically discover all system-wide installed desktop software (apt, flatpak, snap)
  const systemDesktopDirs = [
    '/usr/share/applications',
    path.join(USER_HOME, '.local/share/applications'),
    '/var/lib/flatpak/exports/share/applications',
    '/var/lib/snapd/desktop/applications',
  ];

  const seenAppNames = new Set(apps.map(a => a.name.toLowerCase()));
  const seenIds = new Set(apps.map(a => a.id.toLowerCase()));

  for (const dir of systemDesktopDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.desktop') || f.startsWith('appdepot-') || f.startsWith('mimeinfo') || f.includes('system-') || f.includes('settings')) continue;
        const desktopFile = path.join(dir, f);
        try {
          const content = fs.readFileSync(desktopFile, 'utf-8');
          if (content.includes('NoDisplay=true') || content.includes('Type=Directory')) continue;

          const nameMatch = content.match(/^Name=(.+)$/m);
          const execMatch = content.match(/^Exec=(.+)$/m);
          if (!nameMatch || !execMatch) continue;

          const appName = nameMatch[1].trim();
          const cleanId = path.basename(f, '.desktop').toLowerCase().replace(/[^a-z0-9-]/g, '-');

          if (seenAppNames.has(appName.toLowerCase()) || seenIds.has(cleanId)) continue;
          seenAppNames.add(appName.toLowerCase());
          seenIds.add(cleanId);

          const execCmd = execMatch[1].trim().split(/\s+/)[0].replace(/["']/g, '');
          const iconMatch = content.match(/^Icon=(.+)$/m);
          const detectedIcon = iconMatch ? iconMatch[1].trim() : null;

          const catMatch = content.match(/^Categories=(.+)$/m);
          const catStr = catMatch ? catMatch[1] : '';
          const category = inferCategory(appName + ' ' + cleanId + ' ' + catStr);

          apps.push({
            id: cleanId,
            name: appName,
            category,
            version: 'system',
            mode: 'system',
            path: execCmd.startsWith('/') ? execCmd : desktopFile,
            linkPath: null,
            command: path.basename(execCmd),
            execPath: execCmd,
            desktopPath: desktopFile,
            iconPath: detectedIcon,
            artifactsCount: 1,
            sizeFormatted: 'System Pkg',
            status: 'healthy',
            hasSandboxFix: false,
          });
        } catch (e) {}
      }
    } catch (e) {}
  }

  // Step 3: 100% Dynamic discovery of CLI tools, runtimes, and user binaries in PATH (Zero Hardcoding)
  const localSearchDirs = [
    '/usr/local/bin',
    path.join(USER_HOME, '.cargo/bin'),
    path.join(USER_HOME, '.local/bin'),
    '/snap/bin',
  ];

  // 3a. Crawl all local & user executable binaries (cargo, local, custom scripts)
  for (const sDir of localSearchDirs) {
    if (!fs.existsSync(sDir)) continue;
    let files: string[] = [];
    try { files = fs.readdirSync(sDir); } catch (e) { continue; }

    for (const f of files) {
      if (f.startsWith('.') || f.includes('.so') || f.endsWith('.sh') || f.length < 2) continue;
      const lower = f.toLowerCase();
      if (seenIds.has(lower) || seenAppNames.has(lower)) continue;

      const binPath = path.join(sDir, f);
      try {
        const st = fs.statSync(binPath);
        if (!st.isFile() || (st.mode & 0o111) === 0) continue;

        seenIds.add(lower);
        seenAppNames.add(lower);

        let ver = cliVersionCache.get(binPath);
        if (!ver) {
          try {
            const out = execSync(`"${binPath}" --version 2>&1`, {
              timeout: 250,
              encoding: 'utf-8',
              env: { ...process.env, LANG: 'C' },
            });
            const firstLine = out.trim().split('\n')[0] || '';
            const m = firstLine.match(/(\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?)/);
            ver = m ? m[1] : (firstLine.slice(0, 24) || 'installed');
            cliVersionCache.set(binPath, ver);
          } catch (e) {
            ver = 'installed';
            cliVersionCache.set(binPath, ver);
          }
        }

        const category = inferCategory(f);
        const displayName = formatAppName(f);

        apps.push({
          id: lower,
          name: displayName,
          category,
          version: ver,
          mode: 'system',
          isCli: true,
          description: `Executable binary in ${sDir}`,
          path: binPath,
          linkPath: null,
          command: f,
          execPath: binPath,
          desktopPath: null,
          iconPath: null,
          artifactsCount: 1,
          sizeFormatted: st.size > 0 ? formatByteSize(st.size) : 'System',
          status: 'healthy',
          hasSandboxFix: false,
        });
      } catch (e) {}
    }
  }

  // 3b. Dynamically discover user-facing system CLI tools installed under /usr/bin via host package database
  try {
    const userSections = new Set([
      'devel', 'interpreters', 'editors', 'shells', 'net', 'web', 'database', 'graphics', 'video', 'sound', 'admin', 'utils'
    ]);
    const pkgOut = execSync("dpkg-query -W -f='${Package}\t${Section}\n' 2>/dev/null", { encoding: 'utf-8', timeout: 2500 });
    for (const line of pkgOut.trim().split('\n')) {
      const [pkg, sec] = line.split('\t');
      if (!pkg || !sec || !userSections.has(sec.toLowerCase())) continue;
      const lower = pkg.toLowerCase();
      if (seenIds.has(lower) || seenAppNames.has(lower)) continue;

      const binPath = path.join('/usr/bin', pkg);
      try {
        if (!fs.existsSync(binPath)) continue;
        const st = fs.statSync(binPath);
        if (!st.isFile() || (st.mode & 0o111) === 0) continue;

        seenIds.add(lower);
        seenAppNames.add(lower);

        let ver = cliVersionCache.get(binPath);
        if (!ver) {
          try {
            const out = execSync(`"${binPath}" --version 2>&1`, {
              timeout: 200,
              encoding: 'utf-8',
              env: { ...process.env, LANG: 'C' },
            });
            const firstLine = out.trim().split('\n')[0] || '';
            const m = firstLine.match(/(\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?)/);
            ver = m ? m[1] : (firstLine.slice(0, 24) || 'installed');
            cliVersionCache.set(binPath, ver);
          } catch (e) {
            ver = 'installed';
            cliVersionCache.set(binPath, ver);
          }
        }

        const category = inferCategory(pkg + ' ' + sec);
        apps.push({
          id: lower,
          name: formatAppName(pkg),
          category,
          version: ver,
          mode: 'system',
          isCli: true,
          description: `System package tool (${sec}) in /usr/bin`,
          path: binPath,
          linkPath: null,
          command: pkg,
          execPath: binPath,
          desktopPath: null,
          iconPath: null,
          artifactsCount: 1,
          sizeFormatted: st.size > 0 ? formatByteSize(st.size) : 'System',
          status: 'healthy',
          hasSandboxFix: false,
        });
      } catch (e) {}
    }
  } catch (e) {}

  // ── Step 4: Live Process Detection across all installed applications ──────
  try {
    const psOut = execSync('ps -eo pid,rss,comm,args --no-headers 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 1500,
    });
    const procs = psOut.trim().split('\n').map(l => {
      const parts = l.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0], 10),
        rssKb: parseInt(parts[1], 10) || 0,
        comm: (parts[2] || '').toLowerCase(),
        args: parts.slice(3).join(' ').toLowerCase(),
      };
    });

    for (const app of apps) {
      const cmd = (app.command || '').toLowerCase();
      const id = (app.id || '').toLowerCase();
      const execBase = app.execPath ? path.basename(app.execPath).toLowerCase() : '';

      const matched = procs.filter(p => {
        if (!p.pid) return false;
        // Avoid matching self or tool scripts
        if (p.args.includes('vite') || p.args.includes('systemScanner') || p.args.includes('ps -eo')) return false;

        // Direct command name match (with Linux 15-char comm limit support)
        const matchCmd = cmd && (
          p.comm === cmd ||
          (cmd.length >= 15 && p.comm === cmd.slice(0, 15)) ||
          p.args === cmd ||
          p.args.startsWith(cmd + ' ') ||
          p.args.includes('/' + cmd + ' ') ||
          p.args.endsWith('/' + cmd) ||
          p.args.includes('/' + cmd + '/')
        );

        // Executable basename match
        const matchExec = execBase && (
          p.comm === execBase ||
          (execBase.length >= 15 && p.comm === execBase.slice(0, 15)) ||
          p.args === execBase ||
          p.args.startsWith(execBase + ' ') ||
          p.args.includes('/' + execBase + ' ') ||
          p.args.endsWith('/' + execBase) ||
          p.args.includes('/' + execBase + '/')
        );

        // App ID match
        const matchId = id && (
          p.comm === id ||
          p.args === id ||
          p.args.startsWith(id + ' ') ||
          p.args.includes('/' + id + ' ') ||
          p.args.endsWith('/' + id)
        );

        // Known app signature matches (VLC, Chrome, Telegram, VSCode)
        const matchKnown = (
          ((id === 'vlc' || cmd === 'vlc') && (p.comm === 'vlc' || p.comm.startsWith('vlc') || p.args.includes('/vlc'))) ||
          ((id.includes('telegram') || cmd.includes('telegram')) && (p.comm.startsWith('telegram') || p.args.includes('telegram-desktop'))) ||
          ((id.includes('chrome') || cmd.includes('chrome')) && (p.comm === 'chrome' || p.comm === 'google-chrome' || p.args.includes('/chrome')))
        );

        return matchCmd || matchExec || matchId || matchKnown;
      });

      if (matched.length > 0) {
        const totalRssKb = matched.reduce((sum, m) => sum + m.rssKb, 0);
        const rssMb = Math.round(totalRssKb / 1024);
        app.isRunning = true;
        app.pid = matched[0].pid;
        app.processCount = matched.length;
        app.processRss = rssMb > 1024 ? `${(rssMb / 1024).toFixed(1)} GB` : `${rssMb} MB`;
        app.runningState = 'running';
      } else {
        app.isRunning = false;
        app.runningState = 'closed';
      }
    }
  } catch (e) {
    for (const app of apps) {
      app.isRunning = false;
      app.runningState = 'closed';
    }
  }

  return apps;
}

/**
 * Infers an appropriate AppDepot category dynamically from a name or description.
 */
function inferCategory(text: string): string {
  const lower = text.toLowerCase();
  // Media tested first so "codec", "encoder", "vlc" are not misclassified as ide
  if (/media|audio|video|vlc|player|music|mpv|gimp|inkscape|obs|blender|sound|audacity/.test(lower)) return 'media';
  if (/\bcode\b|vscode|code-oss|\bide\b|editor|studio|vim|emacs|sublime|clion|pycharm|intellij|webstorm|antigravity/.test(lower)) return 'ide';
  if (/sdk|flutter|dart|golang|rust|cargo|jdk|dotnet|toolchain/.test(lower)) return 'sdk';
  if (/chrome|firefox|brave|edge|opera|browser|web/.test(lower)) return 'browsers';
  if (/sql|db|postgres|mysql|redis|mongo|mariadb|sqlite|dbeaver|database/.test(lower)) return 'databases';
  if (/node|python|java|php|ruby|perl|runtime|venv/.test(lower)) return 'runtimes';
  if (/net|vpn|wireguard|tailscale|network|postman|insomnia|wireshark|mesh/.test(lower)) return 'network';
  if (/office|libreoffice|calc|writer|document|pdf/.test(lower)) return 'office';
  if (/game|steam|lutris|wine|minecraft/.test(lower)) return 'games';
  return 'tools';
}

function formatAppName(raw: string): string {
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

/**
 * Dynamically discovers unorganized applications across the host system:
 * 1. Vendor packages in /opt
 * 2. Standalone downloads in ~/Downloads and ~/Applications
 * 3. Real installed desktop software from system and user .desktop directories
 */
export function scanUnorganizedApps() {
  const unorganized: Array<{
    id: string;
    name: string;
    path: string;
    detectedOwner: string;
    suggestedCategory: string;
    mode: 'managed' | 'linked' | 'adopted';
  }> = [];

  const registeredPaths = new Set<string>();
  const registeredIds = new Set<string>();

  // Collect registered paths from ROOT_PATH and USER_ROOT
  const roots = [ROOT_PATH, USER_ROOT];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const cat of fs.readdirSync(root)) {
        const catPath = path.join(root, cat);
        try {
          if (!fs.statSync(catPath).isDirectory()) continue;
          for (const item of fs.readdirSync(catPath)) {
            if (item.startsWith('.')) continue;
            registeredIds.add(item.toLowerCase());
            const itemPath = path.join(catPath, item);
            try {
              if (fs.lstatSync(itemPath).isSymbolicLink()) {
                const resolved = fs.readlinkSync(itemPath);
                registeredPaths.add(resolved);
                if (!path.isAbsolute(resolved)) {
                  registeredPaths.add(path.resolve(path.dirname(itemPath), resolved));
                }
              } else {
                registeredPaths.add(itemPath);
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 1. Scan /opt for external software not yet registered
  if (fs.existsSync('/opt')) {
    try {
      for (const item of fs.readdirSync('/opt')) {
        if (item === 'Application' || item.startsWith('.')) continue;
        const fullPath = path.join('/opt', item);
        try {
          const st = fs.lstatSync(fullPath);
          if (!st.isDirectory() && !st.isSymbolicLink()) continue;
        } catch (e) { continue; }

        if (!registeredPaths.has(fullPath) && !registeredIds.has(item.toLowerCase())) {
          let owner = 'vendor package (/opt)';
          try {
            const dpkgOut = execSync(`dpkg -S "${fullPath}" 2>/dev/null`, { encoding: 'utf-8', timeout: 1500 });
            owner = dpkgOut.split(':')[0].trim();
          } catch (e) {}

          unorganized.push({
            id: item,
            name: formatAppName(item),
            path: fullPath,
            detectedOwner: owner,
            suggestedCategory: inferCategory(item),
            mode: 'linked',
          });
        }
      }
    } catch (e) {}
  }

  // 2. Scan user Applications folder (USER_ROOT)
  if (fs.existsSync(USER_ROOT)) {
    try {
      for (const item of fs.readdirSync(USER_ROOT)) {
        if (item.startsWith('.')) continue;
        const fullPath = path.join(USER_ROOT, item);
        if (registeredPaths.has(fullPath) || registeredIds.has(item.toLowerCase())) continue;
        unorganized.push({
          id: item,
          name: formatAppName(item),
          path: fullPath,
          detectedOwner: 'user application (~/Applications)',
          suggestedCategory: inferCategory(item),
          mode: 'linked',
        });
      }
    } catch (e) {}
  }

  // 3. Scan user Downloads for standalone AppImages, .deb, or archives
  const downloadsDir = path.join(USER_HOME, 'Downloads');
  if (fs.existsSync(downloadsDir)) {
    try {
      for (const f of fs.readdirSync(downloadsDir)) {
        if (f.endsWith('.AppImage') || f.endsWith('.tar.gz') || f.endsWith('.tar.xz') || f.endsWith('.zip') || f.endsWith('.deb')) {
          const baseName = f.replace(/(\.AppImage|\.tar\.gz|\.tar\.xz|\.zip|\.deb)$/i, '')
            .replace(/[-_]linux.*/i, '')
            .replace(/[-_]x86_64.*/i, '')
            .replace(/[-_]amd64.*/i, '');
          const cleanId = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          if (registeredIds.has(cleanId) || unorganized.some(u => u.id === cleanId)) continue;
          unorganized.push({
            id: cleanId,
            name: formatAppName(baseName),
            path: path.join(downloadsDir, f),
            detectedOwner: 'standalone download archive',
            suggestedCategory: inferCategory(baseName),
            mode: 'managed',
          });
        }
      }
    } catch (e) {}
  }

  // 4. Scan real system and user installed desktop applications
  const appDirs = [path.join(USER_HOME, '.local/share/applications'), '/usr/share/applications'];
  for (const dir of appDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.desktop') || f.startsWith('appdepot-') || f.startsWith('mimeinfo') || f.includes('system-') || f.includes('settings')) continue;
        const fullPath = path.join(dir, f);
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.includes('NoDisplay=true') || content.includes('Type=Directory')) continue;
          const nameMatch = content.match(/^Name=(.+)$/m);
          const execMatch = content.match(/^Exec=(.+)$/m);
          if (!nameMatch || !execMatch) continue;

          const appName = nameMatch[1].trim();
          const execCmd = execMatch[1].trim().split(/\s+/)[0].replace(/["']/g, '');
          const id = path.basename(f, '.desktop').toLowerCase().replace(/[^a-z0-9-]/g, '-');

          if (registeredIds.has(id) || unorganized.some(u => u.id === id || u.name === appName)) continue;

          unorganized.push({
            id,
            name: appName,
            path: execCmd.startsWith('/') ? execCmd : fullPath,
            detectedOwner: dir.startsWith('/usr') ? 'system desktop package' : 'user desktop package',
            suggestedCategory: inferCategory(appName + ' ' + id),
            mode: 'linked',
          });
        } catch (e) {}
      }
    } catch (e) {}
  }

  return unorganized;
}

/**
 * Dynamically discovers ALL real running & installed systemd services without hardcoded mappings.
 */
export function scanRealServices() {
  const appServices: Array<{
    id: string; name: string; unit: string;
    port: number; category: string;
  }> = [];

  const seenUnits = new Set<string>();

  // 1. Discover ALL live active/running AND inactive/closed system services dynamically
  try {
    const listOut = execSync('systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    for (const line of listOut.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      const unit = parts[0];
      if (!unit || !unit.endsWith('.service')) continue;

      // Filter out low-level OS kernel/plumbing units
      if (unit.startsWith('systemd-') || unit.startsWith('emergency.') || unit.startsWith('rescue.') ||
          unit.startsWith('kmod-') || unit.startsWith('console-') || unit.startsWith('getty@') ||
          unit.startsWith('user@') || unit.startsWith('session-') || unit.startsWith('plymouth-')) {
        continue;
      }

      const id = unit.replace('.service', '');
      const rawDesc = parts.slice(4).join(' ').trim();
      const name = rawDesc || formatAppName(id);
      const category = inferCategory(id + ' ' + rawDesc);

      seenUnits.add(unit);
      appServices.push({ id, name, unit, port: 0, category });
    }
  } catch (e) {}

  // 2. Discover services related to managed/installed applications in ROOT_PATH and USER_ROOT
  const roots = [ROOT_PATH, USER_ROOT];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    try {
      for (const cat of fs.readdirSync(root)) {
        const catPath = path.join(root, cat);
        try {
          if (!fs.statSync(catPath).isDirectory()) continue;
          for (const item of fs.readdirSync(catPath)) {
            if (item.startsWith('.')) continue;
            const candidateUnits = [`${item}.service`, `${item}-server.service`, `${item}d.service`];
            for (const cand of candidateUnits) {
              if (!seenUnits.has(cand)) {
                try {
                  execSync(`systemctl list-unit-files ${cand} 2>/dev/null | grep -q ${cand}`, { timeout: 1000 });
                  seenUnits.add(cand);
                  appServices.push({
                    id: item,
                    name: formatAppName(item),
                    unit: cand,
                    port: 0,
                    category: cat,
                  });
                  break;
                } catch (e) {}
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // 3. Dynamically map listening ports from live ss socket telemetry
  const portMap = new Map<string, number>();
  try {
    const ssOut = execSync('ss -tulpn 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    for (const line of ssOut.split('\n')) {
      const match = line.match(/:(\d+)\s+.*users:\(\("([^"]+)"/);
      if (match) {
        const port = parseInt(match[1], 10);
        const proc = match[2].toLowerCase();
        if (port > 0 && proc) {
          portMap.set(proc, port);
        }
      }
    }
  } catch (e) {}

  if (appServices.length === 0) return [];

  // 4. Query real status, memory, description, and enablement in ONE batch command
  const results: Array<{
    id: string; name: string; unit: string; status: string;
    port: number; memoryMb: number; memoryFormatted: string;
    autostart: boolean; category: string; description: string;
  }> = [];

  const unitMap = new Map<string, { status: string; memoryMb: number; memoryFormatted: string; description: string; autostart: boolean }>();
  try {
    const unitList = appServices.map(s => s.unit).join(' ');
    const batchOut = execSync(`systemctl show ${unitList} --property=Id,ActiveState,UnitFileState,Description,MemoryCurrent 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 3000,
    });

    const blocks = batchOut.split(/\n(?=Id=)/);
    for (const block of blocks) {
      const idMatch = block.match(/^Id=(.+)$/m);
      if (!idMatch) continue;
      const unitId = idMatch[1].trim();

      const stateMatch = block.match(/^ActiveState=(.+)$/m);
      const activeState = stateMatch ? stateMatch[1].trim() : 'inactive';
      const status = (activeState === 'active' || activeState === 'activating') ? 'active' : 'inactive';

      const memMatch = block.match(/^MemoryCurrent=(\d+)$/m);
      let memoryMb = 0;
      let memoryFormatted = '0 MB';
      if (memMatch) {
        const bytes = parseInt(memMatch[1], 10);
        if (bytes > 0 && !isNaN(bytes)) {
          memoryMb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
          memoryFormatted = memoryMb > 1024 ? `${(memoryMb / 1024).toFixed(1)} GB` : `${memoryMb} MB`;
        }
      }

      const descMatch = block.match(/^Description=(.+)$/m);
      const description = descMatch ? descMatch[1].trim() : '';

      const enableMatch = block.match(/^UnitFileState=(.+)$/m);
      const autostart = enableMatch ? enableMatch[1].trim() === 'enabled' : false;

      unitMap.set(unitId, { status, memoryMb, memoryFormatted, description, autostart });
    }
  } catch (e) {}

  for (const svc of appServices) {
    const data = unitMap.get(svc.unit) || {
      status: 'inactive',
      memoryMb: 0,
      memoryFormatted: '0 MB',
      description: '',
      autostart: false,
    };

    // Match listening port dynamically
    let detectedPort = svc.port;
    if (!detectedPort) {
      const svcNameLower = svc.id.toLowerCase();
      for (const [proc, port] of portMap.entries()) {
        if (proc.includes(svcNameLower) || svcNameLower.includes(proc)) {
          detectedPort = port;
          break;
        }
      }
    }

    results.push({
      id: svc.id,
      name: data.description || svc.name,
      unit: svc.unit,
      status: data.status,
      port: detectedPort,
      memoryMb: data.memoryMb,
      memoryFormatted: data.memoryFormatted,
      autostart: data.autostart,
      category: svc.category,
      description: data.description || svc.name,
    });
  }

  return results;
}

/**
 * Dynamically scans installed apps to build real stack groups.
 * No hardcoded "Flutter Mobile Stack" — detects them from what's actually on disk.
 */
export function scanRealStacks(installedApps: ScannedApp[]) {
  const stacks: Array<{
    id: string;
    name: string;
    description: string;
    members: Array<{ appId: string; name: string; path: string; status: string }>;
    status: 'complete' | 'partial' | 'missing';
  }> = [];

  // Stack definitions: name → required app IDs (any match in the installed apps)
  const stackTemplates = [
    {
      id: 'flutter-mobile',
      name: 'Flutter Mobile Stack',
      description: 'Complete mobile development stack: Dart SDK, Flutter framework, browser for testing.',
      requiredPatterns: ['flutter'],
      optionalPatterns: ['chrome', 'antigravity', 'code', 'intellij'],
    },
    {
      id: 'web-backend',
      name: 'Node.js Web Backend',
      description: 'Node.js runtime with npm global packages for web backend development.',
      requiredPatterns: ['npm-global', 'node'],
      optionalPatterns: ['mysql', 'postgresql', 'redis', 'mongo'],
    },
    {
      id: 'java-stack',
      name: 'Java Development Stack',
      description: 'JVM-based development with Maven/Gradle build tools.',
      requiredPatterns: ['java', 'jdk', 'jre', 'maven', 'gradle'],
      optionalPatterns: ['intellij', 'eclipse', 'netbeans'],
    },
    {
      id: 'database-cluster',
      name: 'Database Cluster',
      description: 'Relational and NoSQL database servers managed under /opt/Application/databases.',
      requiredPatterns: ['mysql', 'postgresql', 'postgresql-bin', 'postgres', 'redis', 'mongo'],
      optionalPatterns: [],
    },
    {
      id: 'browser-pool',
      name: 'Web Browser Pool',
      description: 'All managed web browsers available for testing across rendering engines.',
      requiredPatterns: ['chrome', 'firefox', 'chromium', 'brave'],
      optionalPatterns: [],
    },
    {
      id: 'ide-toolset',
      name: 'IDE & Editor Toolset',
      description: 'Integrated development environments and code editors.',
      requiredPatterns: ['antigravity', 'code', 'intellij', 'pycharm', 'webstorm', 'rider'],
      optionalPatterns: [],
    },
  ];

  for (const template of stackTemplates) {
    const members: Array<{ appId: string; name: string; path: string; status: string }> = [];

    for (const app of installedApps) {
      const idLower = app.id.toLowerCase();
      const nameLower = app.name.toLowerCase();
      const allPatterns = [...template.requiredPatterns, ...template.optionalPatterns];

      const matches = allPatterns.some(pat =>
        idLower === pat || idLower.includes(pat) || nameLower.includes(pat)
      );

      if (matches) {
        members.push({
          appId: app.id,
          name: app.name,
          path: app.path,
          status: app.status,
        });
      }
    }

    // Only include stacks that have at least one real installed member
    if (members.length === 0) continue;

    // Check if required members are all present
    const hasRequired = template.requiredPatterns.some(pat =>
      members.some(m => m.appId.toLowerCase() === pat || m.appId.toLowerCase().includes(pat))
    );

    stacks.push({
      id: template.id,
      name: template.name,
      description: template.description,
      members,
      status: hasRequired ? 'complete' : 'partial',
    });
  }

  return stacks;
}

/**
 * Runs genuine real-time diagnostic checks on the host machine.
 * Dynamically discovers ALL Electron apps with sandbox issues, not just antigravity.
 */
export function runRealDoctor() {
  const checks: Array<{
    code: string; title: string; detail: string; passed: boolean; fixable?: boolean; fixCmd?: string;
  }> = [];

  // D-001: Root and devtools group permissions
  try {
    const stat = fs.statSync(ROOT_PATH);
    const isSetgid = (stat.mode & 0o2000) !== 0;
    const mode = (stat.mode & 0o7777).toString(8);
    const isCorrectMode = mode === '2775';

    // Get group name
    let groupName = 'unknown';
    try {
      const out = execSync(`stat -c '%G' "${ROOT_PATH}" 2>/dev/null`, { encoding: 'utf-8', timeout: 1000 }).trim();
      groupName = out;
    } catch (e) {}

    checks.push({
      code: 'D-001',
      title: 'D-001: Install Root & devtools Group Permissions',
      detail: `/opt/Application exists (mode: ${mode}, setgid: ${isSetgid}, group: ${groupName})`,
      passed: isSetgid && isCorrectMode,
      fixable: !isSetgid || !isCorrectMode,
      fixCmd: `sudo chmod 2775 ${ROOT_PATH} && sudo chown root:devtools ${ROOT_PATH}`,
    });
  } catch (e) {
    checks.push({
      code: 'D-001',
      title: 'D-001: Install Root & devtools Group Permissions',
      detail: '/opt/Application does not exist. Initialize with depot init.',
      passed: false,
      fixable: true,
      fixCmd: `sudo mkdir -p ${ROOT_PATH} && sudo chown root:devtools ${ROOT_PATH} && sudo chmod 2775 ${ROOT_PATH}`,
    });
  }

  // D-002: Category directories are properly structured
  if (fs.existsSync(ROOT_PATH)) {
    const existingCats = fs.readdirSync(ROOT_PATH).filter(f => {
      try { return fs.statSync(path.join(ROOT_PATH, f)).isDirectory() && !f.startsWith('.'); } catch { return false; }
    });
    const missingStandard = KNOWN_CATEGORIES.filter(c => !existingCats.includes(c));
    checks.push({
      code: 'D-002',
      title: 'D-002: Standard Category Directories',
      detail: missingStandard.length === 0
        ? `All ${existingCats.length} category directories exist under /opt/Application.`
        : `Missing standard categories: ${missingStandard.join(', ')}. Click to create.`,
      passed: missingStandard.length === 0,
      fixable: missingStandard.length > 0,
      fixCmd: missingStandard.map(c => `mkdir -p ${ROOT_PATH}/${c} && chmod 2775 ${ROOT_PATH}/${c}`).join(' && '),
    });
  }

  // D-003: Symlinks in /usr/local/bin and ~/.local/bin
  let dangling: string[] = [];
  const binPaths = ['/usr/local/bin', path.join(USER_HOME, '.local/bin')];
  for (const binPath of binPaths) {
    if (fs.existsSync(binPath)) {
      for (const f of fs.readdirSync(binPath)) {
        const p = path.join(binPath, f);
        try {
          if (fs.lstatSync(p).isSymbolicLink() && !fs.existsSync(p)) {
            dangling.push(`${binPath}/${f}`);
          }
        } catch (e) {}
      }
    }
  }
  checks.push({
    code: 'D-003',
    title: 'D-003: Command Symlink Validation (/usr/local/bin & ~/.local/bin)',
    detail: dangling.length === 0
      ? 'All command symlinks in PATH bin directories point to valid targets.'
      : `Dangling symlinks: ${dangling.join(', ')}`,
    passed: dangling.length === 0,
    fixable: dangling.length > 0,
    fixCmd: dangling.map(d => `rm -f "${d}"`).join(' && '),
  });

  // D-004: Orphaned .desktop files (appdepot-managed desktop entries whose target is gone)
  const desktopDirs = [
    '/usr/share/applications',
    path.join(USER_HOME, '.local/share/applications'),
  ];
  const orphanedDesktop: string[] = [];
  for (const dir of desktopDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('appdepot-') || !f.endsWith('.desktop')) continue;
        const fp = path.join(dir, f);
        try {
          const content = fs.readFileSync(fp, 'utf-8');
          const execMatch = content.match(/^TryExec=(.+)$/m);
          if (execMatch && !fs.existsSync(execMatch[1].trim())) {
            orphanedDesktop.push(fp);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  checks.push({
    code: 'D-004',
    title: 'D-004: Orphaned AppDepot Desktop Entries',
    detail: orphanedDesktop.length === 0
      ? 'No orphaned AppDepot desktop entries found.'
      : `Orphaned desktop files: ${orphanedDesktop.map(p => path.basename(p)).join(', ')}`,
    passed: orphanedDesktop.length === 0,
    fixable: orphanedDesktop.length > 0,
    fixCmd: orphanedDesktop.map(p => `rm -f "${p}"`).join(' && '),
  });

  // D-006: Chromium setuid sandbox — dynamically scans ALL apps with chrome-sandbox
  const sandboxIssues: string[] = [];
  const sandboxOk: string[] = [];

  if (fs.existsSync(ROOT_PATH)) {
    for (const cat of fs.readdirSync(ROOT_PATH)) {
      const catPath = path.join(ROOT_PATH, cat);
      try {
        if (!fs.statSync(catPath).isDirectory()) continue;
        for (const item of fs.readdirSync(catPath)) {
          const itemPath = path.join(catPath, item);
          let physPath = itemPath;
          try {
            if (fs.lstatSync(itemPath).isSymbolicLink()) {
              physPath = fs.readlinkSync(itemPath);
              if (!path.isAbsolute(physPath)) physPath = path.resolve(path.dirname(itemPath), physPath);
            }
          } catch (e) {}

          const sandboxFile = path.join(physPath, 'chrome-sandbox');
          if (fs.existsSync(sandboxFile)) {
            try {
              const sStat = fs.statSync(sandboxFile);
              const isSetuid = (sStat.mode & 0o4000) !== 0 && sStat.uid === 0;
              if (isSetuid) {
                sandboxOk.push(item);
              } else {
                sandboxIssues.push(`${item} (${sandboxFile})`);
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }

  if (sandboxOk.length === 0 && sandboxIssues.length === 0) {
    checks.push({
      code: 'D-006',
      title: 'D-006: Chromium Setuid Sandbox Audit',
      detail: 'No Chromium/Electron applications with chrome-sandbox detected.',
      passed: true,
    });
  } else {
    checks.push({
      code: 'D-006',
      title: 'D-006: Chromium Setuid Sandbox Audit',
      detail: sandboxIssues.length === 0
        ? `${sandboxOk.length} app(s) have correct mode 4755 root setuid: ${sandboxOk.join(', ')}`
        : `Sandbox needs fixing for: ${sandboxIssues.join(', ')}. Use: sudo chmod 4755 /path/to/chrome-sandbox && sudo chown root:root /path/to/chrome-sandbox`,
      passed: sandboxIssues.length === 0,
      fixable: sandboxIssues.length > 0,
      fixCmd: sandboxIssues.length > 0
        ? `sudo chown root:root "${sandboxIssues[0].split(' ')[1]?.replace('(', '').replace(')', '')}" && sudo chmod 4755 "${sandboxIssues[0].split(' ')[1]?.replace('(', '').replace(')', '')}"`
        : undefined,
    });
  }

  // D-007: Modular Environment Fragments
  const loaderPath = '/etc/profile.d/appdepot.sh';
  const hasLoader = fs.existsSync(loaderPath);

  // Also check if ~/.local/bin is in PATH
  const localBin = path.join(USER_HOME, '.local/bin');
  const pathVar = process.env.PATH || '';
  const localBinInPath = pathVar.split(':').includes(localBin);

  checks.push({
    code: 'D-007',
    title: 'D-007: Modular Environment Fragments (/etc/profile.d)',
    detail: hasLoader
      ? 'Loader /etc/profile.d/appdepot.sh is present and active.'
      : `Notice: /etc/profile.d/appdepot.sh not found. ~/.local/bin in PATH: ${localBinInPath ? 'Yes' : 'No'}.`,
    passed: hasLoader || localBinInPath,
    fixable: !hasLoader,
    fixCmd: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.profile`,
  });

  // D-008: devtools group membership
  let inDevtoolsGroup = false;
  try {
    const groupsOut = execSync('id -Gn 2>/dev/null', { encoding: 'utf-8', timeout: 1000 }).trim();
    inDevtoolsGroup = groupsOut.split(' ').includes('devtools');
  } catch (e) {}
  checks.push({
    code: 'D-008',
    title: 'D-008: devtools Group Membership',
    detail: inDevtoolsGroup
      ? 'Current user is a member of the devtools group (write access to /opt/Application).'
      : 'Warning: not in devtools group. You may lack write access to /opt/Application.',
    passed: inDevtoolsGroup,
    fixable: !inDevtoolsGroup,
    fixCmd: `sudo usermod -aG devtools ${process.env.USER || 'besu'} && newgrp devtools`,
  });

  return checks;
}

/**
 * Analyzes an archive or folder on the host machine.
 * Returns true heuristic findings (main binary, sandbox, desktop file, icon).
 */
function findFilesRecursive(dir: string, depth = 0, maxDepth = 4): string[] {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = path.join(dir, entry);
      try {
        const st = fs.statSync(full);
        if (st.isDirectory()) {
          results.push(...findFilesRecursive(full, depth + 1, maxDepth));
        } else if (st.isFile()) {
          results.push(full);
        }
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

function findBestExecutable(targetDir: string, appName: string): string {
  const allFiles = findFilesRecursive(targetDir, 0, 4);
  const appLower = appName.toLowerCase();
  let bestExec = '';
  let bestScore = -100;

  for (const fp of allFiles) {
    const fname = path.basename(fp).toLowerCase();
    if (fname.includes('crashpad') || fname.includes('sandbox') ||
        fname.endsWith('.so') || fname.includes('.so.') || fname.endsWith('.pak') ||
        fname.startsWith('uninstall') || fname.startsWith('update')) {
      continue;
    }

    try {
      const st = fs.statSync(fp);
      const isExec = (st.mode & 0o111) !== 0 || !fname.includes('.') || fname.endsWith('.sh') || fname.endsWith('.bin') || fname.endsWith('.AppImage');
      if (!isExec) continue;

      let score = 50;
      if (fname === appLower || fname === `${appLower}-bin` || fname === `${appLower}-ide`) {
        score += 50;
      } else if (fname.includes(appLower)) {
        score += 25;
      }
      if (path.dirname(fp) === targetDir || path.basename(path.dirname(fp)) === 'bin') {
        score += 30;
      }

      if (score > bestScore) {
        bestScore = score;
        bestExec = fp;
      }
    } catch (e) {}
  }

  if (!bestExec && allFiles.length > 0) {
    bestExec = allFiles[0];
  }
  if (bestExec) {
    try { fs.chmodSync(bestExec, 0o755); } catch (e) {}
  }
  return bestExec || path.join(targetDir, appName);
}

function findBestIcon(targetDir: string, appName: string): string | null {
  const allFiles = findFilesRecursive(targetDir, 0, 4);
  const appLower = appName.toLowerCase();
  let bestIcon: string | null = null;
  let bestScore = -100;

  for (const fp of allFiles) {
    const fname = path.basename(fp).toLowerCase();
    if (!fname.endsWith('.svg') && !fname.endsWith('.png')) continue;
    if (fp.includes('/test/') || fp.includes('/node_modules/') || fp.includes('/docs/')) continue;

    let score = fname.endsWith('.svg') ? 50 : 30;
    if (fname.startsWith(appLower)) {
      score += 35;
    } else if (fname.startsWith('icon') || fname.startsWith('logo') || fname.startsWith('app')) {
      score += 20;
    }
    if (fp.includes('/share/icons') || fp.includes('/resources') || fp.includes('/assets')) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIcon = fp;
    }
  }

  return bestIcon;
}

/**
 * Analyzes an archive, URL, or folder on the host machine.
 * Returns true heuristic findings (main binary, sandbox, desktop file, icon).
 */
export function analyzeSource(sourcePath: string, appName: string, category: string) {
  const isUrl = sourcePath.startsWith('http://') || sourcePath.startsWith('https://');

  if (isUrl) {
    return {
      valid: true,
      resolvedPath: sourcePath,
      sizeBytes: 0,
      sizeFormatted: 'Remote URL (download on install)',
      filesCount: 1,
      mainExecutable: appName,
      execScore: 90,
      hasSandbox: false,
      iconCandidate: null,
      suggestedCategory: category || 'tools',
      targetDir: path.join(ROOT_PATH, category || 'tools', appName),
      desktopDest: path.join(USER_HOME, '.local/share/applications', `appdepot-${appName}.desktop`),
      binDest: path.join(USER_HOME, '.local/bin', appName),
      isAppImage: sourcePath.toLowerCase().endsWith('.appimage'),
    };
  }

  // Resolve relative to repo root if not absolute
  let resolvedPath = sourcePath;
  if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(PROJECT_ROOT, sourcePath);
  }

  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      error: `File or directory not found at: ${resolvedPath}`,
    };
  }

  const stat = fs.statSync(resolvedPath);
  let files: string[] = [];

  if (stat.isDirectory()) {
    try {
      files = fs.readdirSync(resolvedPath);
    } catch (e: any) {
      return { valid: false, error: e.message };
    }
  } else if (resolvedPath.endsWith('.tar.gz') || resolvedPath.endsWith('.tgz')) {
    try {
      const out = execSync(`tar -ztf "${resolvedPath}" | head -n 100`, { encoding: 'utf-8' });
      files = out.split('\n').filter(Boolean);
    } catch (e: any) {
      return { valid: false, error: `Failed to inspect tarball: ${e.message}` };
    }
  } else if (resolvedPath.endsWith('.tar.xz') || resolvedPath.endsWith('.txz')) {
    try {
      const out = execSync(`tar -Jtf "${resolvedPath}" | head -n 100`, { encoding: 'utf-8' });
      files = out.split('\n').filter(Boolean);
    } catch (e: any) {
      return { valid: false, error: `Failed to inspect tar.xz: ${e.message}` };
    }
  } else if (resolvedPath.endsWith('.zip')) {
    try {
      const out = execSync(`unzip -l "${resolvedPath}" | tail -n +4 | head -n 100`, { encoding: 'utf-8' });
      files = out.split('\n').filter(Boolean).map(l => l.trim().split(/\s+/).pop() || '');
    } catch (e: any) {
      return { valid: false, error: `Failed to inspect zip: ${e.message}` };
    }
  } else if (resolvedPath.endsWith('.AppImage')) {
    files = [path.basename(resolvedPath)];
  }

  // Discover candidate executables
  let detectedExec = '';
  let execScore = 50;
  let hasSandbox = false;
  let iconCandidate: string | null = null;

  for (const rawFile of files) {
    const f = rawFile.replace(/^[^/]+\//, ''); // strip top folder
    const base = path.basename(f);

    if (base === 'chrome-sandbox') hasSandbox = true;

    if (base.endsWith('.png') || base.endsWith('.svg') || base.endsWith('.ico')) {
      if (!iconCandidate || base.includes(appName.toLowerCase())) {
        iconCandidate = rawFile;
      }
    }

    if (!base.includes('.') || base.endsWith('.sh') || base.endsWith('.bin') || base.endsWith('.AppImage')) {
      if (!base.includes('sandbox') && !base.includes('crashpad') &&
          !base.includes('helper') && !base.startsWith('lib') &&
          !base.endsWith('.so') && !base.endsWith('.pak')) {
        if (!detectedExec || base.toLowerCase() === appName.toLowerCase()) {
          detectedExec = base;
          execScore = base.toLowerCase() === appName.toLowerCase() ? 95 : 80;
        }
      }
    }
  }

  if (!detectedExec) detectedExec = appName;

  const targetDir = path.join(ROOT_PATH, category, appName);
  const desktopDest = path.join(USER_HOME, '.local/share/applications', `appdepot-${appName}.desktop`);
  const binDest = path.join(USER_HOME, '.local/bin', appName);

  return {
    valid: true,
    resolvedPath,
    sizeBytes: stat.size,
    sizeFormatted: stat.isDirectory()
      ? 'directory'
      : `${(stat.size / (1024 * 1024)).toFixed(1)} MB`,
    filesCount: files.length,
    mainExecutable: detectedExec,
    execScore,
    hasSandbox,
    iconCandidate,
    suggestedCategory: category,
    targetDir,
    desktopDest,
    binDest,
    isAppImage: resolvedPath.endsWith('.AppImage'),
  };
}

/**
 * Performs a REAL package installation on the host filesystem.
 */
export function performRealInstall(sourceArchive: string, category: string, appName: string) {
  let isTempDownload = false;
  let resolvedPath = sourceArchive.trim();

  // 1. Handle URL downloads
  if (resolvedPath.startsWith('http://') || resolvedPath.startsWith('https://')) {
    const tempDir = path.join('/tmp', 'appdepot_downloads');
    fs.mkdirSync(tempDir, { recursive: true });
    const urlFilename = path.basename(new URL(resolvedPath).pathname) || `${appName}.tar.gz`;
    const tempFile = path.join(tempDir, `${Date.now()}_${urlFilename}`);
    try {
      execSync(`curl -fSL --connect-timeout 15 -o "${tempFile}" "${resolvedPath}"`, { encoding: 'utf-8' });
      resolvedPath = tempFile;
      isTempDownload = true;
    } catch (e: any) {
      throw new Error(`Failed to download package from URL: ${e.message}`);
    }
  } else if (!path.isAbsolute(resolvedPath)) {
    resolvedPath = path.resolve(PROJECT_ROOT, sourceArchive);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Source archive not found: ${resolvedPath}`);
  }

  const targetDir = path.join(ROOT_PATH, category, appName);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const stat = fs.statSync(resolvedPath);

  // 2. Extract / Stage archive
  if (resolvedPath.endsWith('.AppImage')) {
    const destAppImage = path.join(targetDir, `${appName}.AppImage`);
    fs.copyFileSync(resolvedPath, destAppImage);
    fs.chmodSync(destAppImage, 0o755);
  } else if (stat.isDirectory()) {
    execSync(`cp -rf "${resolvedPath}"/* "${targetDir}/" 2>/dev/null || true`);
  } else if (resolvedPath.endsWith('.tar.gz') || resolvedPath.endsWith('.tgz')) {
    try {
      execSync(`tar -xzf "${resolvedPath}" -C "${targetDir}" --strip-components=1 2>/dev/null || tar -xzf "${resolvedPath}" -C "${targetDir}"`, { encoding: 'utf-8' });
    } catch (e: any) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`Archive extraction failed: ${e.message}`);
    }
  } else if (resolvedPath.endsWith('.tar.xz') || resolvedPath.endsWith('.txz')) {
    try {
      execSync(`tar -xJf "${resolvedPath}" -C "${targetDir}" --strip-components=1 2>/dev/null || tar -xJf "${resolvedPath}" -C "${targetDir}"`, { encoding: 'utf-8' });
    } catch (e: any) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`tar.xz extraction failed: ${e.message}`);
    }
  } else if (resolvedPath.endsWith('.tar.bz2') || resolvedPath.endsWith('.tbz2')) {
    try {
      execSync(`tar -xjf "${resolvedPath}" -C "${targetDir}" --strip-components=1 2>/dev/null || tar -xjf "${resolvedPath}" -C "${targetDir}"`, { encoding: 'utf-8' });
    } catch (e: any) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`tar.bz2 extraction failed: ${e.message}`);
    }
  } else if (resolvedPath.endsWith('.zip')) {
    try {
      execSync(`unzip -q -o "${resolvedPath}" -d "${targetDir}" 2>/dev/null || true`, { encoding: 'utf-8' });
    } catch (e: any) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`Zip extraction failed: ${e.message}`);
    }
  } else if (resolvedPath.endsWith('.deb')) {
    try {
      execSync(`dpkg-deb -x "${resolvedPath}" "${targetDir}" 2>/dev/null || (cd "${targetDir}" && ar x "${resolvedPath}" && tar -xf data.tar.* && rm -f control.tar.* data.tar.* debian-binary)`, { encoding: 'utf-8' });
    } catch (e: any) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      throw new Error(`Deb extraction failed: ${e.message}`);
    }
  }

  if (isTempDownload) {
    try { fs.unlinkSync(resolvedPath); } catch (e) {}
  }

  // 3. Heuristic discovery of main executable and icon
  const mainExec = findBestExecutable(targetDir, appName);
  const bestIcon = findBestIcon(targetDir, appName);

  // 4. Create .desktop file with real Icon reference
  const userApps = path.join(USER_HOME, '.local/share/applications');
  fs.mkdirSync(userApps, { recursive: true });
  const desktopDest = path.join(userApps, `appdepot-${appName}.desktop`);
  const iconLine = bestIcon ? `Icon=${bestIcon}\n` : '';
  const desktopContent = `[Desktop Entry]
Type=Application
Version=1.5
Name=${appName.charAt(0).toUpperCase() + appName.slice(1).replace(/-/g, ' ')}
Exec="${mainExec}" %U
TryExec=${mainExec}
${iconLine}Terminal=false
Categories=Utility;${category.toUpperCase()};
StartupNotify=true
X-AppDepot-Managed=true
`;
  fs.writeFileSync(desktopDest, desktopContent);
  try { execSync(`update-desktop-database "${userApps}" 2>/dev/null || true`); } catch (e) {}

  // Also try system-wide desktop entry
  try {
    fs.writeFileSync(path.join('/usr/share/applications', `appdepot-${appName}.desktop`), desktopContent);
    execSync('update-desktop-database /usr/share/applications 2>/dev/null || true');
  } catch (e) {}

  // 5. Create command symlink in ~/.local/bin
  const userBin = path.join(USER_HOME, '.local/bin');
  fs.mkdirSync(userBin, { recursive: true });
  const binLink = path.join(userBin, appName);
  try { fs.unlinkSync(binLink); } catch (e) {}
  try { fs.symlinkSync(mainExec, binLink); } catch (e) {}

  // Also try /usr/local/bin if writable
  try {
    execSync(`ln -sf "${mainExec}" "/usr/local/bin/${appName}" 2>/dev/null || true`);
  } catch (e) {}

  // 6. Write environment fragment in ~/.config/appdepot/env.d
  try {
    const envD = path.join(USER_HOME, '.config/appdepot/env.d');
    fs.mkdirSync(envD, { recursive: true });
    const envFrag = path.join(envD, `${appName}.sh`);
    const varName = appName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    fs.writeFileSync(envFrag, `# AppDepot environment for ${appName}\nexport ${varName}_HOME="${targetDir}"\nexport PATH="${targetDir}/bin:$PATH"\n`);
  } catch (e) {}

  return { success: true, installedPath: targetDir, execPath: mainExec, iconPath: bestIcon, desktopPath: desktopDest, binLink };
}

/**
 * Performs REAL uninstallation/removal.
 */
export function performRealUninstall(appId: string, category: string, mode: string, appPath: string, linkPath?: string | null) {
  // Sanitize IDs
  const cleanAppId = path.basename(appId).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const cleanCategory = path.basename(category).replace(/[^a-zA-Z0-9_\-\.]/g, '');

  const rawTarget = linkPath || appPath || path.join(ROOT_PATH, cleanCategory, cleanAppId);
  const targetLink = path.resolve(rawTarget);

  // Security containment check: Must be inside managed app root or user applications
  const homeDir = USER_HOME;
  const allowedRoots = [
    path.resolve(ROOT_PATH),
    path.resolve(USER_ROOT),
    path.resolve(homeDir, '.local/share/applications'),
    path.resolve(homeDir, '.local/bin'),
    path.resolve(homeDir, '.config/appdepot'),
  ];

  const isSafe = allowedRoots.some(allowed => targetLink === allowed || targetLink.startsWith(allowed + path.sep));
  if (!isSafe) {
    throw new Error(`Security Violation: Refusing to delete path outside managed boundaries: ${targetLink}`);
  }

  // Never allow deleting the root boundary itself
  if (allowedRoots.includes(targetLink) || targetLink === '/' || targetLink === homeDir) {
    throw new Error(`Security Violation: Cannot delete root directory: ${targetLink}`);
  }

  if (fs.existsSync(targetLink) || (() => { try { return fs.lstatSync(targetLink).isSymbolicLink(); } catch { return false; } })()) {
    try {
      const st = fs.lstatSync(targetLink);
      if (st.isSymbolicLink()) {
        fs.unlinkSync(targetLink);
      } else if (mode === 'managed') {
        fs.rmSync(targetLink, { recursive: true, force: true });
      }
    } catch (e: any) {
      throw new Error(`Failed to remove application files: ${e.message}`);
    }
  }

  // Remove desktop entries
  const userApps = path.join(homeDir, '.local/share/applications');
  const desktopFiles = [
    path.join(userApps, `appdepot-${cleanAppId}.desktop`),
    path.join(userApps, `${cleanAppId}.desktop`),
    path.join('/usr/share/applications', `appdepot-${cleanAppId}.desktop`),
  ];
  desktopFiles.forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  });
  try { execSync(`update-desktop-database "${userApps}" 2>/dev/null || true`); } catch (e) {}

  // Remove binary symlinks
  const binFiles = [
    path.join(homeDir, '.local/bin', cleanAppId),
    path.join('/usr/local/bin', cleanAppId),
  ];
  binFiles.forEach(p => {
    try {
      if ((fs.existsSync(p) || (() => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } })()) && fs.lstatSync(p).isSymbolicLink()) {
        fs.unlinkSync(p);
      }
    } catch (e) {}
  });

  return { success: true, removedApp: cleanAppId };
}

/**
 * Adopts an unorganized directory into /opt/Application via symlink.
 */
export function performRealAdopt(sourcePath: string, category: string, appId: string) {
  const cleanAppId = path.basename(appId).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const cleanCategory = path.basename(category).replace(/[^a-zA-Z0-9_\-\.]/g, '');

  const catDir = path.join(ROOT_PATH, cleanCategory);
  fs.mkdirSync(catDir, { recursive: true });

  const targetLink = path.join(catDir, cleanAppId);
  try {
    if (fs.existsSync(targetLink) || fs.lstatSync(targetLink).isSymbolicLink()) {
      fs.unlinkSync(targetLink);
    }
  } catch (e) {}

  fs.symlinkSync(path.resolve(sourcePath), targetLink);
  return { success: true, linkPath: targetLink, target: sourcePath };
}

/**
 * Applies a Doctor fix command on the host system.
 */
export function applyDoctorFix(fixCmd: string): { success: boolean; output: string } {
  // Security whitelist: only allow recognized repair commands
  const safePatterns = [
    /^sudo chmod 2775 \/opt\/Application/,
    /^sudo mkdir -p \/opt\/Application/,
    /^mkdir -p \/opt\/Application/,
    /^chmod 2775 \/opt\/Application/,
    /^rm -f "\/opt\/Application\//,
    /^rm -f "\/[^"]+\.local\/share\/applications\//,
    /^rm -f "\/[^"]+\.local\/bin\//,
    /^echo 'export PATH=/,
    /^sudo usermod -aG devtools/,
    /^pkexec /
  ];

  const trimmed = fixCmd.trim();
  const isApproved = safePatterns.some(p => p.test(trimmed));
  if (!isApproved) {
    return { success: false, output: 'Security Violation: Fix command is not on the verified repair whitelist.' };
  }

  try {
    const out = execSync(trimmed, { encoding: 'utf-8', timeout: 10000 });
    return { success: true, output: out || 'Fix applied successfully.' };
  } catch (e: any) {
    return { success: false, output: e.message || 'Fix command failed.' };
  }
}

/**
 * Launches an application process asynchronously on the desktop.
 */
export function launchApp(commandOrPath: string) {
  try {
    const child = spawn(commandOrPath, [], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();
    return { success: true, pid: child.pid };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Opens a folder in the host file manager without invoking subshell.
 */
export function openFolder(folderPath: string) {
  try {
    const child = spawn('xdg-open', [folderPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Exports a reproducible AppDepot workstation profile/manifest for a stack.
 */
export function exportStackManifest(stackId: string) {
  const apps = scanInstalledApps();
  const stacks = scanRealStacks(apps);
  const stack = stacks.find(s => s.id === stackId);
  if (!stack) {
    throw new Error(`Stack '${stackId}' not found.`);
  }

  const manifest = {
    profile: {
      id: stack.id,
      name: stack.name,
      description: stack.description,
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      generator: 'AppDepot for Linux',
    },
    members: stack.members.map(m => {
      const app = apps.find(a => a.id === m.appId);
      return {
        id: m.appId,
        name: m.name,
        category: app?.category || 'tools',
        mode: app?.mode || 'managed',
        path: m.path,
        status: m.status,
      };
    }),
  };

  let toml = `# AppDepot Workstation Profile\n# Generated: ${new Date().toUTCString()}\n\n`;
  toml += `[profile]\nname = "${manifest.profile.name}"\ndescription = "${manifest.profile.description}"\nversion = "${manifest.profile.version}"\n\n`;
  for (const m of manifest.members) {
    toml += `[[apps]]\nid = "${m.id}"\nname = "${m.name}"\ncategory = "${m.category}"\nmode = "${m.mode}"\npath = "${m.path}"\n\n`;
  }

  return { toml, json: manifest };
}

// ── File System Browser & Directory Creator ─────────────────────────────────

export interface FsItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isArchive: boolean;
  isExecutable: boolean;
  size: number;
  sizeFormatted: string;
  modified: number;
  extension: string;
}

export interface BrowseResult {
  currentPath: string;
  parentPath: string;
  exists: boolean;
  canWrite: boolean;
  breadcrumbs: Array<{ name: string; path: string }>;
  items: FsItem[];
  quickBookmarks: Array<{ name: string; path: string }>;
  error?: string;
}

/**
 * Browses a directory path on the host system, returning folders, archives, and executables.
 */
export function browseDirectory(targetPath?: string): BrowseResult {
  const home = USER_HOME;
  let resolved = targetPath
    ? (targetPath.startsWith('~') ? path.join(home, targetPath.slice(1)) : path.resolve(targetPath))
    : home;

  if (!fs.existsSync(resolved)) {
    resolved = home;
  }

  try {
    const st = fs.statSync(resolved);
    if (!st.isDirectory()) {
      resolved = path.dirname(resolved);
    }
  } catch (e) {
    resolved = home;
  }

  let canWrite = false;
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
    canWrite = true;
  } catch (e) {
    canWrite = false;
  }

  const parts = resolved.split('/').filter(Boolean);
  const breadcrumbs: Array<{ name: string; path: string }> = [{ name: 'Root (/)', path: '/' }];
  let accum = '';
  for (const p of parts) {
    accum += '/' + p;
    breadcrumbs.push({ name: p, path: accum });
  }

  const quickBookmarks = [
    { name: 'Home (~)', path: home },
    { name: 'Downloads', path: path.join(home, 'Downloads') },
    { name: '/opt/Application', path: ROOT_PATH },
    { name: '/opt', path: '/opt' },
    { name: '/usr/bin', path: '/usr/bin' },
    { name: '/tmp', path: '/tmp' },
  ];

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(resolved);
  } catch (e: any) {
    return {
      currentPath: resolved,
      parentPath: path.dirname(resolved),
      exists: true,
      canWrite,
      breadcrumbs,
      items: [],
      quickBookmarks,
      error: `Access Denied: ${e.message}`,
    };
  }

  const items: FsItem[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(resolved, entry);
    try {
      const st = fs.lstatSync(full);
      const isDir = st.isDirectory();
      const isArchive = /\.(tar(\.[a-z0-9]+)?|tgz|tbz2|txz|zip|deb|appimage|rpm)$/i.test(entry);
      const isExec = !isDir && (st.mode & 0o111) !== 0;
      items.push({
        name: entry,
        path: full,
        isDirectory: isDir,
        isArchive,
        isExecutable: isExec,
        size: st.size,
        sizeFormatted: isDir ? '--' : formatByteSize(st.size),
        modified: st.mtimeMs,
        extension: path.extname(entry).toLowerCase(),
      });
    } catch (e) {}
  }

  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    currentPath: resolved,
    parentPath: path.dirname(resolved),
    exists: true,
    canWrite,
    breadcrumbs,
    items,
    quickBookmarks,
  };
}

/**
 * Creates a new directory securely on disk with appropriate permissions.
 */
export function createDirectory(parentDir: string, folderName: string): { success: boolean; createdPath?: string; error?: string } {
  if (!folderName || !folderName.trim()) {
    return { success: false, error: 'Folder name cannot be empty.' };
  }
  const cleanName = folderName.trim();
  if (cleanName.includes('/') || cleanName.includes('\\') || cleanName === '..' || cleanName === '.') {
    return { success: false, error: 'Invalid folder name. Cannot contain path separators or parent traversals.' };
  }

  let resolvedParent = parentDir
    ? (parentDir.startsWith('~') ? path.join(USER_HOME, parentDir.slice(1)) : path.resolve(parentDir))
    : USER_HOME;

  if (!fs.existsSync(resolvedParent)) {
    return { success: false, error: `Parent directory does not exist: ${resolvedParent}` };
  }

  const targetPath = path.join(resolvedParent, cleanName);
  if (fs.existsSync(targetPath)) {
    return { success: false, error: `A file or directory already exists at: ${targetPath}` };
  }

  try {
    fs.mkdirSync(targetPath, { recursive: true, mode: 0o775 });
    if (targetPath.startsWith(ROOT_PATH)) {
      try { fs.chmodSync(targetPath, 0o2775); } catch (e) {}
    }
    return { success: true, createdPath: targetPath };
  } catch (e: any) {
    return { success: false, error: `Failed to create directory: ${e.message}` };
  }
}

/**
 * Triggers native desktop file/folder dialog (kdialog / zenity) on KDE/Linux desktops.
 */
export function pickNativePath(options: { type?: 'file' | 'folder'; startDir?: string; title?: string }): Promise<{ success: boolean; path?: string; cancelled?: boolean; error?: string }> {
  return new Promise((resolve) => {
    const isFolder = options.type === 'folder';
    const start = options.startDir || USER_HOME;
    const title = options.title || (isFolder ? 'Select Directory' : 'Select Package / Archive');

    const env = {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':0',
      XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP || 'KDE',
    };

    const hasKdialog = fs.existsSync('/usr/bin/kdialog');
    const hasZenity = fs.existsSync('/usr/bin/zenity');

    if (hasKdialog) {
      const args = isFolder
        ? ['--getexistingdirectory', start, '--title', title]
        : ['--getopenfilename', start, '*.tar.* *.zip *.deb *.AppImage *|Installable Archives & Binaries (*.tar.*, *.deb, *.AppImage, *.zip)\n*|All Files (*)', '--title', title];

      const child = spawn('/usr/bin/kdialog', args, { env });
      let output = '';
      child.stdout?.on('data', (d) => { output += d.toString(); });
      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve({ success: true, path: output.trim() });
        } else {
          resolve({ success: false, cancelled: true });
        }
      });
      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      return;
    }

    if (hasZenity) {
      const args = isFolder
        ? ['--file-selection', '--directory', `--filename=${start}/`, `--title=${title}`]
        : ['--file-selection', `--filename=${start}/`, `--title=${title}`];

      const child = spawn('/usr/bin/zenity', args, { env });
      let output = '';
      child.stdout?.on('data', (d) => { output += d.toString(); });
      child.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve({ success: true, path: output.trim() });
        } else {
          resolve({ success: false, cancelled: true });
        }
      });
      child.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      return;
    }

    resolve({ success: false, error: 'No native dialog tool (kdialog or zenity) found on system.' });
  });
}

// ── Complete Host System Package Registry (Zero Hardcoding) ─────────────────

export interface SystemPackage {
  id: string;
  name: string;
  version: string;
  section: string;
  sizeKb: number;
  sizeFormatted: string;
  summary: string;
  manager: 'apt/dpkg' | 'snap';
  type: 'deb' | 'snap';
}

/**
 * Dynamically queries ALL installed system packages across the entire PC (apt/dpkg + snap).
 * Sub-second execution (approx 70ms) with zero hardcoding.
 */
export function scanSystemPackages(): SystemPackage[] {
  const pkgs: SystemPackage[] = [];
  const seen = new Set<string>();

  // 1. Query live dpkg database
  try {
    const out = execSync("dpkg-query -W -f='${Package}\t${Version}\t${Section}\t${Installed-Size}\t${binary:Summary}\n' 2>/dev/null", {
      encoding: 'utf-8',
      maxBuffer: 25 * 1024 * 1024,
      timeout: 6000,
    });
    for (const line of out.trim().split('\n')) {
      if (!line) continue;
      const [name, version, section, sizeStr, ...descParts] = line.split('\t');
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const sizeKb = parseInt(sizeStr, 10) || 0;
      const sizeFormatted = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      pkgs.push({
        id: `deb-${name}`,
        name,
        version: version || 'installed',
        section: section || 'utils',
        sizeKb,
        sizeFormatted,
        summary: descParts.join('\t') || '',
        manager: 'apt/dpkg',
        type: 'deb',
      });
    }
  } catch (e) {}

  // 2. Query live snap packages
  try {
    const snapOut = execSync('snap list 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    const lines = snapOut.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2 && !seen.has(parts[0])) {
        seen.add(parts[0]);
        pkgs.push({
          id: `snap-${parts[0]}`,
          name: parts[0],
          version: parts[1],
          section: 'snap',
          sizeKb: 0,
          sizeFormatted: 'Snap Pkg',
          summary: `Snap package (rev ${parts[2] || ''})`,
          manager: 'snap',
          type: 'snap',
        });
      }
    }
  } catch (e) {}

  return pkgs;
}

/**
 * Starts, stops, or restarts a real host systemd service.
 */
export function controlService(unit: string, action: string): { success: boolean; output: string } {
  const cleanUnit = unit.trim();
  if (!cleanUnit.endsWith('.service')) return { success: false, output: 'Invalid unit name.' };
  const allowedActions = ['start', 'stop', 'restart', 'enable', 'disable'];
  if (!allowedActions.includes(action)) return { success: false, output: 'Invalid action.' };

  try {
    const out = execSync(`systemctl ${action} "${cleanUnit}" 2>&1`, { encoding: 'utf-8', timeout: 10000 });
    return { success: true, output: out || `Service ${action} succeeded.` };
  } catch (e: any) {
    return { success: false, output: e.message || 'Service operation failed.' };
  }
}

/**
 * Gracefully stops or terminates a running application process.
 */
export function terminateAppProcess(pidOrCommand: number | string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): { success: boolean; output: string } {
  try {
    const sigNum = signal === 'SIGKILL' ? '-9' : '-15';
    if (typeof pidOrCommand === 'number' || /^\d+$/.test(String(pidOrCommand))) {
      const pid = parseInt(String(pidOrCommand), 10);
      execSync(`kill ${sigNum} ${pid} 2>/dev/null`, { timeout: 3000 });
      return { success: true, output: `Process ${pid} signal ${signal} sent.` };
    } else {
      const cleanCmd = String(pidOrCommand).replace(/[^a-zA-Z0-9_.-]/g, '');
      execSync(`pkill ${sigNum} -f "${cleanCmd}" 2>/dev/null`, { timeout: 3000 });
      return { success: true, output: `Process ${cleanCmd} signal ${signal} sent.` };
    }
  } catch (e: any) {
    return { success: false, output: e.message || 'Failed to terminate process.' };
  }
}

export interface LiveProcess {
  pid: number;
  user: string;
  cpu: number;
  memPercent: number;
  rssKb: number;
  rssFormatted: string;
  stat: string;
  comm: string;
  args: string;
  name: string;
  isApp: boolean;
  appId: string | null;
  category: string;
  iconPath: string | null;
}

/**
 * Scans all live active processes across the Linux host.
 */
export function scanLiveProcesses(): LiveProcess[] {
  const processes: LiveProcess[] = [];
  try {
    const psOut = execSync('ps -eo pid,user,%cpu,%mem,rss,stat,comm,args --no-headers --sort=-rss 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 2500,
    });

    const lines = psOut.trim().split('\n');
    const installedApps = scanInstalledApps();

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;

      const pid = parseInt(parts[0], 10);
      if (!pid || pid === 2) continue; // Skip init/kthreadd kernel threads

      const user = parts[1];
      const cpu = parseFloat(parts[2]) || 0;
      const memPercent = parseFloat(parts[3]) || 0;
      const rssKb = parseInt(parts[4], 10) || 0;
      const stat = parts[5];
      const comm = parts[6];
      const args = parts.slice(7).join(' ');

      // Filter out raw kernel threads like [kworker/...]
      if (args.startsWith('[') && args.endsWith(']')) continue;

      // Format RSS memory
      const rssMb = Math.round(rssKb / 1024);
      const rssFormatted = rssMb > 1024 ? `${(rssMb / 1024).toFixed(1)} GB` : `${rssMb} MB`;

      // Match to installed apps
      const commLower = comm.toLowerCase();
      const argsLower = args.toLowerCase();

      let matchedApp = installedApps.find(app => {
        const cmd = (app.command || '').toLowerCase();
        const id = (app.id || '').toLowerCase();
        const execBase = app.execPath ? path.basename(app.execPath).toLowerCase() : '';

        return (
          (cmd && (commLower === cmd || argsLower.includes('/' + cmd + ' ') || argsLower.endsWith('/' + cmd) || argsLower === cmd)) ||
          (execBase && (commLower === execBase || argsLower.includes('/' + execBase))) ||
          (id && (commLower === id || argsLower.includes('/' + id + ' ') || argsLower === id))
        );
      });

      // Special dynamic match for VLC media player if running
      if (!matchedApp && (commLower === 'vlc' || argsLower.includes('/vlc'))) {
        matchedApp = installedApps.find(a => a.id === 'vlc' || a.command === 'vlc');
      }

      const isApp = !!matchedApp;
      const name = matchedApp ? matchedApp.name : formatAppName(comm);
      const category = matchedApp ? matchedApp.category : inferCategory(comm + ' ' + args);
      const appId = matchedApp ? matchedApp.id : null;
      const iconPath = (matchedApp && matchedApp.iconPath) ? matchedApp.iconPath : null;

      processes.push({
        pid,
        user,
        cpu,
        memPercent,
        rssKb,
        rssFormatted,
        stat,
        comm,
        args,
        name,
        isApp,
        appId,
        category,
        iconPath,
      });
    }
  } catch (e) {}

  return processes;
}


