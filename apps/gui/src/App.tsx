import { useState } from 'react';
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
  UploadCloud,
  ArrowRight,
  Power,
  RotateCw,
  Trash2,
  Copy,
} from 'lucide-react';

interface AppItem {
  id: string;
  name: string;
  category: string;
  version: string;
  mode: 'managed' | 'linked' | 'adopted';
  path: string;
  command: string;
  artifactsCount: number;
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

const INITIAL_APPS: AppItem[] = [
  {
    id: 'antigravity',
    name: 'Antigravity IDE',
    category: 'ide',
    version: '0.9.1',
    mode: 'managed',
    path: '/opt/Application/ide/antigravity',
    command: 'antigravity',
    artifactsCount: 4,
    status: 'healthy',
    hasSandboxFix: true,
  },
  {
    id: 'android-studio',
    name: 'Android Studio',
    category: 'ide',
    version: '2024.1',
    mode: 'managed',
    path: '/opt/Application/ide/android-studio',
    command: 'studio',
    artifactsCount: 3,
    status: 'healthy',
  },
  {
    id: 'google-chrome',
    name: 'Google Chrome',
    category: 'browsers',
    version: '128.0',
    mode: 'linked',
    path: '/opt/google/chrome',
    command: 'google-chrome',
    artifactsCount: 2,
    status: 'healthy',
  },
  {
    id: 'flutter',
    name: 'Flutter SDK',
    category: 'sdk',
    version: '3.24.3',
    mode: 'managed',
    path: '/opt/Application/sdk/flutter',
    command: 'flutter',
    artifactsCount: 5,
    status: 'healthy',
  },
  {
    id: 'redis',
    name: 'Redis Cache Server',
    category: 'databases',
    version: '7.2',
    mode: 'adopted',
    path: '/usr/bin/redis-server',
    command: 'redis-cli',
    artifactsCount: 1,
    status: 'healthy',
  },
  {
    id: 'onlyoffice',
    name: 'OnlyOffice Desktop',
    category: 'office',
    version: '8.1',
    mode: 'linked',
    path: '/opt/onlyoffice/desktopeditors',
    command: 'desktopeditors',
    artifactsCount: 2,
    status: 'healthy',
  },
];

const INITIAL_UNORGANIZED: UnorganizedItem[] = [
  {
    id: 'vlc',
    name: 'VLC Media Player',
    path: '/usr/bin/vlc',
    detectedOwner: 'dpkg: vlc-bin (apt)',
    suggestedCategory: 'tools',
    mode: 'adopted',
  },
  {
    id: 'postman',
    name: 'Postman API Client',
    path: '/home/besu/Downloads/Postman-linux-x64.tar.gz',
    detectedOwner: 'standalone tarball',
    suggestedCategory: 'tools',
    mode: 'managed',
  },
];

const INITIAL_SERVICES: ServiceItem[] = [
  {
    id: 'redis',
    name: 'Redis Server',
    unit: 'redis-server.service',
    status: 'active',
    port: 6379,
    memoryMb: 14.8,
    autostart: true,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL Cluster',
    unit: 'postgresql.service',
    status: 'inactive',
    port: 5432,
    memoryMb: 0,
    autostart: false,
  },
];

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
  const [apps, setApps] = useState<AppItem[]>(INITIAL_APPS);
  const [unorganized, setUnorganized] = useState<UnorganizedItem[]>(INITIAL_UNORGANIZED);
  const [services, setServices] = useState<ServiceItem[]>(INITIAL_SERVICES);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [doctorFixed, setDoctorFixed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Subsystem v0.1.0 (connected)' },
    { type: 'output', text: 'Install root: /opt/Application (mode: 2775 devtools)' },
    { type: 'output', text: 'Type "help", "depot list", or "depot doctor" to interact.' },
  ]);
  const [termInput, setTermInput] = useState('');

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

  const runTerminalCommand = (cmd: string) => {
    const cleanCmd = cmd.trim();
    if (!cleanCmd) return;

    const newLines = [...termLines, { type: 'cmd' as const, text: cleanCmd }];

    if (cleanCmd === 'clear') {
      setTermLines([]);
      setTermInput('');
      return;
    }

    if (cleanCmd === 'help' || cleanCmd === 'depot --help') {
      newLines.push({
        type: 'output',
        text: 'Available: depot list | depot doctor | depot info <app> | depot init | clear'
      });
    } else if (cleanCmd === 'depot list') {
      newLines.push({ type: 'output', text: 'CATEGORY     NAME               MODE     STATUS' });
      newLines.push({ type: 'output', text: '---------------------------------------------------' });
      apps.forEach(a => {
        newLines.push({ type: 'output', text: `${a.category.padEnd(12)} ${a.name.padEnd(18)} ${a.mode.padEnd(8)} ${a.status}` });
      });
    } else if (cleanCmd === 'depot doctor' || cleanCmd === 'depot doctor --fix') {
      newLines.push({ type: 'success', text: '[✓] D-001: Install root (/opt/Application) mode 2775 verified' });
      newLines.push({ type: 'success', text: '[✓] D-003: Symlinks in /usr/local/bin verified healthy' });
      newLines.push({ type: 'success', text: '[✓] D-005: Zero placeholder icon paths found in shortcuts' });
      newLines.push({ type: 'success', text: '[✓] D-006: Chromium sandbox setuid (4755) root verified' });
      newLines.push({ type: 'info', text: 'All diagnostic checks passed. System score: 100%.' });
      setDoctorFixed(true);
    } else if (cleanCmd.startsWith('depot info')) {
      const target = cleanCmd.split(' ')[2] || 'antigravity';
      const found = apps.find(a => a.id === target || a.command === target);
      if (found) {
        newLines.push({ type: 'output', text: `App: ${found.name} (${found.id})` });
        newLines.push({ type: 'output', text: `Path: ${found.path}` });
        newLines.push({ type: 'output', text: `Mode: ${found.mode} | Artifacts tracked: ${found.artifactsCount}` });
      } else {
        newLines.push({ type: 'output', text: `Application "${target}" not found in registry.` });
      }
    } else if (cleanCmd.startsWith('depot remove')) {
      const target = cleanCmd.split(' ')[2];
      newLines.push({ type: 'info', text: `Consulting SQLite ledger for artifacts belonging to ${target}...` });
      newLines.push({ type: 'output', text: `✓ Removed desktop shortcut /usr/share/applications/appdepot-${target}.desktop` });
      newLines.push({ type: 'output', text: `✓ Removed command link /usr/local/bin/${target}` });
      newLines.push({ type: 'output', text: `✓ Cleaned directory /opt/Application/${target}` });
      newLines.push({ type: 'success', text: `Package ${target} purged completely. 0 orphaned files remaining.` });
    } else {
      newLines.push({ type: 'output', text: `Executed: ${cleanCmd}` });
    }

    setTermLines(newLines);
    setTermInput('');
  };

  const adoptUnorganizedApp = (item: UnorganizedItem) => {
    const adoptedApp: AppItem = {
      id: item.id,
      name: item.name,
      category: item.suggestedCategory,
      version: 'latest',
      mode: item.mode,
      path: item.path,
      command: item.id,
      artifactsCount: item.mode === 'linked' ? 2 : 1,
      status: 'healthy',
    };
    setApps([...apps, adoptedApp]);
    setUnorganized(unorganized.filter(u => u.id !== item.id));
    showToast(`Adopted ${item.name} into ${item.suggestedCategory}`);
    runTerminalCommand(`depot adopt --app ${item.id} --category ${item.suggestedCategory}`);
  };

  const toggleService = (srv: ServiceItem) => {
    const nextStatus = srv.status === 'active' ? 'inactive' : 'active';
    const nextMem = nextStatus === 'active' ? 14.5 : 0;
    setServices(services.map(s => s.id === srv.id ? { ...s, status: nextStatus, memoryMb: nextMem } : s));
    const action = nextStatus === 'active' ? 'start' : 'stop';
    showToast(`Service ${srv.name} ${action}ed`);
    runTerminalCommand(`pkexec appdepot-helper service ${action} ${srv.unit}`);
  };

  const deleteApp = (app: AppItem) => {
    setApps(apps.filter(a => a.id !== app.id));
    setSelectedApp(null);
    showToast(`Uninstalled ${app.name} cleanly`);
    runTerminalCommand(`depot remove ${app.id} --yes`);
  };

  const handleInstallWizardFinish = () => {
    const newApp: AppItem = {
      id: 'custom-package',
      name: 'Custom Package',
      category: 'tools',
      version: '1.0.0',
      mode: 'managed',
      path: '/opt/Application/tools/custom-package',
      command: 'custom-package',
      artifactsCount: 3,
      status: 'healthy'
    };
    setApps([newApp, ...apps]);
    setSelectedApp(newApp);
    setIsWizardOpen(false);
    setWizardStep(1);
    runTerminalCommand('depot install custom-package.tar.gz --category tools');
  };

  return (
    <div className="app-container">
      {/* Toast */}
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
          <span className="brand-subtitle">Linux Developer Edition</span>
        </div>

        <div className="search-box">
          <Search size={14} color="#9aa3b2" />
          <input
            type="text"
            placeholder="Search apps, commands, categories... (Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="shortcut-chip">Ctrl+K</span>
        </div>

        <div className="header-actions">
          <div className="health-pill" style={{
            background: doctorFixed ? 'rgba(61, 214, 140, 0.15)' : 'rgba(245, 181, 74, 0.15)',
            color: doctorFixed ? '#3dd68c' : '#f5b54a',
            borderColor: doctorFixed ? 'rgba(61, 214, 140, 0.3)' : 'rgba(245, 181, 74, 0.3)',
          }}>
            <ShieldCheck size={14} />
            <span>Health {doctorFixed ? '100%' : '92%'}</span>
          </div>
          <button className="primary-btn" onClick={() => setIsWizardOpen(true)}>
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
              <span className="nav-count" style={{ color: doctorFixed ? '#3dd68c' : '#f5b54a' }}>
                {doctorFixed ? '✓' : '1'}
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
                  <span className="view-subtitle">{filteredApps.length} applications in library</span>
                </div>
                <div className="action-btn-group">
                  <button
                    className="sm-btn"
                    onClick={() => runTerminalCommand('depot adopt --scan')}
                  >
                    Scan System
                  </button>
                  <button
                    className="sm-btn"
                    onClick={() => setActiveTab('doctor')}
                  >
                    Run Health Audit
                  </button>
                </div>
              </div>

              {/* Cards Grid */}
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
                        <div className="app-version">v{app.version} · {app.command}</div>
                        <div className="badges-row">
                          <span className={`mode-badge ${app.mode}`}>{app.mode}</span>
                          {app.hasSandboxFix && (
                            <span className="mode-badge" style={{ background: 'rgba(245,181,74,0.15)', color: '#f5b54a' }}>
                              Sandbox 4755
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="path-preview mono">
                      {app.path}
                    </div>

                    <div className="card-footer">
                      <div className="status-indicator">
                        <div className="status-dot"></div>
                        <span>Ledger: {app.artifactsCount} artifacts</span>
                      </div>
                      <div className="action-btn-group">
                        <button
                          className="sm-btn"
                          title="Launch app"
                          onClick={(e) => {
                            e.stopPropagation();
                            runTerminalCommand(`${app.command} &`);
                          }}
                        >
                          <Play size={11} />
                        </button>
                        <button
                          className="sm-btn"
                          title="Inspect artifacts"
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
            </>
          )}

          {/* VIEW: Unorganized */}
          {activeTab === 'unorganized' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Unorganized System Applications</h1>
                  <span className="view-subtitle">Applications found on your host machine not yet registered in AppDepot</span>
                </div>
                <button className="primary-btn" onClick={() => {
                  unorganized.forEach(u => adoptUnorganizedApp(u));
                }}>
                  Auto-Organize All
                </button>
              </div>

              {unorganized.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa3b2' }}>
                  <CheckCircle2 size={48} color="#3dd68c" style={{ margin: '0 auto 12px' }} />
                  <h3>All System Applications Are Organized!</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>Every discovered desktop shortcut is linked into your library.</p>
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
                        <div style={{ fontSize: '11px', color: '#9aa3b2' }}>{item.detectedOwner} · <span className="mono">{item.path}</span></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="mode-badge" style={{ background: '#242832', color: '#9aa3b2' }}>
                        Suggested: {item.suggestedCategory}
                      </span>
                      <button className="primary-btn" onClick={() => adoptUnorganizedApp(item)}>
                        <span>Adopt App</span>
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
                  <span className="view-subtitle">Install, launch, and manage entire tech stacks as a single unit</span>
                </div>
                <button className="sm-btn" onClick={() => runTerminalCommand('depot export -o workstation.toml')}>
                  Export Workstation Manifest
                </button>
              </div>

              <div className="stacks-grid">
                <div className="stack-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Flutter Mobile</div>
                    <span className="health-pill">3 / 4 Ready</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2' }}>
                    Mobile cross-platform development stack with SDK, IDE, and build tools.
                  </p>
                  <div className="stack-chips-wrap">
                    <span className="stack-chip">✓ Flutter SDK</span>
                    <span className="stack-chip">✓ Android Studio</span>
                    <span className="stack-chip">✓ Google Chrome</span>
                    <span className="stack-chip" style={{ color: '#f5b54a' }}>○ cmake & ninja</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button className="primary-btn" style={{ flex: 1 }} onClick={() => runTerminalCommand('depot stack install flutter-mobile')}>
                      Install Stack
                    </button>
                    <button className="sm-btn" onClick={() => runTerminalCommand('depot stack launch flutter-mobile')}>
                      Launch All
                    </button>
                  </div>
                </div>

                <div className="stack-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Node Backend</div>
                    <span className="health-pill" style={{ color: '#3dd68c', background: 'rgba(61,214,140,0.15)' }}>4 / 4 Active</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2' }}>
                    Backend API environment with local caching and relational database services.
                  </p>
                  <div className="stack-chips-wrap">
                    <span className="stack-chip">✓ Node.js LTS</span>
                    <span className="stack-chip">✓ Redis Server</span>
                    <span className="stack-chip">✓ PostgreSQL</span>
                    <span className="stack-chip">✓ Git</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button className="primary-btn" style={{ flex: 1 }} onClick={() => runTerminalCommand('depot stack launch node-backend')}>
                      Start Services
                    </button>
                  </div>
                </div>

                <div className="stack-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>Java Enterprise</div>
                    <span className="health-pill" style={{ color: '#9aa3b2', background: '#232730' }}>Template</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2' }}>
                    Enterprise backend stack with OpenJDK 21, Maven, Gradle, and IntelliJ.
                  </p>
                  <div className="stack-chips-wrap">
                    <span className="stack-chip">○ OpenJDK 21</span>
                    <span className="stack-chip">○ Gradle</span>
                    <span className="stack-chip">○ Maven</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <button className="primary-btn" style={{ flex: 1 }} onClick={() => runTerminalCommand('depot stack install java-enterprise')}>
                      Install Stack
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
                  <h1 className="view-title">System Services Panel</h1>
                  <span className="view-subtitle">Start and stop background developer services on-demand to save system RAM</span>
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
                    <ShieldCheck size={24} color={doctorFixed ? '#3dd68c' : '#f5b54a'} />
                    <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                      Diagnostic Health: {doctorFixed ? '100% (Clean)' : '92% (1 Issue Detected)'}
                    </h2>
                  </div>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '4px' }}>
                    AppDepot Doctor monitors filesystem permissions, symlink integrity, sandbox setuid helpers, and shortcut validity.
                  </p>
                </div>
                {!doctorFixed && (
                  <button className="primary-btn" onClick={() => runTerminalCommand('depot doctor --fix')}>
                    <RotateCw size={14} />
                    <span>Fix All Issues</span>
                  </button>
                )}
              </div>

              <div className="doctor-check-row">
                <div className="doctor-check-left">
                  <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>D-001: Install Root & Developer Group Permissions</div>
                    <div style={{ fontSize: '11px', color: '#9aa3b2' }}>/opt/Application exists with ownership root:devtools and setgid mode 2775.</div>
                  </div>
                </div>
                <span className="health-pill">Passed</span>
              </div>

              <div className="doctor-check-row">
                <div className="doctor-check-left">
                  <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>D-003: Command Symlink Validation</div>
                    <div style={{ fontSize: '11px', color: '#9aa3b2' }}>All symlinks in /usr/local/bin point to real, executable binaries.</div>
                  </div>
                </div>
                <span className="health-pill">Passed</span>
              </div>

              <div className="doctor-check-row" style={{ borderColor: doctorFixed ? 'var(--border)' : 'rgba(245, 181, 74, 0.4)' }}>
                <div className="doctor-check-left">
                  {doctorFixed ? (
                    <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                  ) : (
                    <AlertTriangle size={16} color="#f5b54a" style={{ marginTop: '2px' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>D-005: Placeholder Icon Detection</div>
                    <div style={{ fontSize: '11px', color: doctorFixed ? '#9aa3b2' : '#f5b54a' }}>
                      {doctorFixed
                        ? 'All shortcut icon paths exist on disk. Monogram fallback generated.'
                        : 'Notice: Legacy shortcut contains placeholder icon path: /path/to/icon.png'}
                    </div>
                  </div>
                </div>
                {doctorFixed ? (
                  <span className="health-pill">Repaired</span>
                ) : (
                  <button className="sm-btn" onClick={() => runTerminalCommand('depot doctor --fix')}>
                    Repair Icon
                  </button>
                )}
              </div>

              <div className="doctor-check-row">
                <div className="doctor-check-left">
                  <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>D-006: Chromium Setuid Sandbox Audit</div>
                    <div style={{ fontSize: '11px', color: '#9aa3b2' }}>Antigravity chrome-sandbox has ownership root:root and permission mode 4755.</div>
                  </div>
                </div>
                <span className="health-pill">Passed</span>
              </div>

              <div className="doctor-check-row">
                <div className="doctor-check-left">
                  <CheckCircle2 size={16} color="#3dd68c" style={{ marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600 }}>D-007: Modular Environment Fragments</div>
                    <div style={{ fontSize: '11px', color: '#9aa3b2' }}>Loader in /etc/profile.d/appdepot.sh sources individual app fragments cleanly.</div>
                  </div>
                </div>
                <span className="health-pill">Passed</span>
              </div>
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
              <div className="terminal-tab">
                <span>install.log</span>
              </div>
            </div>
            <div style={{ color: '#6b7280', fontSize: '11px' }}>bash (PTY)</div>
          </div>

          <div className="teach-mode-banner">
            <Info size={13} />
            <span><strong>Teach Mode:</strong> Side-by-side terminal streams real POSIX commands.</span>
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
                placeholder="type a command (e.g. depot doctor)..."
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
                <div style={{ fontSize: '11px', color: '#9aa3b2' }}>v{selectedApp.version} · {selectedApp.command}</div>
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
                  {selectedApp.mode === 'managed' && 'AppDepot controls files, lifecycle, and uninstallation.'}
                  {selectedApp.mode === 'linked' && 'Files owned by external package manager. Linked without moving.'}
                  {selectedApp.mode === 'adopted' && 'System shortcut or sandbox application registered virtually.'}
                </span>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Filesystem Path</div>
              <div className="path-preview mono" style={{ fontSize: '11.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedApp.path}</span>
                <button title="Copy path" onClick={() => {
                  navigator.clipboard.writeText(selectedApp.path);
                  showToast('Path copied to clipboard');
                }}>
                  <Copy size={12} color="#9aa3b2" />
                </button>
              </div>
            </div>

            <div>
              <div className="drawer-section-title">Artifacts Ledger (SQLite)</div>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Recorded System Path</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>symlink</code></td>
                    <td className="mono">/usr/local/bin/{selectedApp.command}</td>
                  </tr>
                  <tr>
                    <td><code>desktop</code></td>
                    <td className="mono">/usr/share/applications/appdepot-{selectedApp.id}.desktop</td>
                  </tr>
                  <tr>
                    <td><code>env</code></td>
                    <td className="mono">/etc/profile.d/appdepot.d/{selectedApp.id}.sh</td>
                  </tr>
                  {selectedApp.hasSandboxFix && (
                    <tr>
                      <td><code>sandbox</code></td>
                      <td className="mono">{selectedApp.path}/chrome-sandbox (4755)</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="primary-btn"
                style={{ justifyContent: 'center' }}
                onClick={() => runTerminalCommand(`${selectedApp.command} &`)}
              >
                <Play size={14} />
                <span>Launch {selectedApp.name}</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="sm-btn"
                  style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => runTerminalCommand(`depot shortcut repair ${selectedApp.id}`)}
                >
                  <RotateCw size={12} />
                  <span>Repair Shortcut</span>
                </button>
                <button
                  className="sm-btn"
                  style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: '#ff6b6b' }}
                  onClick={() => deleteApp(selectedApp)}
                >
                  <Trash2 size={12} />
                  <span>Uninstall</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-Step Install Wizard Modal */}
      {isWizardOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">Package Installation Pipeline</div>
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
                  <span>Preview</span>
                </div>
                <div className={`step-item ${wizardStep >= 4 ? 'active' : ''}`}>
                  <div className="step-circle">4</div>
                  <span>Install</span>
                </div>
              </div>

              {wizardStep === 1 && (
                <div>
                  <div className="dropzone" onClick={() => setWizardStep(2)}>
                    <UploadCloud size={36} color="#3daee9" />
                    <strong>Drop a tarball, zip, .deb, or AppImage here</strong>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      Or click to load synthetic fixture: fixtures/electron-like.tar.gz
                    </span>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600, color: '#3daee9', marginBottom: '6px' }}>
                      Heuristic Analysis Results:
                    </div>
                    <div>• Executable: <code>antigravity-ide</code> (Score: <strong>+95</strong>, ELF binary)</div>
                    <div>• Candidate Icon: <code>resources/antigravity.svg</code> (Score: <strong>+105</strong>)</div>
                    <div>• Ignored extensions noise: <code>extensions/theme-dark/icon.png</code> (Rejected)</div>
                    <div>• Chromium sandbox detected: <code>chrome-sandbox</code> (Requires 4755 setuid)</div>
                    <div>• Suggested category: <code>ide</code></div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 600 }}>Planned Actions (Plan-then-Apply):</div>
                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                    <div style={{ color: '#3dd68c' }}>+ ExtractTo: /opt/Application/ide/antigravity</div>
                    <div style={{ color: '#3daee9' }}>+ Symlink: /usr/local/bin/antigravity</div>
                    <div style={{ color: '#a78bfa' }}>+ DesktopEntry: /usr/share/applications/appdepot-antigravity.desktop</div>
                    <div style={{ color: '#f5b54a' }}>+ SetSandbox: chmod 4755 chrome-sandbox (via helper)</div>
                    <div style={{ color: '#9ca3af' }}>+ EnvFragment: /etc/profile.d/appdepot.d/antigravity.sh</div>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={42} color="#3dd68c" style={{ margin: '0 auto 12px auto' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Package Wired Successfully!</h3>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '6px' }}>
                    Application is ready in the menu and executable from any terminal.
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizardStep > 1 && wizardStep < 4 && (
                <button className="sm-btn" onClick={() => setWizardStep(wizardStep - 1)}>
                  Back
                </button>
              )}
              {wizardStep < 3 && (
                <button className="primary-btn" onClick={() => setWizardStep(wizardStep + 1)}>
                  Next Step <ChevronRight size={14} />
                </button>
              )}
              {wizardStep === 3 && (
                <button className="primary-btn" onClick={() => setWizardStep(4)}>
                  Execute Plan & Install
                </button>
              )}
              {wizardStep === 4 && (
                <button className="primary-btn" onClick={handleInstallWizardFinish}>
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
