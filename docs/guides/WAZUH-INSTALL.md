# Installing Wazuh — A Beginner's Guide

This guide walks you through installing **Wazuh** from scratch so you can connect it to Dang! SIEM. No prior Wazuh experience required.

---

## What is Wazuh?

**Wazuh** is a free, open-source security platform that monitors your servers, laptops, and cloud infrastructure for threats. It does three things:

1. **Watches your machines** — You install a lightweight "agent" on each server or workstation. The agent monitors file changes, running processes, open ports, installed software, and system logs.
2. **Detects threats** — A central "manager" receives data from all agents, applies thousands of built-in detection rules, and generates security alerts (brute-force attempts, malware signatures, privilege escalation, suspicious file modifications, etc.).
3. **Stores everything** — An "indexer" (based on OpenSearch) stores all alerts and logs so you can search and analyze them later.

**Dang! SIEM** connects to your Wazuh deployment and gives you a modern analyst interface on top of it — dashboards, investigation tools, an AI-powered triage pipeline, and more. Dang! is read-only and never modifies your Wazuh data.

### Wazuh Components

| Component | What It Does | Default Port |
|---|---|---|
| **Wazuh Manager** | Receives agent data, runs detection rules, exposes the REST API | `55000` (API), `1514`/`1515` (agent comms) |
| **Wazuh Indexer** | Stores alerts and logs (OpenSearch under the hood) | `9200` |
| **Wazuh Dashboard** | Wazuh's own web UI (optional — Dang! replaces this) | `443` |
| **Wazuh Agent** | Runs on each monitored machine, sends data to the Manager | — |

Dang! needs the **Manager API** (port 55000) and the **Indexer** (port 9200). The Dashboard is optional.

---

## Choose Your Installation Method

