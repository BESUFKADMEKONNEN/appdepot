# End-to-End System Test & Verification Guide 🧪

> **Step-by-step verification walkthrough for AppDepot**
>
> Follow this guide to verify the complete end-to-end lifecycle: installing a package/software, inspecting it live through AppDepot, verifying zero-hardcoding detection, and completely uninstalling it using the system.

---

## 🎯 Verification Overview

This test suite covers two core management workflows:

| Test Case | Type | What We Are Verifying |
| :--- | :--- | :--- |
| **Test 1: System Package Workflow** | Host Package (`apt`/`dpkg`) | Install via package manager → real-time discovery in **System Packages** → inspect files (`dpkg -L`) → uninstall directly from AppDepot UI. |
| **Test 2: Managed Portable App Workflow** | Directory / Archive in `/opt/Application` | Add a new portable tool → kernel **inotify live detection** without refresh → inspect artifacts ledger → 1-click clean uninstallation. |
| **Test 3: Live Service Telemetry** | Systemd Service (`systemctl`) | View running vs. stopped services → live start/stop/restart control → inspect memory & `journalctl` stream. |

---

## 🚀 Pre-requisite: Start AppDepot

Make sure AppDepot is running:
```bash
cd /home/besu/projects/appdepotforlinux
./start.sh
```
Open **`http://127.0.0.1:5173/`** in your browser.

---

## 🧪 Test 1: System Package Lifecycle (Install → Check → Uninstall)

We will use a lightweight, safe Linux utility such as **`cowsay`** or **`sl`** to test host package management.

### Step 1: Install the Package
In the AppDepot **Docked Terminal** on the right side of the screen (or in any terminal), run:
```bash
sudo apt update && sudo apt install -y cowsay
```

### Step 2: Verify Real-Time Detection in AppDepot
1. Click the **"System Packages"** tab in the left navigation sidebar.
2. Notice the total packages counter has incremented (e.g., `2,721 packages`).
3. In the Package search bar, type:
   ```
   cowsay
   ```
4. **Verify the Results**:
   * Package Name: `cowsay`
   * Type Badge: `DEB`
   * Version: Shows current installed version
   * Section: `games`
   * Size: Shows real installed disk footprint
   * Summary: Shows official Debian/Ubuntu description
5. Click on the **`cowsay`** row to open the **Package Detail Drawer**:
   * Click **"List Files"**: Runs `dpkg -L cowsay` to list all files installed across `/usr/games`, `/usr/share/cowsay`, etc.
   * Click **"Status"**: Inspects `dpkg -s cowsay` to verify package health.
   * Click **"Check Dependencies"**: Shows `apt-cache depends cowsay`.

### Step 3: Uninstall using AppDepot
1. In the open **Package Detail Drawer** for `cowsay`, click the red button:
   ```
   [🗑️ Uninstall / Remove from System]
   ```
2. Confirm the prompt.
3. AppDepot automatically sends the elevation command to the terminal:
   ```bash
   pkexec apt remove -y cowsay
   ```
4. Enter your system password if prompted.
5. **Verify Complete Removal**:
   * Click **"Refresh Packages"** or switch tabs.
   * Search for `cowsay` — it is completely gone from the system package database.

---

## 🧪 Test 2: Portable App Lifecycle (Zero-Hardcoding Inotify Test)

This test proves that **any software added to the system now or in the future is automatically discovered with zero hardcoding**.

### Step 1: Create and Install a Test Portable Application
Run this one-line command in your terminal to create a test application in `/opt/Application/tools/`:

```bash
# 1. Create a clean test application folder
sudo mkdir -p /opt/Application/tools/demotool-v1

# 2. Write an executable test script inside it
sudo tee /opt/Application/tools/demotool-v1/demotool > /dev/null << 'EOF'
#!/usr/bin/env bash
echo "=========================================="
echo "  DemoTool v1.0 running on AppDepot!"
echo "  System Time: $(date)"
echo "=========================================="
EOF

# 3. Make it executable
sudo chmod +x /opt/Application/tools/demotool-v1/demotool
```

### Step 2: Verify Real-Time Discovery in the GUI
1. Switch to the AppDepot window and click **"Library"** in the sidebar.
2. Select the **"System Tools"** category or **"All Applications"**.
3. **Observe**:
   * `demotool-v1` appears immediately in the grid.
   * Badge: shows `MANAGED`.
   * Size: Real disk usage is calculated and displayed.
   * Status: Green `healthy` indicator.
4. Click on `demotool-v1` to open the **Detail Drawer**:
   * Target Path: `/opt/Application/tools/demotool-v1`
   * Executable Path: `/opt/Application/tools/demotool-v1/demotool`
   * Click **"Launch App"** or run in terminal: the tool executes live!

### Step 3: Uninstall the App using AppDepot
1. In the `demotool-v1` Detail Drawer, scroll down and click:
   ```
   [🗑️ Uninstall App]
   ```
2. Confirm the dialog.
3. AppDepot cleanly deletes `/opt/Application/tools/demotool-v1` and removes all symlinks.
4. The card immediately disappears from your GUI.

---

## 🧪 Test 3: Systemd Services Lifecycle (Running vs. Closed)

This test verifies that AppDepot manages all **running and closed services** on your machine.

### Step 1: Filter Between Running & Stopped Services
1. Click **"Live Services"** in the left navigation sidebar.
2. Notice the total count (e.g., `107 services`).
3. Click the filter chips at the top:
   * **`All (107)`**: Shows all registered systemd service units.
   * **`Running (49)`**: Shows only active services with green status dots and live memory usage.
   * **`Stopped / Closed (58)`**: Shows inactive/closed services with gray status dots.

### Step 2: Test Live Service Control
1. In the Service Search box, type:
   ```
   cron
   ```
   (or search for `bluetooth`, `cups`, or `accounts-daemon`).
2. Observe the current state:
   * Status: `Active` (green)
   * Unit: `cron.service`
3. Click the **`Stop`** button:
   * AppDepot executes `systemctl stop cron.service`.
   * The status dot turns gray, and the badge changes to `Stopped / Closed`.
4. Click the **`Logs`** button (file icon):
   * AppDepot streams the real-time journal logs (`journalctl -u cron.service -n 40`) directly into the docked terminal.
5. Click the **`Start`** button:
   * The service starts back up, the status dot turns green, and live RSS memory is restored.

---

## ✅ Verification Checklist

After running these 3 tests, you have verified:

- [x] **Zero Hardcoding**: Dynamic scanner caught newly added software without any pre-existing list or configuration.
- [x] **System Package Control**: Installed an APT package, searched it, inspected its file ledger, and uninstalled it.
- [x] **Inotify Real-Time Kernel Watcher**: New files in `/opt/Application` appeared automatically via Server-Sent Events (SSE).
- [x] **Closed & Running Services**: Filtered and controlled all 107 systemd services (start, stop, restart, logs).
- [x] **Clean Removal**: Uninstalled packages leave no orphaned files, broken symlinks, or leftover directories.
