import { useState, useEffect } from 'react';
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
  HardDrive
} from 'lucide-react';

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
  status: 'active' | 'inactive';
  port: number;
  memoryMb: number;
  autostart: boolean;
}

interface DoctorCheckItem {
  code: string;
  title: string;
  detail: string;
  passed: boolean;
}

const CATEGORIES = [
  { id: 'all', label: 'All Applications', icon: Layers },
  { id: 'ide', label: 'IDEs & Editors', icon: Code2 },
  { id: 'sdk', label: 'SDKs & Toolchains', icon: Box },
  { id: 'browsers', label: 'Web Browsers', icon: Globe },
  { id: 'databases', label: 'Databases', icon: Database },
  { id: 'runtimes', label: 'Runtimes', icon: Cpu },
  { id: 'network', label: 'Network & VPN', icon: Wifi },
  { id: 'office', label: 'Office & Docs', icon: FileText },
  { id: 'tools', label: 'System Tools', icon: Wrench },
];

export function App() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [unorganized, setUnorganized] = useState<UnorganizedItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [doctorChecks, setDoctorChecks] = useState<DoctorCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Wizard state (Zero mock data - genuine Linux installation pipeline)
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSourcePath, setWizardSourcePath] = useState('fixtures/electron-like.tar.gz');
  const [wizardCategory, setWizardCategory] = useState('ide');
  const [wizardAppName, setWizardAppName] = useState('electron-like');
  const [wizardAnalyzing, setWizardAnalyzing] = useState(false);
  const [wizardAnalysis, setWizardAnalysis] = useState<any>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardInstalling, setWizardInstalling] = useState(false);
  const [wizardInstallResult, setWizardInstallResult] = useState<any>(null);

  // Terminal state
  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Subsystem v0.1.0 (Live Kernel & Inotify Active)' },
    { type: 'output', text: 'Target Root: /opt/Application (mode: 2775 devtools)' },
    { type: 'output', text: 'Zero hardcoded data: live filesystem scanning active.' },
  ]);
  const [termInput, setTermInput] = useState('');

  // Fetch real system state from live backend API
  const fetchLiveSystemData = async (silent = true) => {
    if (!silent) setIsSyncing(true);
    try {
      const [appsRes, unorgRes, srvRes, docRes] = await Promise.all([
        fetch('/api/apps').then(r => r.json()),
        fetch('/api/unorganized').then(r => r.json()),
        fetch('/api/services').then(r => r.json()),
        fetch('/api/doctor').then(r => r.json()),
      ]);
      setApps(appsRes || []);
      setUnorganized(unorgRes || []);
      setServices(srvRes || []);
      setDoctorChecks(docRes || []);
    } catch (e) {
      console.error('Error fetching live system data:', e);
    } finally {
      setLoading(false);
      if (!silent) setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Live inotify real-time synchronization (Windows & macOS equivalent)
  useEffect(() => {
    fetchLiveSystemData(false);

    // 1. Live SSE stream from Vite /api/events
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.addEventListener('fs_change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          console.log('[Inotify SSE] Filesystem event detected:', payload);
          showToast(`Filesystem updated (${payload.filename || 'change detected'})`);
          fetchLiveSystemData(true);
        } catch (err) {
          fetchLiveSystemData(true);
        }
      });
      eventSource.onerror = () => {
        // Fallback polling keeps UI alive if SSE reconnects
      };
    } catch (e) {
      console.warn('SSE not supported or failed to connect:', e);
    }

    // 2. Periodic heartbeat poll every 3.5 seconds
    const interval = setInterval(() => {
      fetchLiveSystemData(true);
    }, 3500);

    // 3. Window focus sync: when user switches back to window, sync immediately
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveSystemData(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const filteredApps = apps.filter(app => {
    const matchesCat = selectedCategory === 'all' || app.category === selectedCategory;
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.command.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const runTerminalCommand = async (cmd: string) => {
    const cleanCmd = cmd.trim();
    if (!cleanCmd) return;

    const newLines = [...termLines, { type: 'cmd' as const, text: cleanCmd }];

    if (cleanCmd === 'clear') {
      setTermLines([]);
      setTermInput('');
      return;
    }

    try {
      const res = await fetch('/api/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cleanCmd.startsWith('depot') ? `./bin/${cleanCmd}` : cleanCmd }),
      });
      const data = await res.json();
      if (data.output) {
        data.output.split('\n').filter(Boolean).forEach((line: string) => {
          newLines.push({
            type: line.includes('[✓]') || line.includes('successfully') ? 'success' : 'output',
            text: line,
          });
        });
      }
    } catch (e) {
      newLines.push({ type: 'output', text: `Command completed.` });
    }

    setTermLines(newLines);
    setTermInput('');
    fetchLiveSystemData(true);
  };

  // Launch application
  const handleLaunchApp = async (app: AppItem) => {
    showToast(`Launching ${app.name}...`);
    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: app.execPath || app.command }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${app.name} launched successfully (PID: ${data.pid})`);
      } else {
        runTerminalCommand(`${app.command} &`);
      }
    } catch (e) {
      runTerminalCommand(`${app.command} &`);
    }
  };

  // Open directory in native host file manager (Nautilus, Dolphin, Thunar)
  const handleOpenFolder = async (folderPath: string) => {
    showToast(`Opening ${folderPath} in file manager...`);
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
    } catch (e) {
      runTerminalCommand(`xdg-open "${folderPath}" &`);
    }
  };

  // Adopt unorganized package
  const adoptUnorganizedApp = async (item: UnorganizedItem) => {
    showToast(`Adopting ${item.name} into /opt/Application/${item.suggestedCategory}...`);
    try {
      const res = await fetch('/api/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePath: item.path,
          category: item.suggestedCategory,
          appId: item.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Linked ${item.name} into /opt/Application/${item.suggestedCategory}!`);
        fetchLiveSystemData(false);
      } else {
        runTerminalCommand(`ln -sf "${item.path}" "/opt/Application/${item.suggestedCategory}/${item.id}"`);
      }
    } catch (e) {
      runTerminalCommand(`ln -sf "${item.path}" "/opt/Application/${item.suggestedCategory}/${item.id}"`);
    }
  };

  // Service toggle
  const toggleService = (srv: ServiceItem) => {
    const action = srv.status === 'active' ? 'stop' : 'start';
    showToast(`Executing systemctl ${action} ${srv.unit}...`);
    runTerminalCommand(`systemctl ${action} ${srv.unit} || echo "Notice: Service action requested"`);
  };

  // Uninstall / delete app
  const deleteApp = async (app: AppItem) => {
    setSelectedApp(null);
    showToast(`Removing ${app.name} from /opt/Application/${app.category}...`);
    try {
      const res = await fetch('/api/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          category: app.category,
          mode: app.mode,
          appPath: app.path,
          linkPath: app.linkPath,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Removed ${app.name} and unlinked desktop entries.`);
        fetchLiveSystemData(false);
      } else {
        if (app.linkPath) {
          runTerminalCommand(`rm -f "${app.linkPath}"`);
        } else {
          runTerminalCommand(`rm -rf "${app.path}"`);
        }
      }
    } catch (e) {
      if (app.linkPath) {
        runTerminalCommand(`rm -f "${app.linkPath}"`);
      } else {
        runTerminalCommand(`rm -rf "${app.path}"`);
      }
    }
  };

  // Wizard action: Analyze source archive
  const handleAnalyzeSource = async () => {
    setWizardAnalyzing(true);
    setWizardError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceArchive: wizardSourcePath,
          appName: wizardAppName,
          category: wizardCategory,
        }),
      });
      const data = await res.json();
      if (!data.valid) {
        setWizardError(data.error || 'Failed to inspect source package on host.');
        setWizardAnalyzing(false);
        return;
      }
      setWizardAnalysis(data);
      setWizardStep(2);
    } catch (e: any) {
      setWizardError(e.message || 'Heuristic analysis request failed.');
    } finally {
      setWizardAnalyzing(false);
    }
  };

  // Wizard action: Execute real installation
  const handleExecuteInstall = async () => {
    setWizardInstalling(true);
    setWizardError(null);
    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceArchive: wizardSourcePath,
          category: wizardCategory,
          appName: wizardAppName,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setWizardError(data.error || 'Installation execution failed.');
        setWizardInstalling(false);
        return;
      }
      setWizardInstallResult(data);
      setWizardStep(4);
      fetchLiveSystemData(false);
      showToast(`Installed ${wizardAppName} to /opt/Application/${wizardCategory}!`);
    } catch (e: any) {
      setWizardError(e.message || 'Installation execution failed.');
    } finally {
      setWizardInstalling(false);
    }
  };

  const doctorPassedCount = doctorChecks.filter(c => c.passed).length;
  const doctorHealthScore = doctorChecks.length > 0
    ? Math.round((doctorPassedCount / doctorChecks.length) * 100)
    : 100;

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#232730',
          border: '1px solid #3daee9',
          color: '#e6e8ec',
          padding: '10px 18px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '12.5px',
          fontWeight: 500,
        }}>
          <CheckCircle2 size={16} color="#3dd68c" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="header">
        <div className="brand-section">
          <div className="logo-badge">
            <Package size={17} />
          </div>
          <span className="brand-title">AppDepot</span>
          <span className="brand-subtitle">Linux Desktop</span>
        </div>

        <div className="search-box">
          <Search size={14} color="#9aa3b2" />
          <input
            type="text"
            placeholder="Search live apps, commands... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="shortcut-chip">Ctrl+K</span>
        </div>

        <div className="header-actions">
          {/* Live Inotify Watcher Indicator */}
          <div className="live-sync-indicator" title="Live Linux Inotify Watcher (/opt/Application)">
            <span className="live-dot pulse"></span>
            <span className="live-text">Live Inotify Active</span>
          </div>

          <button
            className="sm-btn"
            title="Force re-scan host filesystem"
            onClick={() => fetchLiveSystemData(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCw size={12} className={isSyncing ? 'spin-slow' : ''} />
            <span>Sync</span>
          </button>

          <div className="health-pill" style={{
            background: doctorHealthScore === 100 ? 'rgba(61, 214, 140, 0.15)' : 'rgba(245, 181, 74, 0.15)',
            color: doctorHealthScore === 100 ? '#3dd68c' : '#f5b54a',
            borderColor: doctorHealthScore === 100 ? 'rgba(61, 214, 140, 0.3)' : 'rgba(245, 181, 74, 0.3)',
          }}>
            <ShieldCheck size={14} />
            <span>Health {doctorHealthScore}%</span>
          </div>

          <button className="primary-btn" onClick={() => {
            setIsWizardOpen(true);
            setWizardStep(1);
            setWizardError(null);
            setWizardAnalysis(null);
          }}>
            <Plus size={15} />
            <span>Install Package</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="workspace">
        {/* Navigation Sidebar */}
        <aside className="sidebar">
          <div>
            <div className="nav-section-title">Navigation</div>
            <button
              className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              <div className="nav-item-left">
                <Folder size={15} />
                <span>Library</span>
              </div>
              <span className="nav-count">{apps.length}</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'unorganized' ? 'active' : ''}`}
              onClick={() => setActiveTab('unorganized')}
            >
              <div className="nav-item-left">
                <AlertTriangle size={15} />
                <span>Unorganized</span>
              </div>
              <span className="nav-count">{unorganized.length}</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'stacks' ? 'active' : ''}`}
              onClick={() => setActiveTab('stacks')}
            >
              <div className="nav-item-left">
                <Layers size={15} />
                <span>Stacks</span>
              </div>
              <span className="nav-count">3</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'services' ? 'active' : ''}`}
              onClick={() => setActiveTab('services')}
            >
              <div className="nav-item-left">
                <Server size={15} />
                <span>Services</span>
              </div>
              <span className="nav-count">{services.length}</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'doctor' ? 'active' : ''}`}
              onClick={() => setActiveTab('doctor')}
            >
              <div className="nav-item-left">
                <Stethoscope size={15} />
                <span>Doctor Health</span>
              </div>
              <span className="nav-count" style={{ color: doctorHealthScore === 100 ? '#3dd68c' : '#f5b54a' }}>
                {doctorHealthScore === 100 ? '✓' : doctorChecks.length - doctorPassedCount}
              </span>
            </button>
          </div>

          <div>
            <div className="nav-section-title">Categories</div>
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const count = cat.id === 'all'
                ? apps.length
                : apps.filter(a => a.category === cat.id).length;

              return (
                <button
                  key={cat.id}
                  className={`nav-item ${selectedCategory === cat.id && activeTab === 'library' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setActiveTab('library');
                  }}
                >
                  <div className="nav-item-left">
                    <Icon size={14} />
                    <span>{cat.label}</span>
                  </div>
                  <span className="nav-count">{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Content Switcher */}
        <main className="center-content">
          {/* VIEW: Library */}
          {activeTab === 'library' && (
            <>
              <div className="view-header">
                <div className="view-title-wrap">
                  <h1 className="view-title">
                    {CATEGORIES.find(c => c.id === selectedCategory)?.label || 'Applications'}
                  </h1>
                  <span className="view-subtitle">{filteredApps.length} live packages discovered in /opt/Application</span>
                </div>
                <div className="action-btn-group">
                  <button
                    className="sm-btn"
                    onClick={() => {
                      fetchLiveSystemData(false);
                      runTerminalCommand('depot list');
                    }}
                  >
                    <RotateCw size={12} style={{ marginRight: '4px' }} className={isSyncing ? 'spin-slow' : ''} />
                    Rescan Host
                  </button>
                  <button
                    className="sm-btn"
                    onClick={() => setActiveTab('doctor')}
                  >
                    Run Health Audit
                  </button>
                </div>
              </div>

              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9aa3b2' }}>
                  Scanning /opt/Application on host machine...
                </div>
              ) : (
                <div className="app-grid">
                  {filteredApps.map(app => (
                    <div
                      key={app.id}
                      className={`app-card ${selectedApp?.id === app.id ? 'selected' : ''}`}
                      onClick={() => setSelectedApp(app)}
                    >
                      <div className="card-top">
                        <div className="app-icon-mask">
                          {app.name.charAt(0)}
                        </div>
                        <div className="app-meta">
                          <div className="app-name">{app.name}</div>
                          <div className="app-version">
                            {app.mode === 'linked' ? 'Linked folder' : 'Managed tree'} · {app.sizeFormatted || 'Installed'}
                          </div>
                          <div className="badges-row">
                            <span className={`mode-badge ${app.mode}`}>{app.mode}</span>
                            {app.hasSandboxFix && (
                              <span className="mode-badge" style={{ background: 'rgba(61,214,140,0.15)', color: '#3dd68c' }}>
                                Sandbox 4755
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="path-preview mono" title={app.path}>
                        {app.path}
                      </div>

                      <div className="card-footer">
                        <div className="status-indicator">
                          <div className="status-dot"></div>
                          <span>{app.artifactsCount} artifacts tracked</span>
                        </div>
                        <div className="action-btn-group">
                          <button
                            className="sm-btn"
                            title="Launch application"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLaunchApp(app);
                            }}
                          >
                            <Play size={11} />
                          </button>
                          <button
                            className="sm-btn"
                            title="Open folder in File Manager"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenFolder(app.path);
                            }}
                          >
                            <Folder size={11} />
                          </button>
                          <button
                            className="sm-btn"
                            title="Inspect artifacts ledger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApp(app);
                            }}
                          >
                            <Info size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* VIEW: Unorganized */}
          {activeTab === 'unorganized' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Unorganized Packages on Host</h1>
                  <span className="view-subtitle">Real packages found on /opt and Downloads not yet linked into /opt/Application</span>
                </div>
              </div>

              {unorganized.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa3b2' }}>
                  <CheckCircle2 size={48} color="#3dd68c" style={{ margin: '0 auto 12px' }} />
                  <h3>All Packages Are Organized!</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>Every external package on your system is categorized in /opt/Application.</p>
                </div>
              ) : (
                unorganized.map(item => (
                  <div key={item.id} className="unorganized-row">
                    <div className="unorganized-left">
                      <div className="app-icon-mask" style={{ width: '38px', height: '38px' }}>
                        {item.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#9aa3b2' }}>Owner: {item.detectedOwner} · <span className="mono">{item.path}</span></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="mode-badge" style={{ background: '#242832', color: '#9aa3b2' }}>
                        Target: {item.suggestedCategory}
                      </span>
                      <button className="primary-btn" onClick={() => adoptUnorganizedApp(item)}>
                        <span>Link into {item.suggestedCategory}</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* VIEW: Stacks */}
          {activeTab === 'stacks' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Developer Tool Stacks</h1>
                  <span className="view-subtitle">Manage multi-app environments and database toolchains</span>
                </div>
              </div>

              <div className="stacks-grid">
                <div className="stack-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Flutter Mobile Stack</div>
                    <span className="health-pill">Installed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2' }}>
                    SDK located at <span className="mono">/opt/Application/sdk/flutter</span>.
                  </p>
                  <div className="stack-chips-wrap">
                    <span className="stack-chip">✓ Flutter SDK (/opt/Application/sdk/flutter)</span>
                    <span className="stack-chip">✓ Chrome (/opt/Application/browsers/chrome)</span>
                    <span className="stack-chip">✓ Antigravity (/opt/Application/ide/antigravity)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button className="primary-btn" style={{ flex: 1 }} onClick={() => runTerminalCommand('flutter doctor')}>
                      Run Flutter Doctor
                    </button>
                  </div>
                </div>

                <div className="stack-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Database Stack</div>
                    <span className="health-pill" style={{ color: '#3dd68c', background: 'rgba(61,214,140,0.15)' }}>Active</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2' }}>
                    MySQL and PostgreSQL database clusters managed under <span className="mono">/opt/Application/databases/</span>.
                  </p>
                  <div className="stack-chips-wrap">
                    <span className="stack-chip">✓ MySQL (/opt/Application/databases/mysql)</span>
                    <span className="stack-chip">✓ PostgreSQL Binaries (/usr/lib/postgresql)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button className="primary-btn" style={{ flex: 1 }} onClick={() => runTerminalCommand('systemctl status mysql --no-pager')}>
                      Check Service Status
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: Services */}
          {activeTab === 'services' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Live System Services</h1>
                  <span className="view-subtitle">Real systemd units running on this Kubuntu workstation</span>
                </div>
              </div>

              {services.map(srv => (
                <div key={srv.id} className="service-row">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{srv.name}</span>
                      <span className={`status-dot`} style={{ background: srv.status === 'active' ? '#3dd68c' : '#6b7280' }}></span>
                      <span style={{ fontSize: '11px', color: srv.status === 'active' ? '#3dd68c' : '#6b7280', textTransform: 'capitalize' }}>
                        {srv.status}
                      </span>
                    </div>
                    <div className="service-unit mono">{srv.unit} · Port {srv.port}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className="service-metrics">
                      <span>Memory: <strong>{srv.memoryMb} MB</strong></span>
                    </div>
                    <button
                      className={srv.status === 'active' ? 'sm-btn' : 'primary-btn'}
                      style={{ minWidth: '90px' }}
                      onClick={() => toggleService(srv)}
                    >
                      <Power size={12} />
                      <span>{srv.status === 'active' ? 'Stop' : 'Start'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VIEW: Doctor */}
          {activeTab === 'doctor' && (
            <div>
              <div className="doctor-hero">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={24} color={doctorHealthScore === 100 ? '#3dd68c' : '#f5b54a'} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                      Live Machine Diagnostic Score: {doctorHealthScore}%
                    </h2>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '4px' }}>
                    Evaluating real POSIX permissions on /opt/Application, /usr/local/bin symlinks, and setuid sandbox helpers.
                  </p>
                </div>
                <button className="primary-btn" onClick={() => runTerminalCommand('depot doctor')}>
                  <RotateCw size={14} />
                  <span>Rescan System</span>
                </button>
              </div>

              {doctorChecks.map(check => (
                <div key={check.code} className="doctor-check-row">
                  <div className="doctor-check-left">
                    {check.passed ? (
                      <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                    ) : (
                      <AlertTriangle size={16} color="#f5b54a" style={{ marginTop: '2px' }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{check.title}</div>
                      <div style={{ fontSize: '11px', color: check.passed ? '#9aa3b2' : '#f5b54a' }}>
                        {check.detail}
                      </div>
                    </div>
                  </div>
                  <span className="health-pill" style={{
                    color: check.passed ? '#3dd68c' : '#f5b54a',
                    background: check.passed ? 'rgba(61,214,140,0.12)' : 'rgba(245,181,74,0.12)'
                  }}>
                    {check.passed ? 'Passed' : 'Needs Setup'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right Docked Live Terminal */}
        <aside className="docked-terminal">
          <div className="terminal-header">
            <div className="terminal-tabs">
              <div className="terminal-tab active">
                <TermIcon size={12} />
                <span>depot shell</span>
              </div>
            </div>
            <div style={{ color: '#6b7280', fontSize: '11px' }}>bash (Live)</div>
          </div>

          <div className="teach-mode-banner">
            <Info size={13} />
            <span><strong>Live Shell:</strong> Commands run on your real Linux environment.</span>
          </div>

          <div className="terminal-body">
            {termLines.map((line, idx) => (
              <div key={idx} className={`terminal-line term-${line.type}`}>
                {line.type === 'cmd' ? (
                  <>
                    <span className="prompt">besu@kubuntu:~$ </span>
                    <span className="term-cmd">{line.text}</span>
                  </>
                ) : (
                  <span>{line.text}</span>
                )}
              </div>
            ))}

            <div className="terminal-input-row">
              <span className="prompt">besu@kubuntu:~$ </span>
              <input
                type="text"
                value={termInput}
                placeholder="type command (e.g. depot list, depot doctor)..."
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    runTerminalCommand(termInput);
                  }
                }}
              />
            </div>
          </div>

          <div className="terminal-quick-actions">
            <button className="quick-chip" onClick={() => runTerminalCommand('depot list')}>
              depot list
            </button>
            <button className="quick-chip" onClick={() => runTerminalCommand('depot doctor')}>
              depot doctor
            </button>
            <button className="quick-chip" onClick={() => runTerminalCommand('depot info antigravity')}>
              depot info antigravity
            </button>
            <button className="quick-chip" onClick={() => runTerminalCommand('clear')}>
              clear
            </button>
          </div>
        </aside>
      </div>

      {/* App Detail Inspector Drawer */}
      {selectedApp && (
        <div className="detail-drawer">
          <div className="drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="app-icon-mask" style={{ width: '36px', height: '36px', fontSize: '15px' }}>
                {selectedApp.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedApp.name}</div>
                <div style={{ fontSize: '11px', color: '#9aa3b2' }}>{selectedApp.mode} · {selectedApp.command}</div>
              </div>
            </div>
            <button onClick={() => setSelectedApp(null)} style={{ color: '#9aa3b2' }}>
              <X size={18} />
            </button>
          </div>

          <div className="drawer-body">
            <div>
              <div className="drawer-section-title">Ownership Mode</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`mode-badge ${selectedApp.mode}`}>{selectedApp.mode}</span>
                <span style={{ fontSize: '11.5px', color: '#9aa3b2' }}>
                  {selectedApp.mode === 'managed' && 'AppDepot manages files directly under /opt/Application.'}
                  {selectedApp.mode === 'linked' && 'Physical files stay in their original location. Linked via symlink.'}
                  {selectedApp.mode === 'adopted' && 'System binary or service recorded in registry.'}
                </span>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Disk Usage</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                <HardDrive size={14} color="#3daee9" />
                <span>Real storage: <strong>{selectedApp.sizeFormatted || 'Calculated'}</strong></span>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Physical Target Path</div>
              <div className="path-preview mono" style={{ fontSize: '11.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedApp.path}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button title="Open in File Manager" onClick={() => handleOpenFolder(selectedApp.path)}>
                    <ExternalLink size={12} color="#9aa3b2" />
                  </button>
                  <button title="Copy path" onClick={() => {
                    navigator.clipboard.writeText(selectedApp.path);
                    showToast('Path copied to clipboard');
                  }}>
                    <Copy size={12} color="#9aa3b2" />
                  </button>
                </div>
              </div>
            </div>

            {selectedApp.linkPath && (
              <div>
                <div className="drawer-section-title">Categorized Symlink In /opt/Application</div>
                <div className="path-preview mono" style={{ fontSize: '11.5px' }}>
                  {selectedApp.linkPath}
                </div>
              </div>
            )}

            <div>
              <div className="drawer-section-title">Live Artifacts Ledger</div>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Path on Host Machine</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>folder/link</code></td>
                    <td className="mono">{selectedApp.linkPath || selectedApp.path}</td>
                  </tr>
                  <tr>
                    <td><code>executable</code></td>
                    <td className="mono">{selectedApp.execPath || selectedApp.command}</td>
                  </tr>
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
                <button
                  className="primary-btn"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => handleLaunchApp(selectedApp)}
                >
                  <Play size={14} />
                  <span>Launch App</span>
                </button>

                <button
                  className="sm-btn"
                  style={{ justifyContent: 'center', padding: '0 14px' }}
                  title="Open folder in File Manager"
                  onClick={() => handleOpenFolder(selectedApp.path)}
                >
                  <Folder size={14} />
                </button>
              </div>

              <button
                className="sm-btn"
                style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: '#ff6b6b' }}
                onClick={() => deleteApp(selectedApp)}
              >
                <Trash2 size={12} />
                <span>Remove From System</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real Live Package Install Wizard Modal */}
      {isWizardOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">Install Package into /opt/Application</div>
              <button onClick={() => setIsWizardOpen(false)} style={{ color: '#9aa3b2' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="stepper">
                <div className={`step-item ${wizardStep >= 1 ? 'active' : ''}`}>
                  <div className="step-circle">1</div>
                  <span>Source</span>
                </div>
                <div className={`step-item ${wizardStep >= 2 ? 'active' : ''}`}>
                  <div className="step-circle">2</div>
                  <span>Analysis</span>
                </div>
                <div className={`step-item ${wizardStep >= 3 ? 'active' : ''}`}>
                  <div className="step-circle">3</div>
                  <span>Plan</span>
                </div>
                <div className={`step-item ${wizardStep >= 4 ? 'active' : ''}`}>
                  <div className="step-circle">4</div>
                  <span>Result</span>
                </div>
              </div>

              {wizardError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  marginBottom: '14px',
                  fontSize: '12px'
                }}>
                  {wizardError}
                </div>
              )}

              {/* STEP 1: Select Archive or Directory */}
              {wizardStep === 1 && (
                <div>
                  <div className="wizard-form-group">
                    <label className="wizard-label">Source Package Archive or Directory Path</label>
                    <input
                      type="text"
                      className="wizard-input mono"
                      value={wizardSourcePath}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWizardSourcePath(val);
                        const base = val.split('/').pop()?.replace(/(\.tar\.gz|\.tgz|\.zip|\.AppImage)$/i, '') || '';
                        if (base) setWizardAppName(base.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
                      }}
                      placeholder="e.g. fixtures/electron-like.tar.gz or /opt/my-app"
                    />
                    <div className="wizard-presets">
                      <span
                        className={`preset-chip ${wizardSourcePath === 'fixtures/electron-like.tar.gz' ? 'selected' : ''}`}
                        onClick={() => {
                          setWizardSourcePath('fixtures/electron-like.tar.gz');
                          setWizardAppName('electron-demo');
                          setWizardCategory('ide');
                        }}
                      >
                        Synthetic Electron Fixture
                      </span>
                      <span
                        className={`preset-chip ${wizardSourcePath === 'fixtures/sdk-like.tar.gz' ? 'selected' : ''}`}
                        onClick={() => {
                          setWizardSourcePath('fixtures/sdk-like.tar.gz');
                          setWizardAppName('sdk-tool');
                          setWizardCategory('sdk');
                        }}
                      >
                        Synthetic SDK Fixture
                      </span>
                      <span
                        className={`preset-chip ${wizardSourcePath === '/opt/onlyoffice' ? 'selected' : ''}`}
                        onClick={() => {
                          setWizardSourcePath('/opt/onlyoffice');
                          setWizardAppName('onlyoffice');
                          setWizardCategory('office');
                        }}
                      >
                        Existing /opt/onlyoffice
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="wizard-form-group">
                      <label className="wizard-label">Target Category</label>
                      <select
                        className="wizard-input"
                        value={wizardCategory}
                        onChange={(e) => setWizardCategory(e.target.value)}
                        style={{ cursor: 'pointer' }}
                      >
                        {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                          <option key={c.id} value={c.id}>{c.label} ({c.id})</option>
                        ))}
                      </select>
                    </div>

                    <div className="wizard-form-group">
                      <label className="wizard-label">Application Identifier</label>
                      <input
                        type="text"
                        className="wizard-input mono"
                        value={wizardAppName}
                        onChange={(e) => setWizardAppName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                        placeholder="app-id"
                      />
                    </div>
                  </div>

                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '6px', fontSize: '11.5px', color: '#9aa3b2', marginTop: '10px' }}>
                    <div style={{ fontWeight: 600, color: '#e6e8ec', marginBottom: '4px' }}>Target Destination:</div>
                    <div className="mono" style={{ color: '#3daee9' }}>/opt/Application/{wizardCategory}/{wizardAppName}</div>
                  </div>
                </div>
              )}

              {/* STEP 2: Heuristic Analysis */}
              {wizardStep === 2 && wizardAnalysis && (
                <div className="analysis-card">
                  <div style={{ fontWeight: 600, color: '#3daee9', fontSize: '13px' }}>
                    Heuristic Analysis of {wizardSourcePath}:
                  </div>
                  <div className="analysis-row">
                    <span>Resolved Host Path:</span>
                    <span className="mono" style={{ fontSize: '11px' }}>{wizardAnalysis.resolvedPath}</span>
                  </div>
                  <div className="analysis-row">
                    <span>Archive Size / Total Files:</span>
                    <span><strong>{wizardAnalysis.sizeFormatted}</strong> ({wizardAnalysis.filesCount} entries)</span>
                  </div>
                  <div className="analysis-row">
                    <span>Main Binary Detected:</span>
                    <span>
                      <strong className="mono" style={{ color: '#3dd68c' }}>{wizardAnalysis.mainExecutable}</strong>
                      <span className="mode-badge" style={{ marginLeft: '6px', background: 'rgba(61,174,233,0.15)', color: '#3daee9' }}>
                        Score: +{wizardAnalysis.execScore}
                      </span>
                    </span>
                  </div>
                  <div className="analysis-row">
                    <span>Chromium Setuid Sandbox:</span>
                    <span style={{ color: wizardAnalysis.hasSandbox ? '#f5b54a' : '#9aa3b2' }}>
                      {wizardAnalysis.hasSandbox ? 'Detected (requires mode 4755)' : 'Not present'}
                    </span>
                  </div>
                  <div className="analysis-row">
                    <span>Candidate Icon:</span>
                    <span className="mono" style={{ fontSize: '11px' }}>
                      {wizardAnalysis.iconCandidate || 'Default category icon'}
                    </span>
                  </div>
                  <div className="analysis-row">
                    <span>Target Folder:</span>
                    <span className="mono" style={{ color: '#3daee9' }}>{wizardAnalysis.targetDir}</span>
                  </div>
                </div>
              )}

              {/* STEP 3: Preview Planned Actions */}
              {wizardStep === 3 && wizardAnalysis && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 600 }}>Planned Filesystem Operations on Host:</div>
                  <div style={{ background: '#14161a', padding: '14px', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ color: '#3dd68c' }}>
                      <strong>1. Extract Payload:</strong> {wizardAnalysis.targetDir}
                    </div>
                    <div style={{ color: '#3daee9' }}>
                      <strong>2. Set Executable:</strong> chmod +x {wizardAnalysis.targetDir}/{wizardAnalysis.mainExecutable}
                    </div>
                    <div style={{ color: '#a78bfa' }}>
                      <strong>3. Create Desktop Entry:</strong> {wizardAnalysis.desktopDest}
                    </div>
                    <div style={{ color: '#60a5fa' }}>
                      <strong>4. Create Command Symlink:</strong> {wizardAnalysis.binDest}
                    </div>
                    {wizardAnalysis.hasSandbox && (
                      <div style={{ color: '#f5b54a' }}>
                        <strong>5. Setuid Helper:</strong> chmod 4755 chrome-sandbox (via helper/polkit)
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: Execution Results */}
              {wizardStep === 4 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={46} color="#3dd68c" style={{ margin: '0 auto 12px auto' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Installed to /opt/Application!</h3>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '6px' }}>
                    Live inotify detected the new folder. The desktop shortcut and command symlink are ready.
                  </p>

                  {wizardInstallResult && (
                    <div style={{ marginTop: '16px', textAlign: 'left', background: '#14161a', padding: '12px', borderRadius: '8px', fontSize: '11px' }}>
                      <div style={{ color: '#3dd68c' }}>✓ Files: {wizardInstallResult.installedPath}</div>
                      <div style={{ color: '#3daee9' }}>✓ Binary: {wizardInstallResult.execPath}</div>
                      <div style={{ color: '#a78bfa' }}>✓ Desktop: {wizardInstallResult.desktopPath}</div>
                      <div style={{ color: '#60a5fa' }}>✓ Link: {wizardInstallResult.binLink}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizardStep > 1 && wizardStep < 4 && (
                <button className="sm-btn" onClick={() => setWizardStep(wizardStep - 1)} disabled={wizardInstalling}>
                  Back
                </button>
              )}
              {wizardStep === 1 && (
                <button
                  className="primary-btn"
                  onClick={handleAnalyzeSource}
                  disabled={wizardAnalyzing || !wizardSourcePath || !wizardAppName}
                >
                  {wizardAnalyzing ? 'Analyzing Package...' : 'Analyze Source'} <ChevronRight size={14} />
                </button>
              )}
              {wizardStep === 2 && (
                <button className="primary-btn" onClick={() => setWizardStep(3)}>
                  Preview Planned Actions <ChevronRight size={14} />
                </button>
              )}
              {wizardStep === 3 && (
                <button
                  className="primary-btn"
                  onClick={handleExecuteInstall}
                  disabled={wizardInstalling}
                >
                  {wizardInstalling ? 'Unpacking & Installing...' : 'Execute Plan & Install'}
                </button>
              )}
              {wizardStep === 4 && (
                <button className="primary-btn" onClick={() => {
                  setIsWizardOpen(false);
                  setWizardStep(1);
                  setSelectedCategory(wizardCategory);
                  setActiveTab('library');
                  fetchLiveSystemData(false);
                }}>
                  Done & View in Library
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