| Method | Best For | Difficulty | Time |
|---|---|---|---|
| [Docker (Recommended)](#option-a-docker-recommended) | Testing, development, small deployments | Easy | ~10 min |
| [Quick Install Script](#option-b-quick-install-script) | Production single-node deployments | Easy | ~15 min |
| [Step-by-Step Packages](#option-c-step-by-step-packages) | Production, full control, multi-node clusters | Moderate | ~30 min |

---

## Option A: Docker (Recommended)

The fastest way to get Wazuh running. Spins up the Manager, Indexer, and Dashboard in Docker containers.

### Prerequisites

- **Docker** 24.0+ and **Docker Compose** v2.20+
- **6 GB RAM** minimum (Indexer is memory-hungry)
- **Linux, macOS, or WSL2** (Windows users: use WSL2)

### Steps

```bash
# 1. Clone the Wazuh Docker repository
git clone https://github.com/wazuh/wazuh-docker.git -b v4.9.2
cd wazuh-docker/single-node

# 2. Generate self-signed certificates for the Wazuh stack
docker compose -f generate-indexer-certs.yml run --rm generator

# 3. Start all Wazuh services
docker compose up -d
```

Wait 2–3 minutes for all services to initialize, then verify:

```bash
# Check all containers are healthy
docker compose ps
```

You should see three containers running: `wazuh.manager`, `wazuh.indexer`, and `wazuh.dashboard`.

### Default Credentials

| Service | Username | Password |
|---|---|---|
| Wazuh API (Manager) | `wazuh-wui` | `MyS3cr37P450r.*-` |
| Wazuh Indexer | `admin` | `SecretPassword` |
| Wazuh Dashboard | `admin` | `SecretPassword` |

### Verify the API Is Working

```bash
# Test the Wazuh Manager API (from the Docker host)
curl -k -u wazuh-wui:MyS3cr37P450r.*- https://localhost:55000/?pretty

# Expected output:
# {
#   "data": {
#     "title": "Wazuh API REST",
#     "api_version": "4.9.2",
#     ...
#   }
# }
```

```bash
# Test the Wazuh Indexer
curl -k -u admin:SecretPassword https://localhost:9200/_cluster/health?pretty

# Expected output:
# {
#   "cluster_name": "wazuh-cluster",
#   "status": "green",
#   ...
# }
```

### Connect Dang! to Docker Wazuh

If Dang! and Wazuh are on the **same machine**, edit your Dang! `.env` file:

```bash
# Wazuh Manager API
WAZUH_HOST=host.docker.internal    # or your machine's LAN IP (e.g., 192.168.1.100)
WAZUH_PORT=55000
WAZUH_USER=wazuh-wui
WAZUH_PASS=MyS3cr37P450r.*-

# Wazuh Indexer
WAZUH_INDEXER_HOST=host.docker.internal    # or your machine's LAN IP
WAZUH_INDEXER_PORT=9200
WAZUH_INDEXER_USER=admin
WAZUH_INDEXER_PASS=SecretPassword
WAZUH_INDEXER_PROTOCOL=https
```

> **Note:** `host.docker.internal` works on Docker Desktop (macOS/Windows). On Linux, use your machine's actual IP address (run `hostname -I | awk '{print $1}'` to find it). Do NOT use `localhost` — that refers to the Dang! container itself, not the host machine.

If Dang! and Wazuh are on **different machines**, replace the hostnames with the Wazuh server's IP address.

### Changing Default Passwords (Recommended)

The default passwords are published in the Wazuh documentation and should be changed:

```bash
cd wazuh-docker/single-node

# Stop the stack
docker compose down

# Edit docker-compose.yml and change:
#   INDEXER_PASSWORD, DASHBOARD_PASSWORD, API_PASSWORD
# Then regenerate certificates if needed

# Restart
docker compose up -d
```

See the [Wazuh Docker documentation](https://documentation.wazuh.com/current/deployment-options/docker/index.html) for password change procedures.

---

## Option B: Quick Install Script

Wazuh provides an all-in-one install script that sets up everything on a single Linux server. This is the recommended approach for production single-node deployments.

### Prerequisites

- **Ubuntu 22.04/24.04**, **CentOS 7/8**, **RHEL 7/8/9**, **Amazon Linux 2**, or **Debian 10/11/12**
- **4 GB RAM** minimum (8 GB recommended)
- **Root or sudo access**
- **Open ports:** 1514, 1515, 55000, 9200, 443

### Steps

```bash
# 1. Download and run the Wazuh installer
curl -sO https://packages.wazuh.com/4.9/wazuh-install.sh
sudo bash wazuh-install.sh -a
```

The `-a` flag installs everything: Manager, Indexer, and Dashboard on a single node.

The installer will:
- Install all Wazuh components
- Generate self-signed TLS certificates
- Configure all services
- Print credentials at the end — **save these!**

### Save Your Credentials

At the end of installation, the script prints something like:

```
INFO: --- Summary ---
INFO: You can access the web interface https://<YOUR-IP>
   User: admin
   Password: <RANDOM-PASSWORD>

INFO: Wazuh API credentials:
   User: wazuh-wui
   Password: <RANDOM-PASSWORD>
```

**Write these down.** You need them for Dang! configuration.

If you lose the passwords, you can extract them:

```bash
# Extract stored passwords
sudo tar -xvf wazuh-install-files.tar wazuh-install-files/wazuh-passwords.txt
cat wazuh-install-files/wazuh-passwords.txt
```

### Verify the Installation

```bash
# Check services are running
sudo systemctl status wazuh-manager
sudo systemctl status wazuh-indexer
sudo systemctl status wazuh-dashboard

# Test the API
curl -k -u wazuh-wui:<API-PASSWORD> https://localhost:55000/?pretty

# Test the Indexer
curl -k -u admin:<INDEXER-PASSWORD> https://localhost:9200/_cluster/health?pretty
```

### Connect Dang! to This Server

Edit your Dang! `.env` file with the Wazuh server's IP and the credentials from the install summary:

```bash
WAZUH_HOST=<WAZUH-SERVER-IP>
WAZUH_PORT=55000
WAZUH_USER=wazuh-wui
WAZUH_PASS=<API-PASSWORD-FROM-INSTALL>

WAZUH_INDEXER_HOST=<WAZUH-SERVER-IP>
WAZUH_INDEXER_PORT=9200
WAZUH_INDEXER_USER=admin
WAZUH_INDEXER_PASS=<INDEXER-PASSWORD-FROM-INSTALL>
WAZUH_INDEXER_PROTOCOL=https
```

---

## Option C: Step-by-Step Packages

For full control over each component. Follow the official Wazuh documentation:

1. **Install the Wazuh Indexer:** [documentation.wazuh.com/current/installation-guide/wazuh-indexer/](https://documentation.wazuh.com/current/installation-guide/wazuh-indexer/index.html)
2. **Install the Wazuh Server (Manager):** [documentation.wazuh.com/current/installation-guide/wazuh-server/](https://documentation.wazuh.com/current/installation-guide/wazuh-server/index.html)
3. **Install the Wazuh Dashboard (optional):** [documentation.wazuh.com/current/installation-guide/wazuh-dashboard/](https://documentation.wazuh.com/current/installation-guide/wazuh-dashboard/index.html)

---

## Installing Wazuh Agents

Wazuh doesn't generate useful data until you install agents on the machines you want to monitor. Without agents, Dang! will show an empty fleet and no alerts.

### Linux Agent

```bash
# Ubuntu/Debian
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && chmod 644 /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list
apt-get update && apt-get install wazuh-agent

# CentOS/RHEL
rpm --import https://packages.wazuh.com/key/GPG-KEY-WAZUH
cat > /etc/yum.repos.d/wazuh.repo << 'EOF'
[wazuh]
gpgcheck=1
gpgkey=https://packages.wazuh.com/key/GPG-KEY-WAZUH
enabled=1
name=Wazuh repository
baseurl=https://packages.wazuh.com/4.x/yum/
protect=1
EOF
yum install wazuh-agent
```

After installing, configure the agent to point at your Manager:

```bash
# Edit the agent config
sudo nano /var/ossec/etc/ossec.conf

# Find the <server> section and set your Manager's IP:
#   <server>
#     <address>YOUR-WAZUH-MANAGER-IP</address>
#   </server>

# Start the agent
sudo systemctl daemon-reload
sudo systemctl enable wazuh-agent
sudo systemctl start wazuh-agent
```

### Windows Agent

1. Download the MSI installer from [packages.wazuh.com/4.x/windows/wazuh-agent-4.9.2-1.msi](https://packages.wazuh.com/4.x/windows/wazuh-agent-4.9.2-1.msi)
2. Run the installer — it will ask for the Manager IP address
3. Start the service: `net start WazuhSvc`

Or install silently via PowerShell:

```powershell
Invoke-WebRequest -Uri https://packages.wazuh.com/4.x/windows/wazuh-agent-4.9.2-1.msi -OutFile wazuh-agent.msi
msiexec.exe /i wazuh-agent.msi /q WAZUH_MANAGER="YOUR-WAZUH-MANAGER-IP"
net start WazuhSvc
```

### macOS Agent

```bash
# Download and install
curl -so wazuh-agent.pkg https://packages.wazuh.com/4.x/macos/wazuh-agent-4.9.2-1.pkg
sudo installer -pkg wazuh-agent.pkg -target /

# Configure
sudo /Library/Ossec/bin/agent-auth -m YOUR-WAZUH-MANAGER-IP

# Start
sudo /Library/Ossec/bin/wazuh-control start
```

### Verify Agent Registration

After starting an agent, verify it registered with the Manager:

```bash
# On the Wazuh Manager (or via API)
curl -k -u wazuh-wui:<PASSWORD> https://localhost:55000/agents?pretty

# You should see your agent listed with status "active"
```

In Dang!, go to **Fleet Command** (`/agents`) — your new agent should appear within 30 seconds.

---

## Generating Test Data

A fresh Wazuh install with agents will start generating real alerts immediately (authentication events, file integrity changes, vulnerability scans). To see meaningful data in Dang! faster:

```bash
# On a monitored machine with a Wazuh agent, trigger some test alerts:

# Failed SSH login (generates authentication alerts)
ssh nonexistentuser@localhost

# File integrity change (if FIM is enabled on /etc)
sudo touch /etc/test-fim-trigger && sudo rm /etc/test-fim-trigger

# Brute force simulation (generates rule 5710+ alerts)
for i in {1..10}; do ssh baduser@localhost; done 2>/dev/null
```

Within a few minutes, these events will appear in Dang! on the **Alerts Timeline** (`/alerts`) and **SIEM Events** (`/siem`) pages.

---

## Network Diagram

Here's how all the pieces fit together:

```
  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │  Linux Server    │     │  Windows PC      │     │  macOS Laptop    │
  │  (Wazuh Agent)   │     │  (Wazuh Agent)   │     │  (Wazuh Agent)   │
  └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
           │ :1514                  │ :1514                  │ :1514
           └────────────┬───────────┴────────────────────────┘
                        ▼
              ┌─────────────────────┐
              │   Wazuh Manager     │   ← Receives agent data, runs detection rules
              │   :55000 (API)      │
              │   :1514  (agents)   │
              └────────┬────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │   Wazuh Indexer     │   ← Stores all alerts & logs (OpenSearch)
              │   :9200             │
              └────────┬────────────┘
                       │
                       │  Dang! connects here
                       ▼
              ┌─────────────────────┐
              │   Dang! SIEM        │   ← Your analyst interface
              │   :3000             │
              └─────────────────────┘
                       │
                       ▼
                   Browser
```

---

## Troubleshooting

### "Connection refused" on port 55000

The Wazuh Manager API may not be running or may be blocked by a firewall.

```bash
# Check if the API is listening
sudo ss -tlnp | grep 55000

# If not running, restart the manager
sudo systemctl restart wazuh-manager

# Check firewall
sudo ufw status                    # Ubuntu
sudo firewall-cmd --list-ports     # CentOS/RHEL
```

### "Connection refused" on port 9200

The Indexer needs time to start (30–60 seconds) and requires sufficient memory.

```bash
# Check if the Indexer is listening
sudo ss -tlnp | grep 9200

# Check Indexer logs for memory errors
sudo cat /var/log/wazuh-indexer/wazuh-cluster.log | tail -50

# The Indexer needs at least 2 GB of heap. Check with:
sudo cat /etc/wazuh-indexer/jvm.options | grep -E "^-Xm"
```

### Agents not appearing

```bash
# On the agent machine, check the agent is running
sudo systemctl status wazuh-agent

# Check agent logs for connection errors
sudo tail -50 /var/ossec/logs/ossec.log

# Common fix: ensure the agent config has the correct Manager IP
sudo grep -A2 '<server>' /var/ossec/etc/ossec.conf
```

### "Certificate verify failed"

Wazuh uses self-signed certificates by default. Dang! handles this automatically (`SKIP_TLS_VERIFY=true` in `.env`). If you're testing with `curl`, add the `-k` flag.

### Docker: Indexer keeps restarting

The Indexer (OpenSearch) requires `vm.max_map_count` to be at least 262144:

```bash
# Check current value
sysctl vm.max_map_count

# Set it (temporary — resets on reboot)
sudo sysctl -w vm.max_map_count=262144

# Set it permanently
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## What's Next?

Once Wazuh is running and you have your credentials, head back to the main [README](README.md) or [DOCKER.md](DOCKER.md) to deploy Dang! SIEM and connect it to your Wazuh instance.

```bash
# Quick recap — what you need for Dang!'s .env file:
WAZUH_HOST=<manager IP>       # Where the Wazuh Manager is running
WAZUH_PORT=55000              # Default API port
WAZUH_USER=wazuh-wui          # API username
WAZUH_PASS=<your password>    # From install output or docker-compose.yml

WAZUH_INDEXER_HOST=<indexer IP>   # Usually same machine as Manager
WAZUH_INDEXER_PORT=9200           # Default Indexer port
WAZUH_INDEXER_USER=admin          # Default Indexer username
WAZUH_INDEXER_PASS=<your password>
WAZUH_INDEXER_PROTOCOL=https
```
