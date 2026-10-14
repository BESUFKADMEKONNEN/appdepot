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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedApp, setSelectedApp] = useState<AppItem | null>(apps[0]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'library' | 'unorganized' | 'stacks' | 'services' | 'doctor'>('library');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [termLines, setTermLines] = useState<Array<{ type: 'cmd' | 'output' | 'success' | 'info'; text: string }>>([
    { type: 'info', text: 'AppDepot Linux Subsystem v0.1.0 (connected)' },
    { type: 'output', text: 'Install root: /opt/Application (mode: 2775 devtools)' },
    { type: 'output', text: 'Type "help", "depot list", or "depot doctor" to interact.' },
  ]);
  const [termInput, setTermInput] = useState('');

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
      newLines.push({ type: 'info', text: 'All 6 diagnostic checks passed successfully.' });
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
    } else if (cleanCmd.startsWith('depot install')) {
      newLines.push({ type: 'info', text: 'Executing 9-stage transactional install pipeline...' });
      newLines.push({ type: 'output', text: 'Stage 1-3: Verified SHA-256 and unpacked staging directory.' });
      newLines.push({ type: 'output', text: 'Stage 4: Heuristics scored ELF binary (+50) and SVG icon (+50).' });
      newLines.push({ type: 'success', text: 'Stage 5: Created .desktop shortcut & /usr/local/bin symlink.' });
      newLines.push({ type: 'success', text: '✓ Installation completed cleanly.' });
    } else {
      newLines.push({ type: 'output', text: `Executed: ${cleanCmd}` });
    }

    setTermLines(newLines);
    setTermInput('');
  };

  const handleInstallWizardFinish = () => {
    const newApp: AppItem = {
      id: 'demo-app',
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
          <div className="health-pill">
            <ShieldCheck size={14} />
            <span>Health 98%</span>
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
              <span className="nav-count">2</span>
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
              <span className="nav-count">2</span>
            </button>
            <button
              className={`nav-item ${activeTab === 'doctor' ? 'active' : ''}`}
              onClick={() => setActiveTab('doctor')}
            >
              <div className="nav-item-left">
                <Stethoscope size={15} />
                <span>Doctor Health</span>
              </div>
              <span className="nav-count">0</span>
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
                  className={`nav-item ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
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

        {/* Center Application Library */}
        <main className="center-content">
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
                onClick={() => runTerminalCommand('depot doctor')}
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
                        runTerminalCommand(`depot info ${app.id}`);
                      }}
                    >
                      <Info size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
