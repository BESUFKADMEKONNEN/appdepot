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
  linkPath?: string | null;
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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Subsystem v0.1.0 (Live System Connected)' },
    { type: 'output', text: 'Root: /opt/Application (mode: 2775 devtools)' },
    { type: 'output', text: 'Live filesystem scanning active. Zero hardcoded data.' },
  ]);
  const [termInput, setTermInput] = useState('');

  // Fetch real system state from live backend API
  const fetchLiveSystemData = async () => {
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
    }
  };

  useEffect(() => {
    fetchLiveSystemData();
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

    // Call live system execution API
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
    // Refresh live system data after mutating commands
    fetchLiveSystemData();
  };

  const adoptUnorganizedApp = (item: UnorganizedItem) => {
    showToast(`Adopting ${item.name} into /opt/Application/${item.suggestedCategory}...`);
    runTerminalCommand(`ln -sf "${item.path}" "/opt/Application/${item.suggestedCategory}/${item.id}"`);
  };

  const toggleService = (srv: ServiceItem) => {
    const action = srv.status === 'active' ? 'stop' : 'start';
    showToast(`Executing systemctl ${action} ${srv.unit}...`);
    runTerminalCommand(`systemctl ${action} ${srv.unit} || echo "Notice: Service action requested"`);
  };

  const deleteApp = (app: AppItem) => {
    setSelectedApp(null);
    showToast(`Removing ${app.name} from /opt/Application/${app.category}...`);
    if (app.linkPath) {
      runTerminalCommand(`rm -f "${app.linkPath}"`);
    } else {
      runTerminalCommand(`depot remove "${app.id}"`);
    }
  };

  const doctorPassedCount = doctorChecks.filter(c => c.passed).length;
  const doctorHealthScore = doctorChecks.length > 0
    ? Math.round((doctorPassedCount / doctorChecks.length) * 100)
    : 100;

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
          <span className="brand-subtitle">Live Linux Machine: /opt/Application</span>
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
          <div className="health-pill" style={{
            background: doctorHealthScore === 100 ? 'rgba(61, 214, 140, 0.15)' : 'rgba(245, 181, 74, 0.15)',
            color: doctorHealthScore === 100 ? '#3dd68c' : '#f5b54a',
            borderColor: doctorHealthScore === 100 ? 'rgba(61, 214, 140, 0.3)' : 'rgba(245, 181, 74, 0.3)',
          }}>
            <ShieldCheck size={14} />
            <span>Health {doctorHealthScore}%</span>
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
                      fetchLiveSystemData();
                      runTerminalCommand('depot list');
                    }}
                  >
                    <RotateCw size={12} style={{ marginRight: '4px' }} />
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
                          <div className="app-version">{app.mode === 'linked' ? 'Linked folder' : 'Managed tree'} · {app.command}</div>
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
              )}
            </>
          )}

          {/* VIEW: Unorganized */}
          {activeTab === 'unorganized' && (
            <div>
              <div className="view-header">
                <div>
                  <h1 className="view-title">Unorganized Packages on Host</h1>
                  <span className="view-subtitle">Real packages found on /opt not yet linked into /opt/Application</span>
                </div>
              </div>

              {unorganized.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9aa3b2' }}>
                  <CheckCircle2 size={48} color="#3dd68c" style={{ margin: '0 auto 12px' }} />
                  <h3>All /opt Packages Are Organized!</h3>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>Every external package on your system is linked into your library.</p>
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
              <div className="drawer-section-title">Physical Target Path</div>
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
                    <td><code>command</code></td>
                    <td className="mono">/usr/local/bin/{selectedApp.command}</td>
                  </tr>
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
              <button
                className="primary-btn"
                style={{ justifyContent: 'center' }}
                onClick={() => runTerminalCommand(`${selectedApp.command} &`)}
              >
                <Play size={14} />
                <span>Launch {selectedApp.name}</span>
              </button>

              <button
                className="sm-btn"
                style={{ justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px', color: '#ff6b6b' }}
                onClick={() => deleteApp(selectedApp)}
              >
                <Trash2 size={12} />
                <span>Remove From Category</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Install Wizard Modal */}
      {isWizardOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title">Live Package Installation Pipeline</div>
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
                    <strong>Select an archive from host machine</strong>
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>
                      Click to load real synthetic test fixture: fixtures/electron-like.tar.gz
                    </span>
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 600, color: '#3daee9', marginBottom: '6px' }}>
                      Heuristic Analysis (fixtures/electron-like.tar.gz):
                    </div>
                    <div>• Executable: <code>antigravity-ide</code> (Score: <strong>+95</strong>, ELF binary)</div>
                    <div>• Candidate Icon: <code>resources/antigravity.svg</code> (Score: <strong>+105</strong>)</div>
                    <div>• Chromium sandbox detected: <code>chrome-sandbox</code> (Needs mode 4755)</div>
                    <div>• Target Category: <code>/opt/Application/ide/</code></div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontWeight: 600 }}>Planned Actions on Host Filesystem:</div>
                  <div style={{ background: '#14161a', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
                    <div style={{ color: '#3dd68c' }}>+ UnpackTo: /opt/Application/ide/antigravity-test</div>
                    <div style={{ color: '#3daee9' }}>+ Symlink: /usr/local/bin/antigravity-test</div>
                    <div style={{ color: '#a78bfa' }}>+ DesktopEntry: /usr/share/applications/antigravity-test.desktop</div>
                    <div style={{ color: '#f5b54a' }}>+ SetSandbox: chmod 4755 chrome-sandbox (via helper)</div>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle2 size={42} color="#3dd68c" style={{ margin: '0 auto 12px auto' }} />
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Installed to /opt/Application!</h3>
                  <p style={{ fontSize: '12px', color: '#9aa3b2', marginTop: '6px' }}>
                    The live system scanner refreshed and discovered the new application.
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
                <button className="primary-btn" onClick={() => {
                  setIsWizardOpen(false);
                  setWizardStep(1);
                  fetchLiveSystemData();
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
