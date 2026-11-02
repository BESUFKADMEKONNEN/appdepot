import { useState, useEffect, useRef } from 'react';
import './App.css';
import {
  Package,
  Terminal as TermIcon,
  Search,
  Plus,
  ShieldCheck,
  Folder,
  Layers,
  Server,
  Stethoscope,
  Code2,
  Box,
  Globe,
  Database,
  Cpu,
  Wifi,
  FileText,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Play,
  ChevronRight,
  Info,
  X,
  ArrowRight,
  Power,
  RotateCw,
  Trash2,
  Copy,
  ExternalLink,
  HardDrive,
  FolderPlus,
  Zap,
  Activity,
  Music,
  Gamepad2,
  FolderOpen,
  ArrowUp,
  FileArchive,
  FileCode,
  Monitor,
  Check,
} from 'lucide-react';

// ─── Type Definitions ────────────────────────────────────────────────────────

interface FsItem {
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

interface BrowseResult {
  currentPath: string;
  parentPath: string;
  exists: boolean;
  canWrite: boolean;
  breadcrumbs: Array<{ name: string; path: string }>;
  items: FsItem[];
  quickBookmarks: Array<{ name: string; path: string }>;
  error?: string;
}

interface AppItem {
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

interface UnorganizedItem {
  id: string;
  name: string;
  path: string;
  detectedOwner: string;
  suggestedCategory: string;
  mode: 'managed' | 'linked' | 'adopted';
}
interface SystemPackage {
  id: string;
  name: string;
  version: string;
  section: string;
  sizeKb: number;
  sizeFormatted: string;
  summary: string;
  type: 'deb' | 'snap';
}

interface ServiceItem {
  id: string;
  name: string;
  unit: string;
  status: string;
  port: number;
  memoryMb: number;
  memoryFormatted: string;
  autostart: boolean;
  category: string;
  description: string;
}

interface ProcessItem {
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

interface StackItem {
  id: string;
  name: string;
  description: string;
  members: Array<{ appId: string; name: string; path: string; status: string }>;
  status: 'complete' | 'partial' | 'missing';
}

interface DoctorCheck {
  code: string;
  title: string;
  detail: string;
  passed: boolean;
  fixable?: boolean;
  fixCmd?: string;
}

interface CategoryInfo {
  id: string;
  path: string;
  exists: boolean;
  appCount: number;
}

// ─── Category icon mapping ────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, any> = {
  ide: Code2,
  sdk: Box,
  browsers: Globe,
  databases: Database,
  runtimes: Cpu,
  network: Wifi,
  office: FileText,
  tools: Wrench,
  games: Gamepad2,
  media: Music,
  'npm-global': Package,
  default: Folder,
};

const CATEGORY_LABELS: Record<string, string> = {
  ide: 'IDEs & Editors',
  sdk: 'SDKs & Toolchains',
  browsers: 'Web Browsers',
  databases: 'Databases',
  runtimes: 'Runtimes',
  network: 'Network & VPN',
  office: 'Office & Docs',
  tools: 'System Tools',
  games: 'Games',
  media: 'Media & Audio',
  'npm-global': 'npm Globals',
};

function getCategoryIcon(catId: string) {
  return CATEGORY_ICONS[catId] || CATEGORY_ICONS.default;
}

function getCategoryLabel(catId: string) {
  return CATEGORY_LABELS[catId] || (catId.charAt(0).toUpperCase() + catId.slice(1).replace(/-/g, ' '));
}

// ─── App Component ───────────────────────────────────────────────────────────

export function App() {
  // Core data state — ALL from live backend, zero hardcoding
  const [apps, setApps] = useState<AppItem[]>([]);
  const [unorganized, setUnorganized] = useState<UnorganizedItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheck[]>([]);
  const [stacks, setStacks] = useState<StackItem[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [packages, setPackages] = useState<SystemPackage[]>([]);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [changeCount, setChangeCount] = useState(0);

  // UI navigation state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<SystemPackage | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'packages' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // System packages management state
  const [pkgSearch, setPkgSearch] = useState<string>('');
  const [pkgTypeFilter, setPkgTypeFilter] = useState<'all' | 'deb' | 'snap'>('all');
  const [pkgPage, setPkgPage] = useState<number>(1);
  const PKGS_PER_PAGE = 35;

  // Live services & processes management state
  const [servicesScope, setServicesScope] = useState<'all' | 'apps' | 'systemd' | 'raw'>('all');
  const [serviceStatusFilter, setServiceStatusFilter] = useState<'all' | 'active' | 'inactive' | 'failed'>('all');
  const [serviceSearch, setServiceSearch] = useState<string>('');

  // Create category modal
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [createCatError, setCreateCatError] = useState<string | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);

  // Doctor fix state
  const [fixingCheck, setFixingCheck] = useState<string | null>(null);

  // Stack manifest export modal
  const [manifestModal, setManifestModal] = useState<{ open: boolean; stackName: string; toml: string } | null>(null);
  const [modeFilter, setModeFilter] = useState<'all' | 'running' | 'closed' | 'managed' | 'desktop' | 'cli'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Terminal command history
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const termHistoryIdxRef = useRef<number>(-1);

  // Global Ctrl+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dynamic Browser Tab Title
  useEffect(() => {
    const runningCount = apps.filter(a => !!a.isRunning).length;
    const tabLabels: Record<string, string> = {
      library: runningCount > 0 ? `AppDepot (${runningCount} Running)` : 'AppDepot · Library',
      packages: 'AppDepot · System Packages',
      services: 'AppDepot · Services & Processes',
      stacks: 'AppDepot · Technology Stacks',
      unorganized: 'AppDepot · Unorganized Packages',
      doctor: 'AppDepot · Health Doctor',
    };
    document.title = tabLabels[activeTab] || 'AppDepot · Universal Linux Application & System Management';
  }, [activeTab, apps]);

  // File Picker & Folder Explorer Modal State
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState<'file' | 'folder' | 'any'>('any');
  const [pickerTitle, setPickerTitle] = useState('Select Package or Folder');
  const [pickerInitialPath, setPickerInitialPath] = useState('');
  const [pickerCallback, setPickerCallback] = useState<((path: string) => void) | null>(null);

  const openFilePicker = (
    title: string,
    type: 'file' | 'folder' | 'any',
    initialPath: string,
    callback: (selectedPath: string) => void
  ) => {
    setPickerTitle(title);
    setPickerType(type);
    setPickerInitialPath(initialPath || '/opt/Application');
    setPickerCallback(() => callback);
    setIsPickerOpen(true);
  };

  const triggerNativeDialog = async (type: 'file' | 'folder', startDir: string, onSelected: (p: string) => void) => {
    try {
      showToast('Opening native file chooser…', 'info');
      const res = await fetch('/api/fs/native-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, startDir }),
      });
      const data = await res.json();
      if (data.success && data.path) {
        onSelected(data.path);
        showToast(`Selected: ${data.path}`);
      } else if (!data.cancelled) {
        showToast(data.error || 'Native dialog unavailable.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSourcePath, setWizardSourcePath] = useState('');
  const [wizardCategory, setWizardCategory] = useState('tools');
  const [wizardAppName, setWizardAppName] = useState('');
  const [wizardAnalyzing, setWizardAnalyzing] = useState(false);
  const [wizardAnalysis, setWizardAnalysis] = useState<any>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardInstalling, setWizardInstalling] = useState(false);
  const [wizardInstallResult, setWizardInstallResult] = useState<any>(null);

  const handleSourcePathChange = (val: string) => {
    setWizardSourcePath(val);
    const cleanVal = val.split('?')[0].split('#')[0];
    const base = cleanVal.split('/').pop()?.replace(/(\.tar\.gz|\.tgz|\.tar\.xz|\.txz|\.tar\.bz2|\.tbz2|\.tar\.zst|\.zip|\.deb|\.AppImage)$/i, '') || '';
    if (base) setWizardAppName(base.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
  };

  // Terminal
  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info' | 'error'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Desktop — Live Kernel & Inotify Active' },
    { type: 'output', text: 'Watching: /opt/Application  /usr/local/bin  ~/.local/share/applications' },
    { type: 'output', text: 'Type any shell command. "depot list" shows all managed apps.' },
  ]);
  const [termInput, setTermInput] = useState('');
  const termBodyRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const refreshLiveProcesses = async () => {
    try {
      const [appsRes, procsRes] = await Promise.all([
        fetch('/api/apps').then(r => r.json()).catch(() => null),
        fetch('/api/processes').then(r => r.json()).catch(() => null),
      ]);
      if (Array.isArray(appsRes)) {
        setApps(appsRes);
        setSelectedApp(prev => {
          if (!prev) return null;
          return appsRes.find((a: AppItem) => a.id === prev.id) || prev;
        });
      }
      if (Array.isArray(procsRes)) {
        setProcesses(procsRes);
      }
      setLastSyncTime(new Date());
    } catch (e) {
      console.warn('[AppDepot] Live process refresh error:', e);
    }
  };

  const fetchAllData = async (silent = true) => {
    if (!silent) setIsSyncing(true);
    try {
      // Progressive non-blocking fetch: fast endpoints render immediately
      const pApps = fetch('/api/apps').then(r => r.json()).then(data => {
        if (Array.isArray(data)) {
          setApps(data);
          setSelectedApp(prev => prev ? (data.find((a: AppItem) => a.id === prev.id) || prev) : null);
        }
      }).catch(() => {});

      const pProcs = fetch('/api/processes').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setProcesses(data);
      }).catch(() => {});

      const pUnorg = fetch('/api/unorganized').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setUnorganized(data);
      }).catch(() => {});

