import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

export const ROOT_PATH = '/opt/Application';
export const USER_ROOT = path.join(process.env.HOME || '/home/besu', 'Applications');
export const PROJECT_ROOT = fs.existsSync(path.resolve(process.cwd(), 'Cargo.toml'))
  ? process.cwd()
  : path.resolve(process.cwd(), '../..');

// Standard category IDs (all lowercase, no spaces)
export const KNOWN_CATEGORIES = [
  'ide', 'sdk', 'browsers', 'databases', 'runtimes', 'network', 'office', 'tools', 'games', 'media'
];

export interface ScannedApp {
  id: string;
  name: string;
  category: string;
  version: string;
  mode: 'managed' | 'linked' | 'adopted';
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
        const binLinkUser = path.join(process.env.HOME || '/home/besu', '.local/bin', item);
        const hasBinLink = fs.existsSync(binLinkSystem) || fs.existsSync(binLinkUser);

        // Check for real desktop entry
        const desktopPaths = [
          path.join(process.env.HOME || '/home/besu', '.local/share/applications', `appdepot-${item}.desktop`),
          path.join(process.env.HOME || '/home/besu', '.local/share/applications', `${item}.desktop`),
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

        // Query real disk usage (fast du -sh)
        let sizeFormatted = 'Managed';
        if (exists) {
          try {
            const duOut = execSync(`du -sh "${physicalPath}" 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 });
            sizeFormatted = duOut.split(/\s+/)[0] || 'Managed';
          } catch (e) {
            sizeFormatted = 'Active';
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

  return apps;
}

/**
 * Scans for unorganized applications from:
 * 1. Directories in /opt that are not yet linked to /opt/Application
 * 2. Archives in fixtures/ and ~/Downloads
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

  // Collect registered paths
  if (fs.existsSync(ROOT_PATH)) {
    for (const cat of fs.readdirSync(ROOT_PATH)) {
      const catPath = path.join(ROOT_PATH, cat);
      try {
        if (!fs.statSync(catPath).isDirectory()) continue;
        for (const item of fs.readdirSync(catPath)) {
          const itemPath = path.join(catPath, item);
          try {
            if (fs.lstatSync(itemPath).isSymbolicLink()) {
              const resolved = fs.readlinkSync(itemPath);
              registeredPaths.add(resolved);
              // Also add resolved path from root for relative symlinks
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
  }

  // Scan /opt for external software not yet registered
  if (fs.existsSync('/opt')) {
    for (const item of fs.readdirSync('/opt')) {
      if (item === 'Application' || item === '.' || item === '..') continue;
      const fullPath = path.join('/opt', item);

      // Check if it's a directory or symlink to something worth managing
      try {
        const st = fs.lstatSync(fullPath);
        if (!st.isDirectory() && !st.isSymbolicLink()) continue;
      } catch (e) { continue; }

      let isLinked = false;
      for (const reg of registeredPaths) {
        if (reg === fullPath || reg.startsWith(fullPath + '/')) {
          isLinked = true;
          break;
        }
      }

      if (!isLinked) {
        let owner = 'vendor package (/opt)';
        try {
          const dpkgOut = execSync(`dpkg -S "${fullPath}" 2>/dev/null`, { encoding: 'utf-8', timeout: 2000 });
          owner = dpkgOut.split(':')[0].trim();
        } catch (e) {}

        // Suggest a category based on the app name
        const nameLower = item.toLowerCase();
        let suggestedCategory = 'tools';
        if (nameLower.includes('office') || nameLower.includes('libreoffice') || nameLower.includes('document')) {
          suggestedCategory = 'office';
        } else if (nameLower.includes('chrome') || nameLower.includes('firefox') || nameLower.includes('browser')) {
          suggestedCategory = 'browsers';
        } else if (nameLower.includes('code') || nameLower.includes('idea') || nameLower.includes('editor') || nameLower.includes('studio')) {
          suggestedCategory = 'ide';
        } else if (nameLower.includes('java') || nameLower.includes('node') || nameLower.includes('python')) {
          suggestedCategory = 'runtimes';
        } else if (nameLower.includes('mysql') || nameLower.includes('postgres') || nameLower.includes('mongo') || nameLower.includes('redis')) {
          suggestedCategory = 'databases';
        } else if (nameLower.includes('vpn') || nameLower.includes('proxy') || nameLower.includes('network')) {
          suggestedCategory = 'network';
        } else if (nameLower.includes('sdk') || nameLower.includes('flutter') || nameLower.includes('dart') || nameLower.includes('go')) {
          suggestedCategory = 'sdk';
        }

        unorganized.push({
          id: item,
          name: item.charAt(0).toUpperCase() + item.slice(1).replace(/[-_]/g, ' '),
          path: fullPath,
          detectedOwner: owner,
          suggestedCategory,
          mode: 'linked',
        });
      }
    }
  }

  // Scan project fixtures/ for test synthetic archives
  const fixturesDir = path.join(PROJECT_ROOT, 'fixtures');
  if (fs.existsSync(fixturesDir)) {
    try {
      for (const f of fs.readdirSync(fixturesDir)) {
        if (f.endsWith('.tar.gz') || f.endsWith('.tgz') || f.endsWith('.zip') || f.endsWith('.AppImage')) {
          const baseName = f.replace(/(\.tar\.gz|\.tgz|\.zip|\.AppImage)$/i, '');
          unorganized.push({
            id: baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            name: baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/[-_]/g, ' '),
            path: path.join(fixturesDir, f),
            detectedOwner: 'synthetic test fixture',
            suggestedCategory: baseName.toLowerCase().includes('electron') || baseName.toLowerCase().includes('ide') ? 'ide' : 'sdk',
            mode: 'managed',
          });
        }
      }
    } catch (e) {}
  }

  // Scan user Downloads for standalone AppImages or archives
  const downloadsDir = path.join(process.env.HOME || '/home/besu', 'Downloads');
  if (fs.existsSync(downloadsDir)) {
    try {
      for (const f of fs.readdirSync(downloadsDir)) {
        if (f.endsWith('.AppImage') || f.endsWith('.tar.gz') || f.endsWith('.zip')) {
          const baseName = f.replace(/(\.AppImage|\.tar\.gz|\.zip)$/i, '')
            .replace(/[-_]linux.*/i, '')
            .replace(/[-_]x86_64.*/i, '')
            .replace(/[-_]amd64.*/i, '');
          unorganized.push({
            id: baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            name: baseName.charAt(0).toUpperCase() + baseName.slice(1),
            path: path.join(downloadsDir, f),
            detectedOwner: 'standalone download',
            suggestedCategory: 'tools',
            mode: 'managed',
          });
        }
      }
    } catch (e) {}
  }

  return unorganized;
}

/**
 * Dynamically discovers ALL running systemd services related to managed applications,
 * plus database/development services. Not hardcoded to mysql/postgres.
 */
export function scanRealServices() {
  // Step 1: Discover services associated with managed apps in /opt/Application
  const appServices: Array<{
    id: string; name: string; unit: string;
    port: number; category: string;
  }> = [];

  // Well-known service mappings by app name pattern
  const wellKnownMap: Record<string, { unit: string; port: number; name: string }> = {
    'mysql': { unit: 'mysql.service', port: 3306, name: 'MySQL Community Server' },
    'postgresql': { unit: 'postgresql.service', port: 5432, name: 'PostgreSQL Database' },
    'postgresql-bin': { unit: 'postgresql.service', port: 5432, name: 'PostgreSQL Database' },
    'postgres': { unit: 'postgresql.service', port: 5432, name: 'PostgreSQL Database' },
    'redis': { unit: 'redis-server.service', port: 6379, name: 'Redis Server' },
    'mongodb': { unit: 'mongod.service', port: 27017, name: 'MongoDB Database' },
    'nginx': { unit: 'nginx.service', port: 80, name: 'Nginx Web Server' },
    'apache2': { unit: 'apache2.service', port: 80, name: 'Apache HTTP Server' },
    'docker': { unit: 'docker.service', port: 2375, name: 'Docker Daemon' },
    'containerd': { unit: 'containerd.service', port: 0, name: 'Containerd' },
  };

  const seenUnits = new Set<string>();

  // Step 2: Match installed apps to known services
  if (fs.existsSync(ROOT_PATH)) {
    for (const cat of fs.readdirSync(ROOT_PATH)) {
      const catPath = path.join(ROOT_PATH, cat);
      try {
        if (!fs.statSync(catPath).isDirectory()) continue;
        for (const item of fs.readdirSync(catPath)) {
          if (item.startsWith('.')) continue;
          const nameLower = item.toLowerCase();
          for (const [key, mapping] of Object.entries(wellKnownMap)) {
            if (nameLower === key || nameLower.startsWith(key) || nameLower.includes(key)) {
              if (!seenUnits.has(mapping.unit)) {
                seenUnits.add(mapping.unit);
                appServices.push({ id: item, name: mapping.name, unit: mapping.unit, port: mapping.port, category: cat });
              }
              break;
            }
          }
        }
      } catch (e) {}
    }
  }

  // Step 3: Also scan well-known services on the system (even if not in /opt/Application)
  for (const [, mapping] of Object.entries(wellKnownMap)) {
    if (!seenUnits.has(mapping.unit)) {
      // Check if the service unit exists on the system
      try {
        execSync(`systemctl list-unit-files ${mapping.unit} 2>/dev/null | grep -q ${mapping.unit}`, { timeout: 1000 });
        seenUnits.add(mapping.unit);
        const id = mapping.unit.replace('.service', '');
        appServices.push({ id, name: mapping.name, unit: mapping.unit, port: mapping.port, category: 'databases' });
      } catch (e) {}
    }
  }

  // Step 4: Query real status and memory for each
  const results: Array<{
    id: string; name: string; unit: string; status: string;
    port: number; memoryMb: number; memoryFormatted: string;
    autostart: boolean; category: string; description: string;
  }> = [];

  for (const svc of appServices) {
    let status = 'inactive';
    let memoryMb = 0;
    let memoryFormatted = '0 MB';
    let description = '';
    let autostart = false;

    try {
      const statusOut = execSync(`systemctl is-active ${svc.unit} 2>/dev/null`, { encoding: 'utf-8', timeout: 2000 }).trim();
      if (statusOut === 'active' || statusOut === 'activating') status = 'active';
    } catch (e) {
      status = 'inactive';
    }

    if (status === 'active') {
      // Get real memory usage from systemctl
      try {
        const memOut = execSync(`systemctl show ${svc.unit} --property=MemoryCurrent 2>/dev/null`, { encoding: 'utf-8', timeout: 2000 });
        const memMatch = memOut.match(/MemoryCurrent=(\d+)/);
        if (memMatch) {
          const bytes = parseInt(memMatch[1]);
          if (bytes > 0) {
            memoryMb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
            memoryFormatted = memoryMb > 1024
              ? `${(memoryMb / 1024).toFixed(1)} GB`
              : `${memoryMb} MB`;
          }
        }
      } catch (e) {}

      // Get description
      try {
        const descOut = execSync(`systemctl show ${svc.unit} --property=Description 2>/dev/null`, { encoding: 'utf-8', timeout: 1000 });
        const descMatch = descOut.match(/Description=(.+)/);
        if (descMatch) description = descMatch[1].trim();
      } catch (e) {}
    }

    // Check autostart/enable state
    try {
      const enableOut = execSync(`systemctl is-enabled ${svc.unit} 2>/dev/null`, { encoding: 'utf-8', timeout: 1000 }).trim();
      autostart = enableOut === 'enabled';
    } catch (e) {}

    results.push({
      id: svc.id,
      name: svc.name,
      unit: svc.unit,
      status,
      port: svc.port,
      memoryMb,
      memoryFormatted,
      autostart,
      category: svc.category,
      description,
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
  const binPaths = ['/usr/local/bin', path.join(process.env.HOME || '/home/besu', '.local/bin')];
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
    path.join(process.env.HOME || '/home/besu', '.local/share/applications'),
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
  const localBin = path.join(process.env.HOME || '/home/besu', '.local/bin');
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
      desktopDest: path.join(process.env.HOME || '/home/besu', '.local/share/applications', `appdepot-${appName}.desktop`),
      binDest: path.join(process.env.HOME || '/home/besu', '.local/bin', appName),
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
  const desktopDest = path.join(process.env.HOME || '/home/besu', '.local/share/applications', `appdepot-${appName}.desktop`);
  const binDest = path.join(process.env.HOME || '/home/besu', '.local/bin', appName);

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
  const userApps = path.join(process.env.HOME || '/home/besu', '.local/share/applications');
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
  const userBin = path.join(process.env.HOME || '/home/besu', '.local/bin');
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
    const envD = path.join(process.env.HOME || '/home/besu', '.config/appdepot/env.d');
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
  const targetLink = linkPath || appPath || path.join(ROOT_PATH, category, appId);

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
  const userApps = path.join(process.env.HOME || '/home/besu', '.local/share/applications');
  const desktopFiles = [
    path.join(userApps, `appdepot-${appId}.desktop`),
    path.join(userApps, `${appId}.desktop`),
    path.join('/usr/share/applications', `appdepot-${appId}.desktop`),
  ];
  desktopFiles.forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  });
  try { execSync(`update-desktop-database "${userApps}" 2>/dev/null || true`); } catch (e) {}

  // Remove binary symlinks
  const binFiles = [
    path.join(process.env.HOME || '/home/besu', '.local/bin', appId),
    path.join('/usr/local/bin', appId),
  ];
  binFiles.forEach(p => {
    try {
      if ((fs.existsSync(p) || (() => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } })()) && fs.lstatSync(p).isSymbolicLink()) {
        fs.unlinkSync(p);
      }
    } catch (e) {}
  });

  return { success: true, removedApp: appId };
}

/**
 * Adopts an unorganized directory into /opt/Application via symlink.
 */
export function performRealAdopt(sourcePath: string, category: string, appId: string) {
  const catDir = path.join(ROOT_PATH, category);
  fs.mkdirSync(catDir, { recursive: true });

  const targetLink = path.join(catDir, appId);
  try {
    if (fs.existsSync(targetLink) || fs.lstatSync(targetLink).isSymbolicLink()) {
      fs.unlinkSync(targetLink);
    }
  } catch (e) {}

  fs.symlinkSync(sourcePath, targetLink);
  return { success: true, linkPath: targetLink, target: sourcePath };
}

/**
 * Applies a Doctor fix command on the host system.
 */
export function applyDoctorFix(fixCmd: string): { success: boolean; output: string } {
  try {
    const out = execSync(fixCmd, { encoding: 'utf-8', timeout: 10000 });
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
 * Opens a folder in the host file manager.
 */
export function openFolder(folderPath: string) {
  try {
    execSync(`xdg-open "${folderPath}" 2>/dev/null || true`);
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

