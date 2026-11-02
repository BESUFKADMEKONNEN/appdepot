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
} from 'lucide-react';

// ─── Type Definitions ────────────────────────────────────────────────────────

interface AppItem {
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

interface UnorganizedItem {
  id: string;
  name: string;
  path: string;
  detectedOwner: string;
  suggestedCategory: string;
  mode: 'managed' | 'linked' | 'adopted';
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

  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [changeCount, setChangeCount] = useState(0);

  // UI navigation state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Create category modal
  const [showCreateCat, setShowCreateCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [createCatError, setCreateCatError] = useState<string | null>(null);
  const [creatingCat, setCreatingCat] = useState(false);

  // Doctor fix state
  const [fixingCheck, setFixingCheck] = useState<string | null>(null);

  // Stack manifest export modal
  const [manifestModal, setManifestModal] = useState<{ open: boolean; stackName: string; toml: string } | null>(null);

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

  // Terminal
  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info' | 'error'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Desktop — Live Kernel & Inotify Active' },
    { type: 'output', text: 'Watching: /opt/Application  /usr/local/bin  ~/.local/share/applications' },
    { type: 'output', text: 'Type any shell command. "depot list" shows all managed apps.' },
  ]);
  const [termInput, setTermInput] = useState('');
  const termBodyRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchAllData = async (silent = true) => {
    if (!silent) setIsSyncing(true);
    try {
      const [appsRes, unorgRes, srvRes, docRes, stacksRes, catRes] = await Promise.all([
        fetch('/api/apps').then(r => r.json()).catch(() => []),
        fetch('/api/unorganized').then(r => r.json()).catch(() => []),
        fetch('/api/services').then(r => r.json()).catch(() => []),
        fetch('/api/doctor').then(r => r.json()).catch(() => []),
        fetch('/api/stacks').then(r => r.json()).catch(() => []),
        fetch('/api/categories').then(r => r.json()).catch(() => []),
      ]);
      setApps(appsRes || []);
      setUnorganized(unorgRes || []);
      setServices(srvRes || []);
      setDoctorChecks(docRes || []);
      setStacks(stacksRes || []);
      setCategories(catRes || []);
      setLastSyncTime(new Date());
    } catch (e) {
      console.error('[AppDepot] Fetch error:', e);
    } finally {
      setLoading(false);
      if (!silent) setTimeout(() => setIsSyncing(false), 600);
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
          const label = payload.filename || payload.root || 'filesystem';
          showToast(`↻ Detected change in ${label}`, 'info');
        } catch {}
        fetchAllData(true);
      });
      es.onerror = () => setSseConnected(false);
    } catch (e) {
      console.warn('[AppDepot] SSE unavailable, using polling only');
    }

    // Fallback periodic poll every 4 seconds
    const poll = setInterval(() => fetchAllData(true), 4000);

    // Window focus sync
    const onFocus = () => { if (document.visibilityState === 'visible') fetchAllData(true); };
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      if (es) es.close();
      clearInterval(poll);
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
    const matchesCat = selectedCategory === 'all' || app.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      app.name.toLowerCase().includes(q) ||
      app.command.toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q) ||
      (app.path && app.path.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const doctorPassed = doctorChecks.filter(c => c.passed).length;
  const healthScore = doctorChecks.length > 0 ? Math.round((doctorPassed / doctorChecks.length) * 100) : 100;

  // ── Terminal ──────────────────────────────────────────────────────────────

  const runTerminalCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

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
    showToast(`Launching ${app.name}…`, 'info');
    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: app.execPath || app.command }),
      });
      const data = await res.json();
      if (data.success) showToast(`${app.name} launched (PID: ${data.pid})`);
      else runTerminalCommand(`${app.execPath || app.command} &`);
    } catch {
      runTerminalCommand(`${app.command} &`);
    }
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

  const toggleService = (srv: ServiceItem) => {
    const action = srv.status === 'active' ? 'stop' : 'start';
    showToast(`systemctl ${action} ${srv.unit}`, 'info');
    runTerminalCommand(`systemctl ${action} ${srv.unit} 2>&1 || pkexec systemctl ${action} ${srv.unit}`);
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

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toastMessage && (
        <div className={`toast toast-${toastMessage.type}`}>
          {toastMessage.type === 'success' && <CheckCircle2 size={15} />}
          {toastMessage.type === 'error' && <AlertTriangle size={15} />}
          {toastMessage.type === 'info' && <Info size={15} />}
          <span>{toastMessage.text}</span>
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
            type="text"
            placeholder="Search apps, categories, paths… (Ctrl+K)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
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
              { id: 'unorganized', label: 'Unorganized', icon: AlertTriangle, count: unorganized.length, warn: unorganized.length > 0 },
              { id: 'stacks', label: 'Stacks', icon: Layers, count: stacks.length },
              { id: 'services', label: 'Services', icon: Server, count: services.length },
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
                    {filteredApps.length} live package{filteredApps.length !== 1 ? 's' : ''} in /opt/Application
                    {selectedCategory !== 'all' && `/${selectedCategory}`}
                  </span>
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
                            <Icon size={18} />
                          </div>
                          <div className="card-meta">
                            <span className={`mode-badge ${app.mode}`}>{app.mode}</span>
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
                              background: app.status === 'healthy' ? 'var(--success)' : app.status === 'warning' ? 'var(--warning)' : 'var(--danger)'
                            }} />
                            <span>{app.status}</span>
                          </div>
                          <div className="action-btn-group">
                            <button className="sm-btn" title="Launch" onClick={e => { e.stopPropagation(); handleLaunchApp(app); }}>
                              <Play size={11} />
                            </button>
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
                  {unorganized.map(item => (
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
                  {stacks.map(stack => (
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

          {/* ── Services ─────────────────────────────────────────────── */}
          {!loading && activeTab === 'services' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Live System Services</h1>
                  <span className="view-subtitle">
                    Real systemd units auto-discovered from apps in /opt/Application — memory is live from systemctl
                  </span>
                </div>
                <button className="sm-btn" onClick={() => fetchAllData(false)}>
                  <RotateCw size={12} /><span>Refresh</span>
                </button>
              </div>

              {services.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9aa3b2' }}>
                  <Server size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <h3>No Services Detected</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>
                    Install MySQL, PostgreSQL, Redis, Docker or similar — their systemd services appear here automatically.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {services.map(srv => (
                    <div key={srv.id} className="service-row">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>{srv.name}</span>
                          <span className="status-dot" style={{
                            background: srv.status === 'active' ? '#3dd68c' : '#6b7280',
                            width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block'
                          }} />
                          <span style={{
                            fontSize: '11px',
                            color: srv.status === 'active' ? '#3dd68c' : '#6b7280',
                            textTransform: 'capitalize',
                          }}>
                            {srv.status}
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
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{srv.memoryFormatted || `${srv.memoryMb} MB`}</div>
                            <div style={{ fontSize: '10px' }}>RSS Memory</div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className={srv.status === 'active' ? 'sm-btn' : 'primary-btn'}
                            style={{ minWidth: '76px' }}
                            onClick={() => toggleService(srv)}
                          >
                            <Power size={12} />
                            <span>{srv.status === 'active' ? 'Stop' : 'Start'}</span>
                          </button>
                          <button
                            className="sm-btn"
                            title="View service logs"
                            onClick={() => runTerminalCommand(`journalctl -u ${srv.unit} --no-pager -n 30`)}
                          >
                            <FileText size={12} />
                          </button>
                          <button
                            className="sm-btn"
                            title="Service status"
                            onClick={() => runTerminalCommand(`systemctl status ${srv.unit} --no-pager`)}
                          >
                            <Info size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                {doctorChecks.map(check => (
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
                onChange={e => setTermInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runTerminalCommand(termInput); }}
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
                <span className={`mode-badge ${selectedApp.mode}`}>{selectedApp.mode}</span>
                <span style={{ fontSize: '11.5px', color: '#9aa3b2' }}>
                  {selectedApp.mode === 'managed' && 'AppDepot owns files directly under /opt/Application.'}
                  {selectedApp.mode === 'linked' && 'Physical files at original location, symlinked here.'}
                  {selectedApp.mode === 'adopted' && 'System-level package tracked in AppDepot registry.'}
                </span>
              </div>
            </div>

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
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="primary-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => handleLaunchApp(selectedApp)}>
                  <Play size={14} /><span>Launch App</span>
                </button>
                <button className="sm-btn" style={{ justifyContent: 'center', padding: '0 14px' }} onClick={() => handleOpenFolder(selectedApp.path)}>
                  <Folder size={14} />
                </button>
              </div>
              <button
                className="sm-btn"
                style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}
                onClick={() => deleteApp(selectedApp)}
              >
                <Trash2 size={12} /><span>Remove From System</span>
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
                    <input
                      type="text"
                      className="wizard-input mono"
                      value={wizardSourcePath}
                      onChange={e => {
                        const val = e.target.value;
                        setWizardSourcePath(val);
                        const cleanVal = val.split('?')[0].split('#')[0];
                        const base = cleanVal.split('/').pop()?.replace(/(\.tar\.gz|\.tgz|\.tar\.xz|\.txz|\.tar\.bz2|\.tbz2|\.tar\.zst|\.zip|\.deb|\.AppImage)$/i, '') || '';
                        if (base) setWizardAppName(base.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
                      }}
                      placeholder="/path/to/app.tar.xz  or  https://.../tool.tar.gz  or  /opt/myapp"
                    />
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
    </div>
  );
}

export default App;