      const pSrv = fetch('/api/services').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setServices(data);
      }).catch(() => {});

      const pDoc = fetch('/api/doctor').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setDoctorChecks(data);
      }).catch(() => {});

      const pStacks = fetch('/api/stacks').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setStacks(data);
      }).catch(() => {});

      const pCats = fetch('/api/categories').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setCategories(data);
      }).catch(() => {});

      const pPkgs = fetch('/api/packages').then(r => r.json()).then(data => {
        if (Array.isArray(data) && data.length > 0) setPackages(data);
      }).catch(() => {});

      await Promise.all([pApps, pProcs, pUnorg, pSrv, pDoc, pStacks, pCats, pPkgs]);
      setLastSyncTime(new Date());
    } catch (e) {
      console.error('[AppDepot] Fetch error:', e);
    } finally {
      setLoading(false);
      if (!silent) setTimeout(() => setIsSyncing(false), 400);
    }
  };

  // ── Live SSE + polling ────────────────────────────────────────────────────

  useEffect(() => {
    fetchAllData(false);

    // SSE real-time watcher
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.addEventListener('connected', () => setSseConnected(true));
      es.addEventListener('fs_change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          setChangeCount(c => c + 1);
          // If this was a process signal or service event, do a fast process refresh without showing generic toast
          if (payload.eventType === 'process_kill' || payload.eventType === 'service_state') {
            refreshLiveProcesses();
            return;
          }
          const label = payload.filename || payload.root || 'filesystem';
          showToast(`↻ Detected change in ${label}`, 'info');
        } catch {}
        fetchAllData(true);
      });
      es.onerror = () => setSseConnected(false);
    } catch (e) {
      console.warn('[AppDepot] SSE unavailable, using polling only');
    }

    // High-frequency live process sync (2 seconds) — lightweight (<30ms)
    const liveProcessPoll = setInterval(refreshLiveProcesses, 2000);

    // Periodic full system sync (15 seconds)
    const fullSystemPoll = setInterval(() => fetchAllData(true), 15000);

    // Window focus sync
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        refreshLiveProcesses();
      }
    };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      if (es) es.close();
      clearInterval(liveProcessPoll);
      clearInterval(fullSystemPoll);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (termBodyRef.current) {
      termBodyRef.current.scrollTop = termBodyRef.current.scrollHeight;
    }
  }, [termLines]);

  // ── UI helpers ────────────────────────────────────────────────────────────

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Installed app categories that actually exist on disk
  const existingCategories = categories.filter(c => c.exists);

  const filteredApps = apps.filter(app => {
    const q = searchQuery.trim().toLowerCase();
    
    const matchesCat = selectedCategory === 'all' || app.category === selectedCategory;

    const matchesMode =
      modeFilter === 'all' ||
      (modeFilter === 'running' && !!app.isRunning) ||
      (modeFilter === 'closed' && !app.isRunning) ||
      (modeFilter === 'managed' && (app.mode === 'managed' || app.mode === 'linked')) ||
      (modeFilter === 'desktop' && !app.isCli) ||
      (modeFilter === 'cli' && !!app.isCli);

    const matchesSearch = !q ||
      app.name.toLowerCase().includes(q) ||
      app.command.toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q) ||
      (app.description && app.description.toLowerCase().includes(q)) ||
      (app.path && app.path.toLowerCase().includes(q));

    return matchesCat && matchesMode && matchesSearch;
  });

  const doctorPassed = doctorChecks.filter(c => c.passed).length;
  const healthScore = doctorChecks.length > 0 ? Math.round((doctorPassed / doctorChecks.length) * 100) : 100;

  // ── Terminal ──────────────────────────────────────────────────────────────

  const runTerminalCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Update command history (keep last 50, no duplicates at head)
    setTermHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 50);
    });
    termHistoryIdxRef.current = -1;

    const lines = [...termLines, { type: 'cmd' as const, text: trimmed }];

    if (trimmed === 'clear') { setTermLines([]); setTermInput(''); return; }

    try {
      const res = await fetch('/api/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmed.startsWith('depot') ? `./bin/${trimmed}` : trimmed,
        }),
      });
      const data = await res.json();
      if (data.output) {
        data.output.split('\n').filter(Boolean).forEach((line: string) => {
          lines.push({
            type: line.includes('[✓]') || line.toLowerCase().includes('success') ? 'success'
              : line.includes('[!]') || line.toLowerCase().includes('error') ? 'error'
              : 'output',
            text: line,
          });
        });
      }
      if (data.success === false && !data.output) {
        lines.push({ type: 'error', text: data.error || 'Command failed.' });
      }
    } catch (e) {
      lines.push({ type: 'error', text: 'Network error reaching shell API.' });
    }

    setTermLines(lines);
    setTermInput('');
    fetchAllData(true);
  };

  // ── App actions ───────────────────────────────────────────────────────────

  const handleLaunchApp = async (app: AppItem) => {
    if (app.isCli) {
      showToast(`Running ${app.name} in docked terminal…`, 'info');
      runTerminalCommand(`${app.command} --version`);
      return;
    }

    // Instant optimistic UI update (0ms delay)
    setApps(prev => prev.map(a => a.id === app.id ? { ...a, isRunning: true } : a));
    setSelectedApp(prev => prev?.id === app.id ? { ...prev, isRunning: true } : prev);
    showToast(`Launching ${app.name}…`, 'info');

    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: app.execPath || app.command }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ ${app.name} launched (PID: ${data.pid})`);
        if (data.pid) {
          setApps(prev => prev.map(a => a.id === app.id ? { ...a, isRunning: true, pid: data.pid } : a));
          setSelectedApp(prev => prev?.id === app.id ? { ...prev, isRunning: true, pid: data.pid } : prev);
        }
      } else {
        runTerminalCommand(`${app.execPath || app.command} &`);
      }
    } catch {
      runTerminalCommand(`${app.command} &`);
    }

    // Rapid follow-up verification syncs as Linux starts the process
    setTimeout(refreshLiveProcesses, 300);
    setTimeout(refreshLiveProcesses, 1000);
    setTimeout(refreshLiveProcesses, 2500);
  };

  const handleKillApp = async (app: AppItem, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') => {
    const label = signal === 'SIGKILL' ? 'Force Kill (SIGKILL -9)' : 'Stop (SIGTERM)';
    showToast(`${label}: ${app.name}…`, 'info');

    // Instant optimistic UI update: immediately flip badge to stopped and remove from running (0ms delay)
    setApps(prev => prev.map(a => (a.id === app.id || (app.pid && a.pid === app.pid))
      ? { ...a, isRunning: false, pid: undefined }
      : a
    ));
    if (app.pid) {
      setProcesses(prev => prev.filter(p => p.pid !== app.pid));
    }
    setSelectedApp(prev => {
      if (!prev) return null;
      if (prev.id === app.id || (app.pid && prev.pid === app.pid)) {
        return { ...prev, isRunning: false, pid: undefined };
      }
      return prev;
    });

    try {
      const res = await fetch('/api/apps/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: app.pid, command: app.command, signal }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ ${app.name} terminated (${signal})`);
      } else {
        const sigNum = signal === 'SIGKILL' ? '-9' : '-15';
        runTerminalCommand(`pkill ${sigNum} -f "${app.command}" 2>/dev/null || kill ${sigNum} ${app.pid || ''} 2>/dev/null`);
      }
    } catch {
      const sigNum = signal === 'SIGKILL' ? '-9' : '-15';
      runTerminalCommand(`pkill ${sigNum} -f "${app.command}" 2>/dev/null`);
    }

    // Rapid verification syncs as Linux kernel flushes the PID
    setTimeout(refreshLiveProcesses, 250);
    setTimeout(refreshLiveProcesses, 800);
    setTimeout(refreshLiveProcesses, 2000);
  };

  const handleKillProcess = async (pid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM') => {
    showToast(`Sending ${signal} to PID ${pid}…`, 'info');

    // Instant optimistic removal from UI (0ms delay)
    setProcesses(prev => prev.filter(p => p.pid !== pid));
    setApps(prev => prev.map(a => a.pid === pid ? { ...a, isRunning: false, pid: undefined } : a));
    setSelectedApp(prev => prev?.pid === pid ? { ...prev, isRunning: false, pid: undefined } : prev);

    try {
      const res = await fetch('/api/processes/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, signal }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Signal ${signal} sent to PID ${pid}`);
      } else {
        const sigNum = signal === 'SIGKILL' ? '-9' : '-15';
        runTerminalCommand(`kill ${sigNum} ${pid}`);
      }
    } catch {
      runTerminalCommand(`kill -15 ${pid}`);
    }

    // Rapid follow-up verification syncs
    setTimeout(refreshLiveProcesses, 250);
    setTimeout(refreshLiveProcesses, 800);
  };

  const handleOpenFolder = async (folderPath: string) => {
    await fetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath }),
    }).catch(() => runTerminalCommand(`xdg-open "${folderPath}" &`));
  };

  const adoptApp = async (item: UnorganizedItem) => {
    showToast(`Adopting ${item.name} → /opt/Application/${item.suggestedCategory}/`, 'info');
    try {
      const res = await fetch('/api/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: item.path, category: item.suggestedCategory, appId: item.id }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Linked ${item.name} into ${item.suggestedCategory}!`); fetchAllData(false); }
      else showToast(data.error || 'Adopt failed.', 'error');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleExportStack = async (stackId: string, stackName: string) => {
    try {
      const res = await fetch(`/api/stacks/export?id=${encodeURIComponent(stackId)}`);
      const data = await res.json();
      if (data.toml) {
        setManifestModal({ open: true, stackName, toml: data.toml });
      } else {
        showToast(data.error || 'Failed to export stack manifest', 'error');
      }
    } catch (e: any) {
      showToast(`Export error: ${e.message}`, 'error');
    }
  };

  const deleteApp = async (app: AppItem) => {
    if (!window.confirm(`Are you sure you want to remove ${app.name}? This will purge its files, remove ~/.local/share/applications/appdepot-${app.id}.desktop, and delete ~/.local/bin/${app.id}.`)) {
      return;
    }
    setSelectedApp(null);
    showToast(`Removing ${app.name}…`, 'info');
    try {
      const res = await fetch('/api/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id, category: app.category, mode: app.mode, appPath: app.path, linkPath: app.linkPath }),
      });
      const data = await res.json();
      if (data.success) { showToast(`Removed ${app.name} from system.`); fetchAllData(false); }
      else showToast(data.error || 'Removal failed.', 'error');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleServiceControl = async (srv: ServiceItem, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') => {
    showToast(`systemctl ${action} ${srv.unit}…`, 'info');

    // Instant optimistic UI update
    if (action === 'start' || action === 'restart') {
      setServices(prev => prev.map(s => s.unit === srv.unit ? { ...s, activeState: 'active', subState: 'running' } : s));
    } else if (action === 'stop') {
      setServices(prev => prev.map(s => s.unit === srv.unit ? { ...s, activeState: 'inactive', subState: 'dead' } : s));
    }

    const refreshServicesOnly = async () => {
      try {
        const s = await fetch('/api/services').then(r => r.json());
        if (Array.isArray(s)) setServices(s);
      } catch {}
    };

    try {
      const res = await fetch('/api/services/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: srv.unit, action }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ ${srv.unit} ${action}ed successfully`);
      } else {
        showToast(data.output || data.error || 'Permission required — sending to terminal', 'error');
        runTerminalCommand(`pkexec systemctl ${action} ${srv.unit}`);
      }
    } catch {
      runTerminalCommand(`pkexec systemctl ${action} ${srv.unit}`);
    }

    // Verification syncs
    setTimeout(refreshServicesOnly, 300);
    setTimeout(refreshServicesOnly, 1200);
  };

  const applyDoctorFix = async (check: DoctorCheck) => {
    if (!check.fixCmd) return;
    setFixingCheck(check.code);
    try {
      const res = await fetch('/api/doctor/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixCmd: check.fixCmd }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✓ Fix applied for ${check.code}`);
        termLines.push({ type: 'cmd', text: check.fixCmd });
        termLines.push({ type: 'success', text: data.output || 'OK' });
        setTermLines([...termLines]);
      } else {
        showToast(`Fix requires sudo — copy command below`, 'error');
        runTerminalCommand(check.fixCmd);
      }
      fetchAllData(false);
    } catch {
      showToast('Fix command failed — see terminal.', 'error');
    } finally {
      setFixingCheck(null);
    }
  };

  const handleCreateCategory = async () => {
    const name = newCatName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (name.length < 2) { setCreateCatError('Name must be at least 2 characters.'); return; }
    setCreatingCat(true);
    setCreateCatError(null);
    try {
      const res = await fetch('/api/categories/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Category '${name}' created at ${data.path}`);
        setShowCreateCat(false);
        setNewCatName('');
        fetchAllData(false);
      } else {
        setCreateCatError(data.error || 'Creation failed.');
      }
    } catch (e: any) {
      setCreateCatError(e.message);
    } finally {
      setCreatingCat(false);
    }
  };

  // ── Wizard ────────────────────────────────────────────────────────────────

  const handleAnalyzeSource = async () => {
    setWizardAnalyzing(true);
    setWizardError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceArchive: wizardSourcePath, appName: wizardAppName, category: wizardCategory }),
      });
      const data = await res.json();
      if (!data.valid) { setWizardError(data.error || 'Inspection failed.'); return; }
      setWizardAnalysis(data);
      setWizardStep(2);
    } catch (e: any) {
      setWizardError(e.message);
    } finally {
      setWizardAnalyzing(false);
    }
  };

  const handleExecuteInstall = async () => {
    setWizardInstalling(true);
    setWizardError(null);
    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceArchive: wizardSourcePath, category: wizardCategory, appName: wizardAppName }),
      });
      const data = await res.json();
      if (!data.success) { setWizardError(data.error || 'Install failed.'); return; }
      setWizardInstallResult(data);
      setWizardStep(4);
      fetchAllData(false);
      showToast(`Installed ${wizardAppName} → /opt/Application/${wizardCategory}/`);
    } catch (e: any) {
      setWizardError(e.message);
    } finally {
      setWizardInstalling(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">

      {/* ── Modern Floating Toast Notification ───────────────────────── */}
      {toastMessage && (
        <div className="toast-container">
          <div className={`toast toast-${toastMessage.type}`}>
            <div className="toast-icon">
              {toastMessage.type === 'success' && <CheckCircle2 size={16} />}
              {toastMessage.type === 'error' && <AlertTriangle size={16} />}
              {toastMessage.type === 'info' && <Info size={16} />}
            </div>
            <span className="toast-text">{toastMessage.text}</span>
            <button className="toast-close" onClick={() => setToastMessage(null)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="header">
        <div className="brand-section">
          <div className="logo-badge"><Package size={17} /></div>
          <span className="brand-title">AppDepot</span>
          <span className="brand-subtitle">Linux Desktop</span>
        </div>

        <div className="search-box">
          <Search size={14} color="#9aa3b2" />
          <input
            ref={searchRef}
            type="text"
            placeholder={
              activeTab === 'library'
                ? `Search ${apps.length} applications, commands, paths… (Ctrl+K)`
                : activeTab === 'packages'
                ? `Search ${packages.length} system packages, sections… (Ctrl+K)`
                : activeTab === 'services'
                ? `Search ${services.length} live & closed services… (Ctrl+K)`
                : `Search system components… (Ctrl+K)`
            }
            value={searchQuery}
            onChange={e => {
              const val = e.target.value;
              setSearchQuery(val);
              if (activeTab === 'packages') { setPkgSearch(val); setPkgPage(1); }
              if (activeTab === 'services') setServiceSearch(val);
            }}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setPkgSearch('');
                setServiceSearch('');
                setPkgPage(1);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', padding: '2px', alignItems: 'center' }}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
          <span className="shortcut-chip">Ctrl+K</span>
        </div>

        <div className="header-actions">
          {/* Live watcher indicator */}
          <div
            className="live-sync-indicator"
            title={`SSE ${sseConnected ? 'connected' : 'reconnecting'} · ${changeCount} changes detected`}
          >
            <span className={`live-dot ${sseConnected ? 'pulse' : ''}`} />
            <span className="live-text">{sseConnected ? 'Live' : 'Polling'}</span>
            {changeCount > 0 && <span className="change-badge">{changeCount}</span>}
          </div>

          <button
            className="sm-btn"
            title={`Last sync: ${lastSyncTime?.toLocaleTimeString() || 'never'}`}
            onClick={() => fetchAllData(false)}
          >
            <RotateCw size={12} className={isSyncing ? 'spin-slow' : ''} />
            <span>Sync</span>
          </button>

          <div className="health-pill" style={{
            background: healthScore === 100 ? 'rgba(61,214,140,0.15)' : 'rgba(245,181,74,0.15)',
            color: healthScore === 100 ? '#3dd68c' : '#f5b54a',
            borderColor: healthScore === 100 ? 'rgba(61,214,140,0.3)' : 'rgba(245,181,74,0.3)',
          }}>
            <ShieldCheck size={14} />
            <span>Health {healthScore}%</span>
          </div>

          <button className="primary-btn" onClick={() => {
            setIsWizardOpen(true);
            setWizardStep(1);
            setWizardError(null);
            setWizardAnalysis(null);
            setWizardInstallResult(null);
          }}>
            <Plus size={15} />
            <span>Install Package</span>
          </button>
        </div>
      </header>

      {/* ── Workspace ──────────────────────────────────────────────────── */}
      <div className="workspace">

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="sidebar">
          {/* Navigation */}
          <div>
            <div className="nav-section-title">Navigation</div>
            {[
              { id: 'library', label: 'Library', icon: Folder, count: apps.length },
              { id: 'packages', label: 'System Packages', icon: Box, count: packages.length },
              { id: 'services', label: 'Services & Processes', icon: Server, count: services.filter(s => s.status === 'active').length + apps.filter(a => !!a.isRunning).length },
              { id: 'unorganized', label: 'Unorganized', icon: AlertTriangle, count: unorganized.length, warn: unorganized.length > 0 },
              { id: 'stacks', label: 'Stacks', icon: Layers, count: stacks.length },
              { id: 'doctor', label: 'Doctor', icon: Stethoscope, count: doctorChecks.length - doctorPassed, warn: healthScore < 100 },
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id as any)}
                >
                  <div className="nav-item-left">
                    <Icon size={15} />
                    <span>{item.label}</span>
                  </div>
                  <span className="nav-count" style={item.warn ? { color: 'var(--warning)' } : {}}>
                    {item.id === 'doctor' ? (healthScore === 100 ? '✓' : item.count) : item.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live categories from disk */}
          <div>
            <div className="nav-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Categories</span>
              <button
                title="Create new category in /opt/Application"
                onClick={() => setShowCreateCat(true)}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '2px', display: 'flex' }}
              >
                <FolderPlus size={13} />
              </button>
            </div>

            {/* All Applications */}
            <button
              className={`nav-item ${selectedCategory === 'all' && activeTab === 'library' ? 'active' : ''}`}
              onClick={() => { setSelectedCategory('all'); setActiveTab('library'); }}
            >
              <div className="nav-item-left"><Layers size={14} /><span>All Applications</span></div>
              <span className="nav-count">{apps.length}</span>
            </button>

            {/* Real categories from disk */}
            {existingCategories.map(cat => {
              const Icon = getCategoryIcon(cat.id);
              const count = apps.filter(a => a.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  className={`nav-item ${selectedCategory === cat.id && activeTab === 'library' ? 'active' : ''}`}
                  onClick={() => { setSelectedCategory(cat.id); setActiveTab('library'); }}
                >
                  <div className="nav-item-left">
                    <Icon size={14} />
                    <span>{getCategoryLabel(cat.id)}</span>
                  </div>
                  <span className="nav-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* System info footer */}
          <div className="sidebar-footer">
            <div style={{ fontSize: '10px', color: '#4b5563', lineHeight: 1.6 }}>
              <div>Root: /opt/Application</div>
              <div>{apps.length} packages · {existingCategories.length} categories</div>
              {lastSyncTime && <div>Synced: {lastSyncTime.toLocaleTimeString()}</div>}
            </div>
          </div>
        </aside>

        {/* ── Main Content ────────────────────────────────────────────── */}
        <main className="center-content">

          {loading && (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
              <RotateCw size={32} className="spin-slow" style={{ margin: '0 auto 12px' }} />
              <div>Scanning live filesystem…</div>
            </div>
          )}

          {/* ── Library ─────────────────────────────────────────────── */}
          {!loading && activeTab === 'library' && (
            <>
              <div className="view-header">
                <div className="view-title-wrap">
                  <h1 className="view-title">
                    {selectedCategory === 'all' ? 'All Applications' : getCategoryLabel(selectedCategory)}
                  </h1>
                  <span className="view-subtitle">
                    {filteredApps.length} application{filteredApps.length !== 1 ? 's' : ''} on system · {apps.filter(a => !!a.isRunning).length} currently running, {apps.filter(a => a.mode === 'managed' || a.mode === 'linked').length} managed, {apps.filter(a => !a.isCli).length} desktop GUI
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'all' ? '#1e293b' : 'transparent',
                        color: modeFilter === 'all' ? '#f8fafc' : 'var(--text-muted)',
                        border: modeFilter === 'all' ? '1px solid #3b82f6' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: modeFilter === 'all' ? 600 : 400,
                      }}
                      onClick={() => setModeFilter('all')}
                    >
                      All ({apps.length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'running' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                        color: modeFilter === 'running' ? '#34d399' : 'var(--text-muted)',
                        border: modeFilter === 'running' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      onClick={() => {
                        setModeFilter('running');
                        setSelectedCategory('all');
                      }}
                    >
                      <span className="live-dot pulse" style={{ width: '6px', height: '6px', background: '#34d399' }} />
                      Running ({apps.filter(a => !!a.isRunning).length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'closed' ? '#1e293b' : 'transparent',
                        color: modeFilter === 'closed' ? '#f8fafc' : 'var(--text-muted)',
                        border: modeFilter === 'closed' ? '1px solid #3b82f6' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: modeFilter === 'closed' ? 600 : 400,
                      }}
                      onClick={() => setModeFilter('closed')}
                    >
                      Closed ({apps.filter(a => !a.isRunning).length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'managed' ? '#1e293b' : 'transparent',
                        color: modeFilter === 'managed' ? '#f8fafc' : 'var(--text-muted)',
                        border: modeFilter === 'managed' ? '1px solid #3b82f6' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: modeFilter === 'managed' ? 600 : 400,
                      }}
                      onClick={() => setModeFilter('managed')}
                    >
                      Managed ({apps.filter(a => a.mode === 'managed' || a.mode === 'linked').length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'desktop' ? '#1e293b' : 'transparent',
                        color: modeFilter === 'desktop' ? '#f8fafc' : 'var(--text-muted)',
                        border: modeFilter === 'desktop' ? '1px solid #3b82f6' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: modeFilter === 'desktop' ? 600 : 400,
                      }}
                      onClick={() => setModeFilter('desktop')}
                    >
                      Desktop GUI ({apps.filter(a => !a.isCli).length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 9px',
                        fontSize: '11px',
                        background: modeFilter === 'cli' ? '#1e293b' : 'transparent',
                        color: modeFilter === 'cli' ? '#f8fafc' : 'var(--text-muted)',
                        border: modeFilter === 'cli' ? '1px solid #3b82f6' : '1px solid transparent',
                        borderRadius: '4px',
                        fontWeight: modeFilter === 'cli' ? 600 : 400,
                      }}
                      onClick={() => setModeFilter('cli')}
                    >
                      CLI Tools ({apps.filter(a => !!a.isCli).length})
                    </button>
                  </div>
                  <div className="action-btn-group">
                    <button className="sm-btn" onClick={() => fetchAllData(false)}>
                      <RotateCw size={12} />
                      <span>Refresh</span>
                    </button>
                    <button className="sm-btn" onClick={() => handleOpenFolder('/opt/Application')}>
                      <Folder size={12} />
                      <span>Open Root</span>
                    </button>
                  </div>
                </div>
              </div>

              {filteredApps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
                  <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3 style={{ color: '#e6e8ec', marginBottom: '8px' }}>
                    {searchQuery ? `No apps matching "${searchQuery}"` : 'No apps installed yet'}
                  </h3>
                  <p style={{ fontSize: '12px', marginBottom: '16px' }}>
                    {searchQuery
                      ? 'Clear the search or try a different term.'
                      : `Drop a folder or archive into /opt/Application/${selectedCategory === 'all' ? '<category>' : selectedCategory}/ and it appears here instantly.`}
                  </p>
                  {!searchQuery && (
                    <button className="primary-btn" onClick={() => { setIsWizardOpen(true); setWizardStep(1); }}>
                      <Plus size={14} /><span>Install First Package</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="app-grid">
                  {filteredApps.map(app => {
                    const Icon = getCategoryIcon(app.category);
                    return (
                      <div
                        key={app.id}
                        className={`app-card ${app.status === 'broken' ? 'app-broken' : ''}`}
                        onClick={() => setSelectedApp(app)}
                      >
                        <div className="card-top">
                          <div className="app-icon-mask">
                            {app.isCli ? <TermIcon size={18} /> : <Icon size={18} />}
                          </div>
                          <div className="card-meta">
                            {app.isRunning && (
                              <span className="mode-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 600 }}>
                                ● Running
                              </span>
                            )}
                            {app.isCli ? (
                              <span className="mode-badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                                CLI
                              </span>
                            ) : (
                              <span className={`mode-badge ${app.mode}`}>{app.mode}</span>
                            )}
                            {app.hasSandboxFix && (
                              <span className="mode-badge" style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-border)' }}>
                                sandbox ✓
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="card-name">{app.name}</div>
                        <div className="card-cmd">{app.command}</div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <span className="version-tag">{app.version}</span>
                          <span className="version-tag" style={{ background: 'rgba(56, 189, 248, 0.08)', color: 'var(--accent)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            {app.sizeFormatted || '…'}
                          </span>
                        </div>

                        <div className="card-footer">
                          <div className="status-indicator">
                            <div className="status-dot" style={{
                              background: app.isRunning ? '#34d399' : (app.status === 'healthy' ? 'var(--success)' : app.status === 'warning' ? 'var(--warning)' : 'var(--danger)')
                            }} />
                            <span style={app.isRunning ? { color: '#34d399', fontWeight: 600 } : {}}>
                              {app.isRunning
                                ? `PID ${app.pid || '?'} · ${app.processRss || 'Running'}`
                                : 'Closed / Idle'}
                            </span>
                          </div>
                          <div className="action-btn-group">
                            {app.isRunning ? (
                              <>
                                <button
                                  className="sm-btn"
                                  title={`Graceful Stop — SIGTERM (PID: ${app.pid})`}
                                  style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239,68,68,0.07)' }}
                                  onClick={e => { e.stopPropagation(); handleKillApp(app, 'SIGTERM'); }}
                                >
                                  <Power size={11} />
                                </button>
                                <button
                                  className="sm-btn"
                                  title={`Force Kill — SIGKILL -9 (PID: ${app.pid})`}
                                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', fontSize: '9.5px', fontWeight: 700, padding: '3px 5px' }}
                                  onClick={e => { e.stopPropagation(); handleKillApp(app, 'SIGKILL'); }}
                                >
                                  -9
                                </button>
                              </>
                            ) : (
                              <button className="sm-btn" title="Launch" onClick={e => { e.stopPropagation(); handleLaunchApp(app); }}>
                                <Play size={11} />
                              </button>
                            )}
                            <button className="sm-btn" title="Open folder" onClick={e => { e.stopPropagation(); handleOpenFolder(app.path); }}>
                              <Folder size={11} />
                            </button>
                            <button className="sm-btn" title="Details" onClick={e => { e.stopPropagation(); setSelectedApp(app); }}>
                              <Info size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Unorganized ──────────────────────────────────────────── */}
          {!loading && activeTab === 'unorganized' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Unorganized Packages</h1>
                  <span className="view-subtitle">
                    Real packages on /opt and ~/Downloads not yet linked into /opt/Application
                  </span>
                </div>
              </div>

              {unorganized.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
                  <CheckCircle2 size={48} color="#3dd68c" style={{ margin: '0 auto 16px' }} />
                  <h3>All Packages Are Organized</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>
                    Every detected package on /opt is linked into /opt/Application.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {unorganized.filter(item => {
                    const q = searchQuery.trim().toLowerCase();
                    return !q || item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q) || item.detectedOwner.toLowerCase().includes(q);
                  }).map(item => (
                    <div key={item.id} className="unorganized-row">
                      <div className="unorganized-left">
                        <div className="app-icon-mask" style={{ width: '38px', height: '38px', fontSize: '15px' }}>
                          {item.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{item.name}</div>
                          <div style={{ fontSize: '11px', color: '#9aa3b2' }}>
                            Owner: {item.detectedOwner}
                            <span className="mono" style={{ marginLeft: '6px' }}>{item.path}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <select
                          className="wizard-input"
                          defaultValue={item.suggestedCategory}
                          style={{ minWidth: '120px', padding: '4px 8px', fontSize: '11px' }}
                          onChange={e => { item.suggestedCategory = e.target.value; }}
                        >
                          {existingCategories.map(c => (
                            <option key={c.id} value={c.id}>{getCategoryLabel(c.id)}</option>
                          ))}
                        </select>
                        <button className="primary-btn" onClick={() => adoptApp(item)}>
                          <span>Adopt</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Stacks ───────────────────────────────────────────────── */}
          {!loading && activeTab === 'stacks' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Developer Tool Stacks</h1>
                  <span className="view-subtitle">
                    Dynamically detected from your actual /opt/Application installs — no hardcoding
                  </span>
                </div>
                <button className="sm-btn" onClick={() => fetchAllData(false)}>
                  <RotateCw size={12} /><span>Refresh</span>
                </button>
              </div>

              {stacks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
                  <Layers size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3>No Stacks Detected Yet</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>
                    Install apps like Flutter, MySQL, Node, or any IDE —
                    stacks auto-form based on what's in /opt/Application.
                  </p>
                </div>
              ) : (
                <div className="stacks-grid">
                  {stacks.filter(stack => {
                    const q = searchQuery.trim().toLowerCase();
                    return !q || stack.name.toLowerCase().includes(q) || stack.description.toLowerCase().includes(q) || stack.members.some(m => m.name.toLowerCase().includes(q));
                  }).map(stack => (
                    <div key={stack.id} className="stack-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 700, fontSize: '15px' }}>{stack.name}</div>
                        <span className="health-pill" style={{
                          color: stack.status === 'complete' ? '#3dd68c' : '#f5b54a',
                          background: stack.status === 'complete' ? 'rgba(61,214,140,0.15)' : 'rgba(245,181,74,0.15)',
                          borderColor: stack.status === 'complete' ? 'rgba(61,214,140,0.3)' : 'rgba(245,181,74,0.3)',
                        }}>
                          {stack.status === 'complete' ? 'Complete' : 'Partial'}
                        </span>
                      </div>

                      <p style={{ fontSize: '12px', color: '#9aa3b2', marginBottom: '10px' }}>
                        {stack.description}
                      </p>

                      <div className="stack-chips-wrap">
                        {stack.members.map(m => (
                          <span key={m.appId} className="stack-chip" style={{
                            borderColor: m.status === 'healthy' ? 'rgba(61,214,140,0.3)' : 'rgba(245,181,74,0.3)',
                          }}>
                            {m.status === 'healthy' ? '✓' : '⚠'} {m.name}
                            <span style={{ opacity: 0.5, fontSize: '10px', marginLeft: '4px' }}>
                              {m.path.replace('/opt/Application/', '')}
                            </span>
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                        {stack.members[0] && (
                          <button
                            className="primary-btn"
                            style={{ flex: 1 }}
                            onClick={() => runTerminalCommand(`ls "${stack.members[0].path}"`)}
                          >
                            <Activity size={12} />
                            Inspect
                          </button>
                        )}
                        <button
                          className="sm-btn"
                          onClick={() => handleExportStack(stack.id, stack.name)}
                          title="Export AppDepot Stack Manifest (.toml)"
                        >
                          <FileText size={12} />
                          Export
                        </button>
                        <button
                          className="sm-btn"
                          onClick={() => handleOpenFolder(stack.members[0]?.path || '/opt/Application')}
                          title="Open Directory"
                        >
                          <Folder size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── System Packages Management ──────────────────────────── */}
          {!loading && activeTab === 'packages' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">System Package Database</h1>
                  <span className="view-subtitle">
                    {packages.length} software packages installed on host · {packages.filter(p => p.type === 'deb').length} APT/DEB, {packages.filter(p => p.type === 'snap').length} Snaps · Zero hardcoded lists
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="sm-btn" onClick={() => fetchAllData(false)}>
                    <RotateCw size={12} /><span>Refresh Packages</span>
                  </button>
                </div>
              </div>

              {/* Package Toolbar: Filters + Search */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: pkgTypeFilter === 'all' ? 'var(--accent-gradient)' : 'transparent',
                      color: pkgTypeFilter === 'all' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                    }}
                    onClick={() => { setPkgTypeFilter('all'); setPkgPage(1); }}
                  >
                    All Packages ({packages.length})
                  </button>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: pkgTypeFilter === 'deb' ? 'var(--accent-gradient)' : 'transparent',
                      color: pkgTypeFilter === 'deb' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                    }}
                    onClick={() => { setPkgTypeFilter('deb'); setPkgPage(1); }}
                  >
                    APT / Debian ({packages.filter(p => p.type === 'deb').length})
                  </button>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: pkgTypeFilter === 'snap' ? 'var(--accent-gradient)' : 'transparent',
                      color: pkgTypeFilter === 'snap' ? '#fff' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '4px',
                    }}
                    onClick={() => { setPkgTypeFilter('snap'); setPkgPage(1); }}
                  >
                    Snaps ({packages.filter(p => p.type === 'snap').length})
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(10, 12, 18, 0.7)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', flex: 1, minWidth: '220px' }}>
                  <Search size={14} color="var(--text-dim)" />
                  <input
                    type="text"
                    value={searchQuery || pkgSearch}
                    placeholder="Search package name, section, or description…"
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', width: '100%', fontSize: '12px' }}
                    onChange={e => {
                      const val = e.target.value;
                      setPkgSearch(val);
                      setSearchQuery(val);
                      setPkgPage(1);
                    }}
                  />
                  {(searchQuery || pkgSearch) && (
                    <button onClick={() => { setPkgSearch(''); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Packages Table */}
              {packages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
                  <Box size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3>Loading System Package Registry…</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>Querying dpkg-query and snap list from local machine.</p>
                </div>
              ) : (
                (() => {
                  const effectivePkgQuery = (searchQuery || pkgSearch).trim().toLowerCase();
                  const filtered = packages.filter(pkg => {
                    const matchesType = pkgTypeFilter === 'all' || pkg.type === pkgTypeFilter;
                    const q = effectivePkgQuery;
                    const matchesSearch = !q ||
                      pkg.name.toLowerCase().includes(q) ||
                      pkg.section.toLowerCase().includes(q) ||
                      (pkg.summary && pkg.summary.toLowerCase().includes(q));
                    return matchesType && matchesSearch;
                  });
                  const totalPages = Math.max(1, Math.ceil(filtered.length / PKGS_PER_PAGE));
                  const currentPage = Math.min(Math.max(1, pkgPage), totalPages);
                  const paged = filtered.slice((currentPage - 1) * PKGS_PER_PAGE, currentPage * PKGS_PER_PAGE);

                  return (
                    <div className="pkg-table-wrap">
                      <table className="pkg-table">
                        <thead>
                          <tr>
                            <th style={{ width: '22%' }}>Package</th>
                            <th style={{ width: '10%' }}>Type</th>
                            <th style={{ width: '15%' }}>Version</th>
                            <th style={{ width: '13%' }}>Section</th>
                            <th style={{ width: '10%' }}>Size</th>
                            <th style={{ width: '20%' }}>Summary</th>
                            <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                                No system packages matched "{pkgSearch}".
                              </td>
                            </tr>
                          ) : (
                            paged.map(pkg => (
                              <tr key={pkg.id} onClick={() => setSelectedPackage(pkg)}>
                                <td>
                                  <div className="pkg-name">
                                    <Box size={13} color="var(--accent)" />
                                    <span>{pkg.name}</span>
                                  </div>
                                </td>
                                <td>
                                  <span className={pkg.type === 'deb' ? 'pkg-badge-deb' : 'pkg-badge-snap'}>
                                    {pkg.type}
                                  </span>
                                </td>
                                <td className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {pkg.version.length > 22 ? `${pkg.version.slice(0, 22)}…` : pkg.version}
                                </td>
                                <td>
                                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{pkg.section}</span>
                                </td>
                                <td className="mono" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                                  {pkg.sizeFormatted}
                                </td>
                                <td>
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {pkg.summary || '—'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="sm-btn"
                                      title="Inspect Installed Files (dpkg -L)"
                                      style={{ padding: '3px 6px', fontSize: '10.5px' }}
                                      onClick={() => runTerminalCommand(pkg.type === 'deb' ? `dpkg -L ${pkg.name} | head -n 40` : `snap info ${pkg.name}`)}
                                    >
                                      <FileText size={11} />
                                    </button>
                                    <button
                                      className="sm-btn"
                                      title="Detailed Status (dpkg -s)"
                                      style={{ padding: '3px 6px', fontSize: '10.5px' }}
                                      onClick={() => runTerminalCommand(pkg.type === 'deb' ? `dpkg -s ${pkg.name}` : `snap info ${pkg.name}`)}
                                    >
                                      <Info size={11} />
                                    </button>
                                    <button
                                      className="sm-btn"
                                      title="Remove Package from System"
                                      style={{ padding: '3px 6px', fontSize: '10.5px', color: '#f87171' }}
                                      onClick={() => {
                                        if (confirm(`Remove package "${pkg.name}" from your Linux system?`)) {
                                          runTerminalCommand(pkg.type === 'deb' ? `pkexec apt remove -y ${pkg.name}` : `pkexec snap remove ${pkg.name}`);
                                        }
                                      }}
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>

                      {/* Pagination Bar */}
                      <div className="pkg-pagination">
                        <span>
                          Showing {Math.min(filtered.length, (currentPage - 1) * PKGS_PER_PAGE + 1)} - {Math.min(filtered.length, currentPage * PKGS_PER_PAGE)} of {filtered.length} packages
                        </span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="sm-btn"
                            disabled={currentPage <= 1}
                            onClick={() => setPkgPage(p => Math.max(1, p - 1))}
                            style={{ padding: '3px 9px', opacity: currentPage <= 1 ? 0.4 : 1 }}
                          >
                            Previous
                          </button>
                          <span className="mono" style={{ fontSize: '11px' }}>
                            Page {currentPage} of {totalPages}
                          </span>
                          <button
                            className="sm-btn"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPkgPage(p => Math.min(totalPages, p + 1))}
                            style={{ padding: '3px 9px', opacity: currentPage >= totalPages ? 0.4 : 1 }}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ── Services & Processes ─────────────────────────────────── */}
          {!loading && activeTab === 'services' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Services & Running Processes</h1>
                  <span className="view-subtitle">
                    {apps.filter(a => !!a.isRunning).length} live desktop applications · {services.filter(s => s.status === 'active').length} active system daemons ({services.length} total) · Real-time host telemetry
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="sm-btn" onClick={() => fetchAllData(false)}>
                    <RotateCw size={12} /><span>Refresh All</span>
                  </button>
                  <button className="sm-btn" onClick={() => runTerminalCommand('ps aux --sort=-%mem | head -n 25')}>
                    <TermIcon size={12} /><span>Process Snapshot</span>
                  </button>
                </div>
              </div>

              {/* View Scope Tabs */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: servicesScope === 'all' ? '#1e293b' : 'transparent',
                      color: servicesScope === 'all' ? '#f8fafc' : 'var(--text-muted)',
                      border: servicesScope === 'all' ? '1px solid #3b82f6' : '1px solid transparent',
                      borderRadius: '4px',
                      fontWeight: servicesScope === 'all' ? 600 : 400,
                    }}
                    onClick={() => setServicesScope('all')}
                  >
                    All Active ({apps.filter(a => !!a.isRunning).length + services.filter(s => s.status === 'active').length})
                  </button>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: servicesScope === 'apps' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                      color: servicesScope === 'apps' ? '#34d399' : 'var(--text-muted)',
                      border: servicesScope === 'apps' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
                      borderRadius: '4px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                    onClick={() => setServicesScope('apps')}
                  >
                    <span className="live-dot pulse" style={{ width: '6px', height: '6px', background: '#34d399' }} />
                    Running Applications ({apps.filter(a => !!a.isRunning).length})
                  </button>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: servicesScope === 'systemd' ? '#1e293b' : 'transparent',
                      color: servicesScope === 'systemd' ? '#f8fafc' : 'var(--text-muted)',
                      border: servicesScope === 'systemd' ? '1px solid #3b82f6' : '1px solid transparent',
                      borderRadius: '4px',
                      fontWeight: servicesScope === 'systemd' ? 600 : 400,
                    }}
                    onClick={() => setServicesScope('systemd')}
                  >
                    System Daemons ({services.length})
                  </button>
                  <button
                    className="sm-btn"
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      background: servicesScope === 'raw' ? '#1e293b' : 'transparent',
                      color: servicesScope === 'raw' ? '#f8fafc' : 'var(--text-muted)',
                      border: servicesScope === 'raw' ? '1px solid #3b82f6' : '1px solid transparent',
                      borderRadius: '4px',
                      fontWeight: servicesScope === 'raw' ? 600 : 400,
                    }}
                    onClick={() => setServicesScope('raw')}
                  >
                    All Host Processes ({processes.length})
                  </button>
                </div>

                {/* Sub-status filter for daemons */}
                {servicesScope === 'systemd' && (
                  <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        background: serviceStatusFilter === 'all' ? '#1e293b' : 'transparent',
                        color: serviceStatusFilter === 'all' ? '#fff' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                      }}
                      onClick={() => setServiceStatusFilter('all')}
                    >
                      All
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        background: serviceStatusFilter === 'active' ? '#1e293b' : 'transparent',
                        color: serviceStatusFilter === 'active' ? '#34d399' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                      }}
                      onClick={() => setServiceStatusFilter('active')}
                    >
                      Running ({services.filter(s => s.status === 'active').length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        background: serviceStatusFilter === 'inactive' ? '#1e293b' : 'transparent',
                        color: serviceStatusFilter === 'inactive' ? '#fff' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                      }}
                      onClick={() => setServiceStatusFilter('inactive')}
                    >
                      Closed ({services.filter(s => s.status === 'inactive').length})
                    </button>
                    <button
                      className="sm-btn"
                      style={{
                        padding: '3px 8px',
                        fontSize: '10.5px',
                        background: serviceStatusFilter === 'failed' ? '#1e293b' : 'transparent',
                        color: serviceStatusFilter === 'failed' ? '#ef4444' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                      }}
                      onClick={() => setServiceStatusFilter('failed')}
                    >
                      Failed ({services.filter(s => s.status === 'failed').length})
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(10, 12, 18, 0.7)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px', flex: 1, minWidth: '220px' }}>
                  <Search size={14} color="var(--text-dim)" />
                  <input
                    type="text"
                    value={searchQuery || serviceSearch}
                    placeholder="Search process, VLC, unit, PID, or command…"
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', width: '100%', fontSize: '12px' }}
                    onChange={e => {
                      const val = e.target.value;
                      setServiceSearch(val);
                      setSearchQuery(val);
                    }}
                  />
                  {(searchQuery || serviceSearch) && (
                    <button onClick={() => { setServiceSearch(''); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const effectiveQuery = (searchQuery || serviceSearch).trim().toLowerCase();

                // 1. Matched running/installed applications
                const matchedApps = apps.filter(app => {
                  if (effectiveQuery) {
                    return (
                      app.name.toLowerCase().includes(effectiveQuery) ||
                      app.command.toLowerCase().includes(effectiveQuery) ||
                      app.id.toLowerCase().includes(effectiveQuery) ||
                      app.category.toLowerCase().includes(effectiveQuery) ||
                      (app.execPath && app.execPath.toLowerCase().includes(effectiveQuery))
                    );
                  }
                  return !!app.isRunning;
                });

                // 2. Matched systemd services
                const matchedServices = services.filter(srv => {
                  const matchesStatus =
                    serviceStatusFilter === 'all' ||
                    (serviceStatusFilter === 'active' && srv.status === 'active') ||
                    (serviceStatusFilter === 'inactive' && srv.status === 'inactive') ||
                    (serviceStatusFilter === 'failed' && srv.status === 'failed');
                  const matchesSearch = !effectiveQuery ||
                    srv.name.toLowerCase().includes(effectiveQuery) ||
                    srv.unit.toLowerCase().includes(effectiveQuery) ||
                    (srv.description && srv.description.toLowerCase().includes(effectiveQuery));
                  return matchesStatus && matchesSearch;
                });

                // 3. Matched host processes
                const matchedProcesses = processes.filter(p => {
                  if (!effectiveQuery) return true;
                  return (
                    p.name.toLowerCase().includes(effectiveQuery) ||
                    p.comm.toLowerCase().includes(effectiveQuery) ||
                    p.args.toLowerCase().includes(effectiveQuery) ||
                    String(p.pid).includes(effectiveQuery) ||
                    p.user.toLowerCase().includes(effectiveQuery)
                  );
                });

                const showAppsSection = servicesScope === 'all' || servicesScope === 'apps' || (effectiveQuery && matchedApps.length > 0);
                const showServicesSection = servicesScope === 'all' || servicesScope === 'systemd' || (effectiveQuery && matchedServices.length > 0);
                const showProcessesSection = servicesScope === 'raw' || (effectiveQuery && matchedProcesses.length > 0 && matchedApps.length === 0 && matchedServices.length === 0);

                const totalMatches = (showAppsSection ? matchedApps.length : 0) + (showServicesSection ? matchedServices.length : 0) + (showProcessesSection ? matchedProcesses.length : 0);

                if (totalMatches === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa3b2' }}>
                      <Server size={44} style={{ margin: '0 auto 14px', opacity: 0.3 }} />
                      <h3>No Services or Processes Matching Criteria</h3>
                      <p style={{ fontSize: '12px', marginTop: '6px' }}>Try adjusting your search query or clear the filter.</p>
                      {effectiveQuery && (
                        <button
                          className="sm-btn"
                          style={{ marginTop: '12px' }}
                          onClick={() => { setServiceSearch(''); setSearchQuery(''); }}
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* ── Section A: Live Application Processes ── */}
                    {showAppsSection && matchedApps.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <span className="live-dot pulse" style={{ width: '7px', height: '7px', background: '#34d399' }} />
                            <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>
                              Live Desktop & User Applications ({matchedApps.length})
                            </span>
                          </div>
                          {servicesScope !== 'apps' && (
                            <button
                              className="sm-btn"
                              style={{ fontSize: '10px', padding: '2px 7px' }}
                              onClick={() => setServicesScope('apps')}
                            >
                              Focus Applications
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {matchedApps.map(app => {
                            const Icon = getCategoryIcon(app.category);
                            return (
                              <div key={app.id} className="service-row" style={{ borderLeft: app.isRunning ? '3px solid #10b981' : '3px solid #64748b' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--accent)',
                                    flexShrink: 0,
                                  }}>
                                    <Icon size={18} />
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>{app.name}</span>
                                      <span className="status-dot" style={{
                                        background: app.isRunning ? '#34d399' : '#64748b',
                                        width: '7px',
                                        height: '7px',
                                        borderRadius: '50%',
                                        display: 'inline-block',
                                      }} />
                                      <span style={{
                                        fontSize: '11px',
                                        color: app.isRunning ? '#34d399' : '#94a3b8',
                                        fontWeight: 600,
                                      }}>
                                        {app.isRunning ? '● Running' : 'Closed / Idle'}
                                      </span>
                                      {app.pid && (
                                        <span className="mono" style={{ fontSize: '10.5px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                                          PID: {app.pid}
                                        </span>
                                      )}
                                      <span style={{ fontSize: '10.5px', color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                                        {getCategoryLabel(app.category)}
                                      </span>
                                    </div>
                                    <div className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {app.execPath || app.path || app.command}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                                  {app.isRunning && app.processRss && (
                                    <div style={{ fontSize: '11.5px', textAlign: 'right' }}>
                                      <div className="mono" style={{ fontWeight: 600, color: '#f8fafc' }}>{app.processRss}</div>
                                      <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Memory RSS</div>
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {app.isRunning ? (
                                      <>
                                        <button
                                          className="sm-btn"
                                          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)' }}
                                          title="Graceful Stop (SIGTERM)"
                                          onClick={() => handleKillApp(app, 'SIGTERM')}
                                        >
                                          <Power size={12} />
                                          <span>Stop</span>
                                        </button>
                                        <button
                                          className="sm-btn"
                                          style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                          title="Force Kill (SIGKILL)"
                                          onClick={() => handleKillApp(app, 'SIGKILL')}
                                        >
                                          <span>Kill -9</span>
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        className="primary-btn"
                                        style={{ padding: '4px 10px', fontSize: '11px' }}
                                        onClick={() => handleLaunchApp(app)}
                                      >
                                        <Play size={12} />
                                        <span>Launch</span>
                                      </button>
                                    )}
                                    <button
                                      className="sm-btn"
                                      title="Inspect in Library"
                                      onClick={() => {
                                        setSelectedApp(app);
                                        setActiveTab('library');
                                      }}
                                    >
                                      <Info size={12} />
                                    </button>
                                    <button
                                      className="sm-btn"
                                      title="Open Executable Folder"
                                      onClick={() => handleOpenFolder(app.path)}
                                    >
                                      <Folder size={12} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Section B: Systemd Daemons ── */}
                    {showServicesSection && matchedServices.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>
                            Systemd System Services ({matchedServices.length})
                          </span>
                          {servicesScope !== 'systemd' && (
                            <button
                              className="sm-btn"
                              style={{ fontSize: '10px', padding: '2px 7px' }}
                              onClick={() => setServicesScope('systemd')}
                            >
                              Focus System Daemons
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {matchedServices.map(srv => (
                            <div key={srv.id} className="service-row">
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>{srv.name}</span>
                                  <span className="status-dot" style={{
                                    background: srv.status === 'active' ? '#34d399' : (srv.status === 'failed' ? '#ef4444' : '#64748b'),
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    display: 'inline-block',
                                  }} />
                                  <span style={{
                                    fontSize: '11px',
                                    color: srv.status === 'active' ? '#34d399' : (srv.status === 'failed' ? '#ef4444' : '#94a3b8'),
                                    textTransform: 'capitalize',
                                    fontWeight: 600,
                                  }}>
                                    {srv.status === 'inactive' ? 'Stopped / Closed' : srv.status}
                                  </span>
                                  {srv.autostart && (
                                    <span className="mode-badge" style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.08)', color: 'var(--accent)', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                                      autostart
                                    </span>
                                  )}
                                </div>
                                <div className="service-unit mono" style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                  {srv.unit}
                                  {srv.port > 0 && ` · Port :${srv.port}`}
                                  {srv.description && ` · ${srv.description}`}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                {srv.status === 'active' && srv.memoryMb > 0 && (
                                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'right' }}>
                                    <div className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{srv.memoryFormatted || `${srv.memoryMb} MB`}</div>
                                    <div style={{ fontSize: '10px' }}>RSS Memory</div>
                                  </div>
                                )}

                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    className={srv.status === 'active' ? 'sm-btn' : 'primary-btn'}
                                    style={{ minWidth: '76px' }}
                                    onClick={() => handleServiceControl(srv, srv.status === 'active' ? 'stop' : 'start')}
                                  >
                                    <Power size={12} />
                                    <span>{srv.status === 'active' ? 'Stop' : 'Start'}</span>
                                  </button>
                                  <button
                                    className="sm-btn"
                                    title="Restart Service"
                                    onClick={() => handleServiceControl(srv, 'restart')}
                                  >
                                    <RotateCw size={12} />
                                  </button>
                                  <button
                                    className="sm-btn"
                                    title="Toggle Autostart (Enable/Disable)"
                                    style={{ color: srv.autostart ? '#3dd68c' : 'var(--text-dim)' }}
                                    onClick={() => handleServiceControl(srv, srv.autostart ? 'disable' : 'enable')}
                                  >
                                    <Zap size={12} />
                                  </button>
                                  <button
                                    className="sm-btn"
                                    title="View service journalctl logs"
                                    onClick={() => runTerminalCommand(`journalctl -u ${srv.unit} --no-pager -n 40`)}
                                  >
                                    <FileText size={12} />
                                  </button>
                                  <button
                                    className="sm-btn"
                                    title="Service status details"
                                    onClick={() => runTerminalCommand(`systemctl status ${srv.unit} --no-pager`)}
                                  >
                                    <Info size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Section C: All Host Processes Table (htop style) ── */}
                    {showProcessesSection && (
                      <div className="pkg-table-wrap">
                        <table className="pkg-table">
                          <thead>
                            <tr>
                              <th style={{ width: '8%' }}>PID</th>
                              <th style={{ width: '10%' }}>User</th>
                              <th style={{ width: '8%' }}>%CPU</th>
                              <th style={{ width: '10%' }}>Memory</th>
                              <th style={{ width: '7%' }}>State</th>
                              <th style={{ width: '22%' }}>Process Name</th>
                              <th style={{ width: '25%' }}>Command</th>
                              <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matchedProcesses.slice(0, 100).map(proc => (
                              <tr key={proc.pid}>
                                <td className="mono" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                  {proc.pid}
                                </td>
                                <td className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {proc.user}
                                </td>
                                <td className="mono" style={{ fontSize: '11px', color: proc.cpu > 10 ? '#ef4444' : (proc.cpu > 2 ? '#f59e0b' : 'var(--text-muted)') }}>
                                  {proc.cpu.toFixed(1)}%
                                </td>
                                <td className="mono" style={{ fontSize: '11px', fontWeight: 500 }}>
                                  {proc.rssFormatted}
                                </td>
                                <td>
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    background: proc.stat.startsWith('R') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                    color: proc.stat.startsWith('R') ? '#34d399' : 'var(--text-dim)',
                                  }}>
                                    {proc.stat}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 500, fontSize: '12px' }}>{proc.name}</div>
                                  {proc.isApp && (
                                    <span style={{ fontSize: '9.5px', color: 'var(--accent)', textTransform: 'capitalize' }}>
                                      {proc.category}
                                    </span>
                                  )}
                                </td>
                                <td className="mono" style={{ fontSize: '10.5px', color: 'var(--text-dim)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proc.args}>
                                  {proc.args || proc.comm}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                    <button
                                      className="sm-btn"
                                      style={{ padding: '2px 6px', fontSize: '10.5px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                      title="Send SIGTERM"
                                      onClick={() => handleKillProcess(proc.pid, 'SIGTERM')}
                                    >
                                      Stop
                                    </button>
                                    <button
                                      className="sm-btn"
                                      style={{ padding: '2px 6px', fontSize: '10.5px', color: '#f87171' }}
                                      title="Send SIGKILL"
                                      onClick={() => handleKillProcess(proc.pid, 'SIGKILL')}
                                    >
                                      Kill
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Doctor ───────────────────────────────────────────────── */}
          {!loading && activeTab === 'doctor' && (
            <div>
              <div className="doctor-hero">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <ShieldCheck size={24} color={healthScore === 100 ? '#3dd68c' : '#f5b54a'} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                      System Health: {healthScore}% — {doctorPassed}/{doctorChecks.length} checks passed
                    </h2>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '4px' }}>
                    Live POSIX audit: /opt/Application permissions, PATH symlinks, devtools group,
                    desktop entries, setuid sandbox — all scanned in real time.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="sm-btn" onClick={() => runTerminalCommand('id && groups')}>
                    <Info size={13} /><span>Show Groups</span>
                  </button>
                  <button className="primary-btn" onClick={() => fetchAllData(false)}>
                    <RotateCw size={14} /><span>Rescan</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {doctorChecks.filter(check => {
                  const q = searchQuery.trim().toLowerCase();
                  return !q || check.title.toLowerCase().includes(q) || check.detail.toLowerCase().includes(q) || check.code.toLowerCase().includes(q);
                }).map(check => (
                  <div key={check.code} className="doctor-check-row">
                    <div className="doctor-check-left">
                      {check.passed
                        ? <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px', flexShrink: 0 }} />
                        : <AlertTriangle size={16} color="#f5b54a" style={{ marginTop: '2px', flexShrink: 0 }} />
                      }
                      <div>
                        <div style={{ fontWeight: 600 }}>{check.title}</div>
                        <div style={{ fontSize: '11px', color: check.passed ? '#9aa3b2' : '#f5b54a', marginTop: '2px' }}>
                          {check.detail}
                        </div>
                        {!check.passed && check.fixCmd && (
                          <div className="fix-cmd-preview mono">$ {check.fixCmd}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      <span className="health-pill" style={{
                        color: check.passed ? '#3dd68c' : '#f5b54a',
                        background: check.passed ? 'rgba(61,214,140,0.12)' : 'rgba(245,181,74,0.12)',
                        borderColor: check.passed ? 'rgba(61,214,140,0.25)' : 'rgba(245,181,74,0.25)',
                      }}>
                        {check.passed ? 'Passed' : 'Action Needed'}
                      </span>

                      {!check.passed && check.fixCmd && (
                        <button
                          className="primary-btn"
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                          disabled={fixingCheck === check.code}
                          onClick={() => applyDoctorFix(check)}
                        >
                          {fixingCheck === check.code ? (
                            <><RotateCw size={11} className="spin-slow" /><span>Fixing…</span></>
                          ) : (
                            <><Zap size={11} /><span>Auto-Fix</span></>
                          )}
                        </button>
                      )}

                      {!check.passed && check.fixCmd && (
                        <button
                          className="sm-btn"
                          title="Copy fix command"
                          onClick={() => {
                            navigator.clipboard.writeText(check.fixCmd!);
                            showToast('Fix command copied to clipboard');
                          }}
                        >
                          <Copy size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* ── Terminal ─────────────────────────────────────────────────── */}
        <aside className="docked-terminal">
          <div className="terminal-header">
            <div className="terminal-tabs">
              <div className="terminal-tab active">
                <TermIcon size={12} /><span>depot shell</span>
              </div>
            </div>
            <div style={{ color: '#6b7280', fontSize: '11px' }}>
              {sseConnected ? '● SSE Live' : '○ Polling'}
            </div>
          </div>

          <div className="teach-mode-banner">
            <Info size={13} />
            <span><strong>Live Shell:</strong> Commands run on your real Linux environment.</span>
          </div>

          <div className="terminal-body" ref={termBodyRef}>
            {termLines.map((line, idx) => (
              <div key={idx} className={`terminal-line term-${line.type}`}>
                {line.type === 'cmd' ? (
                  <>
                    <span className="prompt">$ </span>
                    <span className="term-cmd">{line.text}</span>
                  </>
                ) : (
                  <span>{line.text}</span>
                )}
              </div>
            ))}

            <div className="terminal-input-row">
              <span className="prompt">$ </span>
              <input
                type="text"
                value={termInput}
                placeholder="depot list | depot doctor | ls /opt/Application"
                onChange={e => { setTermInput(e.target.value); termHistoryIdxRef.current = -1; }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    runTerminalCommand(termInput);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const next = Math.min(termHistoryIdxRef.current + 1, termHistory.length - 1);
                    termHistoryIdxRef.current = next;
                    if (termHistory[next] !== undefined) setTermInput(termHistory[next]);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.max(termHistoryIdxRef.current - 1, -1);
                    termHistoryIdxRef.current = next;
                    setTermInput(next === -1 ? '' : (termHistory[next] || ''));
                  }
                }}
              />
            </div>
          </div>

          <div className="terminal-quick-actions">
            <button className="quick-chip" onClick={() => runTerminalCommand('depot list')}>depot list</button>
            <button className="quick-chip" onClick={() => runTerminalCommand('depot doctor')}>depot doctor</button>
            <button className="quick-chip" onClick={() => runTerminalCommand('depot doctor --fix')}>doctor --fix</button>
            <button className="quick-chip" onClick={() => runTerminalCommand('depot env show')}>env show</button>
            <button className="quick-chip" onClick={() => runTerminalCommand('df -h /opt/Application')}>disk usage</button>
            <button className="quick-chip" onClick={() => runTerminalCommand('id && groups')}>id & groups</button>
            <button className="quick-chip" onClick={() => setTermLines([])}>clear</button>
          </div>
        </aside>
      </div>

      {/* ── App Detail Drawer ────────────────────────────────────────────── */}
      {selectedApp && (
        <div className="detail-drawer">
          <div className="drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="app-icon-mask" style={{ width: '36px', height: '36px', fontSize: '15px' }}>
                {selectedApp.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedApp.name}</div>
                <div style={{ fontSize: '11px', color: '#9aa3b2' }}>
                  {selectedApp.mode} · {selectedApp.category} · {selectedApp.version}
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedApp(null)} style={{ color: '#9aa3b2' }}>
              <X size={18} />
            </button>
          </div>

          <div className="drawer-body">
            <div>
              <div className="drawer-section-title">Ownership Mode</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {selectedApp.isCli ? (
                  <span className="mode-badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>CLI Tool</span>
                ) : (
                  <span className={`mode-badge ${selectedApp.mode}`}>{selectedApp.mode}</span>
                )}
                <span style={{ fontSize: '11.5px', color: '#9aa3b2' }}>
                  {selectedApp.isCli && (selectedApp.description || 'System developer toolchain binary in PATH.')}
                  {!selectedApp.isCli && selectedApp.mode === 'managed' && 'AppDepot owns files directly under /opt/Application.'}
                  {!selectedApp.isCli && selectedApp.mode === 'linked' && 'Physical files at original location, symlinked here.'}
                  {!selectedApp.isCli && selectedApp.mode === 'adopted' && 'System-level package tracked in AppDepot registry.'}
                  {!selectedApp.isCli && selectedApp.mode === 'system' && 'Standard system package managed via host OS.'}
                </span>
              </div>
            </div>

            {selectedApp.description && (
              <div>
                <div className="drawer-section-title">Description</div>
                <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: '1.4' }}>
                  {selectedApp.description}
                </div>
              </div>
            )}

            <div>
              <div className="drawer-section-title">Disk Usage</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <HardDrive size={14} color="#3daee9" />
                <span>Real storage: <strong>{selectedApp.sizeFormatted || 'Calculating…'}</strong></span>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Physical Target Path</div>
              <div className="path-preview mono" style={{ fontSize: '11.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ wordBreak: 'break-all' }}>{selectedApp.path}</span>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button title="Open in file manager" onClick={() => handleOpenFolder(selectedApp.path)}>
                    <ExternalLink size={12} color="#9aa3b2" />
                  </button>
                  <button title="Copy path" onClick={() => { navigator.clipboard.writeText(selectedApp.path); showToast('Path copied'); }}>
                    <Copy size={12} color="#9aa3b2" />
                  </button>
                </div>
              </div>
            </div>

            {selectedApp.linkPath && (
              <div>
                <div className="drawer-section-title">Symlink in /opt/Application</div>
                <div className="path-preview mono" style={{ fontSize: '11.5px' }}>{selectedApp.linkPath}</div>
              </div>
            )}

            <div>
              <div className="drawer-section-title">Live Artifacts Ledger</div>
              <table className="ledger-table">
                <thead>
                  <tr><th>Type</th><th>Path on Host</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>folder</code></td>
                    <td className="mono">{selectedApp.linkPath || selectedApp.path}</td>
                  </tr>
                  {selectedApp.execPath && (
                    <tr>
                      <td><code>executable</code></td>
                      <td className="mono">{selectedApp.execPath}</td>
                    </tr>
                  )}
                  <tr>
                    <td><code>command</code></td>
                    <td className="mono">/usr/local/bin/{selectedApp.command}</td>
                  </tr>
                  {selectedApp.desktopPath && (
                    <tr>
                      <td><code>desktop</code></td>
                      <td className="mono">{selectedApp.desktopPath}</td>
                    </tr>
                  )}
                  {selectedApp.hasSandboxFix && (
                    <tr>
                      <td><code>sandbox</code></td>
                      <td className="mono">{selectedApp.path}/chrome-sandbox (4755 root)</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Running process controls — shown for both CLI and GUI apps */}
              {selectedApp.isRunning && (
                <div style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 600, marginBottom: '2px' }}>
                    ● Process Active — PID {selectedApp.pid}{selectedApp.processRss ? ` · ${selectedApp.processRss} RSS` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="sm-btn"
                      style={{ flex: 1, justifyContent: 'center', color: '#f87171', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.1)' }}
                      onClick={() => handleKillApp(selectedApp, 'SIGTERM')}
                    >
                      <Power size={12} /><span>Graceful Stop (SIGTERM)</span>
                    </button>
                    <button
                      className="sm-btn"
                      style={{ flex: 1, justifyContent: 'center', color: '#ef4444', borderColor: 'rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.07)', fontWeight: 700 }}
                      title="Force kill immediately (SIGKILL -9)"
                      onClick={() => handleKillApp(selectedApp, 'SIGKILL')}
                    >
                      <Zap size={12} /><span>Force Kill (-9)</span>
                    </button>
                  </div>
                </div>
              )}

              {selectedApp.isCli ? (
                <>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="primary-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => runTerminalCommand(`${selectedApp.command} --version`)}>
                      <TermIcon size={14} /><span>Run in Terminal</span>
                    </button>
                    <button className="sm-btn" style={{ justifyContent: 'center', padding: '0 12px' }} title="View manual/help" onClick={() => runTerminalCommand(`man ${selectedApp.command} || ${selectedApp.command} --help`)}>
                      <FileText size={14} />
                    </button>
                    <button className="sm-btn" style={{ justifyContent: 'center', padding: '0 12px' }} title="Open binary directory" onClick={() => handleOpenFolder(selectedApp.path.split('/').slice(0, -1).join('/'))}>
                      <Folder size={14} />
                    </button>
                  </div>
                  <button
                    className="sm-btn"
                    style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => adoptApp({ id: selectedApp.id, name: selectedApp.name, path: selectedApp.path, detectedOwner: 'system', suggestedCategory: selectedApp.category, mode: 'linked' })}
                  >
                    <Layers size={13} /><span>Link / Track in /opt/Application/{selectedApp.category}</span>
                  </button>
                </>
              ) : (
                <>
                  {!selectedApp.isRunning && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="primary-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleLaunchApp(selectedApp)}>
                        <Play size={14} /><span>Launch App</span>
                      </button>
                      <button className="sm-btn" style={{ justifyContent: 'center', padding: '0 14px' }} onClick={() => handleOpenFolder(selectedApp.path)}>
                        <Folder size={14} />
                      </button>
                    </div>
                  )}
                  {selectedApp.isRunning && (
                    <button className="sm-btn" style={{ justifyContent: 'center', display: 'flex' }} onClick={() => handleOpenFolder(selectedApp.path)}>
                      <Folder size={13} /><span>Open App Folder</span>
                    </button>
                  )}
                  <button
                    className="sm-btn"
                    style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}
                    onClick={() => deleteApp(selectedApp)}
                  >
                    <Trash2 size={12} /><span>Remove From System</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Package Detail Drawer ────────────────────────────────────────── */}
      {selectedPackage && (
        <div className="detail-drawer">
          <div className="drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="app-icon-mask" style={{ width: '36px', height: '36px', fontSize: '15px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent)' }}>
                <Box size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedPackage.name}</div>
                <div style={{ fontSize: '11px', color: '#9aa3b2' }}>
                  {selectedPackage.type.toUpperCase()} · {selectedPackage.section} · v{selectedPackage.version}
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedPackage(null)} style={{ color: '#9aa3b2', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          <div className="drawer-body">
            <div>
              <div className="drawer-section-title">Package Type</div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className={selectedPackage.type === 'deb' ? 'pkg-badge-deb' : 'pkg-badge-snap'}>
                  {selectedPackage.type.toUpperCase()} PACKAGE
                </span>
                <span style={{ fontSize: '11.5px', color: '#9aa3b2' }}>
                  {selectedPackage.type === 'deb' ? 'Standard Debian/Ubuntu binary package managed via dpkg/apt' : 'Sandboxed Canonical Snap application package'}
                </span>
              </div>
            </div>

            {selectedPackage.summary && (
              <div>
                <div className="drawer-section-title">Summary</div>
                <div style={{ fontSize: '12.5px', color: '#e2e8f0', lineHeight: '1.4' }}>
                  {selectedPackage.summary}
                </div>
              </div>
            )}

            <div>
              <div className="drawer-section-title">Installed Disk Size</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <HardDrive size={14} color="#3daee9" />
                <span>Installed footprint: <strong>{selectedPackage.sizeFormatted}</strong> ({selectedPackage.sizeKb} KB)</span>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Package Metadata</div>
              <table className="ledger-table">
                <thead>
                  <tr><th>Property</th><th>Value</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>package</code></td>
                    <td className="mono">{selectedPackage.name}</td>
                  </tr>
                  <tr>
                    <td><code>version</code></td>
                    <td className="mono">{selectedPackage.version}</td>
                  </tr>
                  <tr>
                    <td><code>section</code></td>
                    <td className="mono">{selectedPackage.section}</td>
                  </tr>
                  <tr>
                    <td><code>format</code></td>
                    <td className="mono">{selectedPackage.type}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="primary-btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => runTerminalCommand(selectedPackage.type === 'deb' ? `dpkg -L ${selectedPackage.name}` : `snap info ${selectedPackage.name}`)}
                >
                  <FileText size={14} /><span>List Files</span>
                </button>
                <button
                  className="sm-btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => runTerminalCommand(selectedPackage.type === 'deb' ? `dpkg -s ${selectedPackage.name}` : `snap info ${selectedPackage.name}`)}
                >
                  <Info size={14} /><span>Status</span>
                </button>
              </div>

              {selectedPackage.type === 'deb' && (
                <button
                  className="sm-btn"
                  style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => runTerminalCommand(`apt-cache depends ${selectedPackage.name} | head -n 30`)}
                >
                  <Layers size={13} /><span>Check Dependencies (apt-cache depends)</span>
                </button>
              )}

              <button
                className="sm-btn"
                style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={() => {
                  if (confirm(`Remove package "${selectedPackage.name}" from the system?`)) {
                    runTerminalCommand(selectedPackage.type === 'deb' ? `pkexec apt remove -y ${selectedPackage.name}` : `pkexec snap remove ${selectedPackage.name}`);
                  }
                }}
              >
                <Trash2 size={13} /><span>Uninstall / Remove from System</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Category Modal ────────────────────────────────────────── */}
      {showCreateCat && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <FolderPlus size={16} style={{ marginRight: '8px' }} />
                Create Category Directory
              </div>
              <button onClick={() => { setShowCreateCat(false); setNewCatName(''); setCreateCatError(null); }}
                style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="wizard-form-group">
                <label className="wizard-label">Category Name (lowercase, hyphens only)</label>
                <input
                  type="text"
                  className="wizard-input mono"
                  placeholder="e.g. design, security, cloud"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); }}
                  autoFocus
                />
              </div>

              <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: '6px', fontSize: '11.5px' }}>
                <div style={{ color: 'var(--text-muted)' }}>Will create:</div>
                <div className="mono" style={{ color: 'var(--accent)', marginTop: '4px' }}>
                  /opt/Application/{newCatName || '<name>'}
                </div>
                <div style={{ color: 'var(--text-dim)', marginTop: '4px', fontSize: '10.5px' }}>
                  chmod 2775, group devtools inherited from parent
                </div>
              </div>

              {createCatError && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', padding: '8px 12px', borderRadius: '6px', fontSize: '12px' }}>
                  {createCatError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="sm-btn" onClick={() => { setShowCreateCat(false); setNewCatName(''); }}>
                Cancel
              </button>
              <button
                className="primary-btn"
                onClick={handleCreateCategory}
                disabled={creatingCat || newCatName.length < 2}
              >
                {creatingCat ? <><RotateCw size={12} className="spin-slow" /><span>Creating…</span></>
                  : <><FolderPlus size={13} /><span>Create Category</span></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Install Wizard Modal ─────────────────────────────────────────── */}
      {isWizardOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">Install Package into /opt/Application</div>
              <button onClick={() => setIsWizardOpen(false)} style={{ color: '#9aa3b2' }}><X size={18} /></button>
            </div>

            <div className="modal-body">
              <div className="stepper">
                {['Source', 'Analysis', 'Plan', 'Result'].map((label, i) => (
                  <div key={label} className={`step-item ${wizardStep >= i + 1 ? 'active' : ''}`}>
                    <div className="step-circle">{i + 1}</div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>

              {wizardError && (
                <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 14px', borderRadius: '6px', marginBottom: '14px', fontSize: '12px' }}>
                  {wizardError}
                </div>
              )}

              {/* Step 1: Source */}
              {wizardStep === 1 && (
                <div>
                  <div className="wizard-form-group">
                    <label className="wizard-label">Source: Archive path, package, URL, or directory</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="wizard-input mono"
                        style={{ flex: 1 }}
                        value={wizardSourcePath}
                        onChange={e => handleSourcePathChange(e.target.value)}
                        placeholder="/path/to/app.tar.xz  or  https://.../tool.tar.gz  or  /opt/myapp"
                      />
                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: '7px 12px', fontSize: '11.5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
                        onClick={() => openFilePicker('Select Archive or Folder to Install', 'any', wizardSourcePath || '/opt/Application', handleSourcePathChange)}
                      >
                        <FolderOpen size={14} />
                        <span>Browse…</span>
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        style={{ padding: '7px 10px', fontSize: '11.5px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}
                        title="Open native KDE Dolphin file chooser"
                        onClick={() => triggerNativeDialog('file', wizardSourcePath || '/opt/Application', handleSourcePathChange)}
                      >
                        <Monitor size={14} />
                        <span>Native</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      Supports: .tar.gz · .tar.xz · .tar.bz2 · .zip · .deb · .AppImage · Remote URLs · directory
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="wizard-form-group">
                      <label className="wizard-label">Target Category</label>
                      <select
                        className="wizard-input"
                        value={wizardCategory}
                        onChange={e => setWizardCategory(e.target.value)}
                        style={{ cursor: 'pointer' }}
                      >
                        {existingCategories.map(c => (
                          <option key={c.id} value={c.id}>{getCategoryLabel(c.id)} ({c.id})</option>
                        ))}
                      </select>
                    </div>

                    <div className="wizard-form-group">
                      <label className="wizard-label">App Identifier (ID)</label>
                      <input
                        type="text"
                        className="wizard-input mono"
                        value={wizardAppName}
                        onChange={e => setWizardAppName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                        placeholder="app-id"
                      />
                    </div>
                  </div>

                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '6px', fontSize: '11.5px', marginTop: '10px' }}>
                    <div style={{ fontWeight: 600, color: '#e6e8ec', marginBottom: '4px' }}>Installation target:</div>
                    <div className="mono" style={{ color: '#3daee9' }}>
                      /opt/Application/{wizardCategory}/{wizardAppName || '<id>'}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Analysis */}
              {wizardStep === 2 && wizardAnalysis && (
                <div className="analysis-card">
                  <div style={{ fontWeight: 600, color: '#3daee9', fontSize: '13px', marginBottom: '8px' }}>
                    Heuristic Analysis: {wizardSourcePath}
                  </div>
                  {[
                    ['Resolved path', wizardAnalysis.resolvedPath],
                    ['Size / files', `${wizardAnalysis.sizeFormatted} (${wizardAnalysis.filesCount} entries)`],
                    ['Main binary', wizardAnalysis.mainExecutable + ` (score: ${wizardAnalysis.execScore})`],
                    ['Sandbox', wizardAnalysis.hasSandbox ? '⚠ chrome-sandbox detected (requires mode 4755)' : 'Not present'],
                    ['Icon candidate', wizardAnalysis.iconCandidate || 'Default category icon'],
                    ['Target folder', wizardAnalysis.targetDir],
                  ].map(([k, v]) => (
                    <div key={k} className="analysis-row">
                      <span>{k}:</span>
                      <span className="mono" style={{ fontSize: '11px', wordBreak: 'break-all' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Step 3: Plan */}
              {wizardStep === 3 && wizardAnalysis && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>Planned filesystem operations:</div>
                  <div style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', padding: '14px', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { label: '1. Extract payload →', val: wizardAnalysis.targetDir, color: 'var(--success)' },
                      { label: '2. chmod +x →', val: `${wizardAnalysis.targetDir}/${wizardAnalysis.mainExecutable}`, color: 'var(--accent)' },
                      { label: '3. Desktop entry →', val: wizardAnalysis.desktopDest, color: 'var(--linked)' },
                      { label: '4. Command symlink →', val: wizardAnalysis.binDest, color: 'var(--accent)' },
                      ...(wizardAnalysis.hasSandbox ? [{ label: '5. Setuid sandbox →', val: 'sudo chmod 4755 chrome-sandbox', color: 'var(--warning)' }] : []),
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ color }}>
                        <strong>{label}</strong>{' '}
                        <span className="mono" style={{ fontSize: '11px', opacity: 0.9 }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Result */}
              {wizardStep === 4 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={46} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Installed Successfully!</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Live inotify detected the new package. Desktop shortcut and command symlink are active.
                  </p>
                  {wizardInstallResult && (
                    <div style={{ marginTop: '16px', textAlign: 'left', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px', fontSize: '11px' }}>
                      <div style={{ color: 'var(--success)' }}>✓ Files: {wizardInstallResult.installedPath}</div>
                      <div style={{ color: 'var(--accent)' }}>✓ Binary: {wizardInstallResult.execPath}</div>
                      <div style={{ color: 'var(--linked)' }}>✓ Desktop: {wizardInstallResult.desktopPath}</div>
                      <div style={{ color: 'var(--accent)' }}>✓ Link: {wizardInstallResult.binLink}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizardStep > 1 && wizardStep < 4 && (
                <button className="sm-btn" onClick={() => setWizardStep(s => s - 1)} disabled={wizardInstalling}>Back</button>
              )}
              {wizardStep === 1 && (
                <button className="primary-btn" onClick={handleAnalyzeSource} disabled={wizardAnalyzing || !wizardSourcePath || !wizardAppName}>
                  {wizardAnalyzing ? 'Analyzing…' : 'Analyze Source'} <ChevronRight size={14} />
                </button>
              )}
              {wizardStep === 2 && (
                <button className="primary-btn" onClick={() => setWizardStep(3)}>
                  Preview Plan <ChevronRight size={14} />
                </button>
              )}
              {wizardStep === 3 && (
                <button className="primary-btn" onClick={handleExecuteInstall} disabled={wizardInstalling}>
                  {wizardInstalling ? 'Installing…' : 'Execute & Install'}
                </button>
              )}
              {wizardStep === 4 && (
                <button className="primary-btn" onClick={() => {
                  setIsWizardOpen(false);
                  setWizardStep(1);
                  setSelectedCategory(wizardCategory);
                  setActiveTab('library');
                  fetchAllData(false);
                }}>
                  Done — View in Library
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stack Manifest Modal */}
      {manifestModal && manifestModal.open && (
        <div className="modal-backdrop" onClick={() => setManifestModal(null)}>
          <div className="modal-card" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} style={{ color: '#3daee9' }} />
                <h2 style={{ fontSize: '15px', fontWeight: 600 }}>
                  Workstation Stack Manifest: {manifestModal.stackName}
                </h2>
              </div>
              <button className="icon-btn" onClick={() => setManifestModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '12px', color: '#9aa3b2', marginBottom: '10px' }}>
                This TOML profile declares your software stack for version-controlled, reproducible setups across team workstations:
              </p>
              <textarea
                className="mono"
                readOnly
                value={manifestModal.toml}
                rows={12}
                style={{
                  width: '100%',
                  background: '#14161a',
                  border: '1px solid #2b303c',
                  borderRadius: '6px',
                  padding: '10px',
                  color: '#3dd68c',
                  fontSize: '11.5px',
                  resize: 'vertical',
                }}
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                className="sm-btn"
                onClick={() => {
                  navigator.clipboard.writeText(manifestModal.toml);
                  showToast('Copied TOML manifest to clipboard!');
                }}
              >
                <Copy size={13} /> Copy TOML
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  const blob = new Blob([manifestModal.toml], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${manifestModal.stackName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-appdepot.toml`;
                  a.click();
                  URL.revokeObjectURL(url);
                  showToast('Downloaded stack manifest file!');
                }}
              >
                <HardDrive size={13} /> Download .toml
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Path Picker & Folder Explorer Modal ─────────────────────────────── */}
      <PathPickerModal
        isOpen={isPickerOpen}
        title={pickerTitle}
        type={pickerType}
        initialPath={pickerInitialPath}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(path) => {
          if (pickerCallback) pickerCallback(path);
          setIsPickerOpen(false);
        }}
        showToast={showToast}
      />
    </div>
  );
}

// ── PathPickerModal Component ────────────────────────────────────────────────
function PathPickerModal({
  isOpen,
  title,
  type,
  initialPath,
  onClose,
  onSelect,
  showToast,
}: {
  isOpen: boolean;
  title: string;
  type: 'file' | 'folder' | 'any';
  initialPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [currentPath, setCurrentPath] = useState(initialPath || '/opt/Application');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ name: string; path: string }>>([]);
  const [items, setItems] = useState<FsItem[]>([]);
  const [quickBookmarks, setQuickBookmarks] = useState<Array<{ name: string; path: string }>>([]);
  const [selectedPath, setSelectedPath] = useState<string>(initialPath || '/opt/Application');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New folder inline state
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const loadDirectory = async (target: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fs/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target }),
      });
      const data: BrowseResult = await res.json();
      if (data.error && (!data.items || data.items.length === 0)) {
        setError(data.error);
      }
      setCurrentPath(data.currentPath);
      setBreadcrumbs(data.breadcrumbs || []);
      setItems(data.items || []);
      setQuickBookmarks(data.quickBookmarks || []);
      setSelectedPath(data.currentPath);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirectory(initialPath || '/opt/Application');
      setShowNewFolder(false);
      setNewFolderName('');
    }
  }, [isOpen, initialPath]);

  if (!isOpen) return null;

  const handleCreateNewFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentDir: currentPath, folderName: newFolderName }),
      });
      const data = await res.json();
      if (data.success && data.createdPath) {
        showToast(`Created folder: ${newFolderName}`);
        setShowNewFolder(false);
        setNewFolderName('');
        await loadDirectory(currentPath);
        setSelectedPath(data.createdPath);
      } else {
        showToast(data.error || 'Failed to create directory.', 'error');
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleNativeDialogTrigger = async () => {
    try {
      const res = await fetch('/api/fs/native-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type === 'folder' ? 'folder' : 'file',
          startDir: currentPath,
        }),
      });
      const data = await res.json();
      if (data.success && data.path) {
        onSelect(data.path);
        onClose();
      }
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div className="picker-modal-card">
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderOpen size={18} style={{ color: 'var(--accent)' }} />
            <div className="modal-title">{title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="action-btn"
              style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Open KDE native Dolphin dialog"
              onClick={handleNativeDialogTrigger}
            >
              <Monitor size={13} />
              <span>Native Dialog</span>
            </button>
            <button onClick={onClose} style={{ color: '#9aa3b2', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar & Breadcrumbs */}
        <div className="picker-toolbar">
          <div className="picker-nav-row">
            <button
              className="sm-btn"
              title="Go to parent directory"
              disabled={currentPath === '/'}
              onClick={() => {
                const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
                loadDirectory(parent);
              }}
              style={{ padding: '5px 8px' }}
            >
              <ArrowUp size={14} />
            </button>

            <div className="picker-breadcrumbs">
              {breadcrumbs.map((crumb, idx) => (
                <div key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    className={`crumb-btn ${crumb.path === currentPath ? 'active' : ''}`}
                    onClick={() => loadDirectory(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                  {idx < breadcrumbs.length - 1 && <span className="crumb-separator">/</span>}
                </div>
              ))}
            </div>

            <button
              className="primary-btn"
              style={{ padding: '5px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
              onClick={() => setShowNewFolder(!showNewFolder)}
            >
              <Plus size={13} />
              <span>New Folder</span>
            </button>
          </div>

          {/* Quick Bookmarks */}
          <div className="picker-bookmarks">
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginRight: '4px' }}>Jump to:</span>
            {quickBookmarks.map(bm => (
              <button
                key={bm.path}
                className={`bookmark-chip ${currentPath === bm.path ? 'active' : ''}`}
                onClick={() => loadDirectory(bm.path)}
              >
                {bm.name}
              </button>
            ))}
          </div>

          {/* Inline New Folder Creation Bar */}
          {showNewFolder && (
            <div className="picker-new-folder-bar">
              <FolderPlus size={15} style={{ color: 'var(--accent)' }} />
              <input
                type="text"
                autoFocus
                className="wizard-input mono"
                style={{ height: '28px', padding: '2px 8px', fontSize: '12px', flex: 1 }}
                placeholder="Folder name (e.g., custom-tools, v2.4.0)..."
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateNewFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              />
              <button
                className="primary-btn"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                disabled={creatingFolder || !newFolderName.trim()}
                onClick={handleCreateNewFolder}
              >
                {creatingFolder ? 'Creating…' : 'Create Folder'}
              </button>
              <button
                className="sm-btn"
                style={{ padding: '4px 8px', fontSize: '11px' }}
                onClick={() => setShowNewFolder(false)}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Search filter in current dir */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '7px', color: 'var(--text-dim)' }} />
              <input
                type="text"
                className="wizard-input"
                style={{ height: '26px', paddingLeft: '26px', fontSize: '11.5px', width: '100%' }}
                placeholder="Filter files and directories in current view..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Items List */}
        <div className="picker-body">
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)' }}>
              <RotateCw size={18} className="spin" style={{ marginRight: '8px' }} />
              <span>Reading filesystem directory…</span>
            </div>
          ) : error && items.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--danger)' }}>
              <AlertTriangle size={28} style={{ margin: '0 auto 8px' }} />
              <div>{error}</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
              Directory is empty
            </div>
          ) : (
            <div className="picker-items-table">
              {filteredItems.map(item => {
                const isSelected = selectedPath === item.path;
                return (
                  <div
                    key={item.path}
                    className={`picker-item-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedPath(item.path)}
                    onDoubleClick={() => {
                      if (item.isDirectory) {
                        loadDirectory(item.path);
                      } else {
                        onSelect(item.path);
                        onClose();
                      }
                    }}
                  >
                    <div className="picker-item-icon">
                      {item.isDirectory ? (
                        <Folder size={15} style={{ color: '#38bdf8' }} />
                      ) : item.isArchive ? (
                        <FileArchive size={15} style={{ color: '#fbbf24' }} />
                      ) : item.isExecutable ? (
                        <FileCode size={15} style={{ color: '#4ade80' }} />
                      ) : (
                        <FileText size={15} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <div className="picker-item-name" style={{ fontWeight: item.isDirectory ? 600 : 400 }}>
                      {item.name}
                    </div>
                    {item.isArchive && (
                      <span className="mode-badge" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.25)', fontSize: '10px', padding: '1px 5px' }}>
                        package
                      </span>
                    )}
                    <div className="picker-item-size">{item.sizeFormatted}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="picker-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, marginRight: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', flexShrink: 0 }}>Selected:</span>
            <span className="mono" style={{ fontSize: '11.5px', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedPath}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button className="sm-btn" onClick={onClose} style={{ padding: '6px 14px' }}>
              Cancel
            </button>
            <button
              className="primary-btn"
              disabled={!selectedPath}
              onClick={() => {
                onSelect(selectedPath);
                onClose();
              }}
              style={{ padding: '6px 16px' }}
            >
              <Check size={14} />
              <span>Select Path</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
