# MikroTik Hotspot Dashboard 🚀

A real-time, mobile-first dashboard for monitoring and managing MikroTik RouterOS v7 Hotspots. Designed specifically to make managing users, active sessions, speed limits, and system health incredibly fast directly from your phone or desktop.

Built uniquely as an interface strictly over the modern MikroTik REST API, avoiding direct device exposure and bridging the gap with a beautifully themed, glassmorphism UI.

## ✨ Features
* **Real-time Health Monitoring:** Live polling for CPU, RAM, Uptime, and graphical Interface traffic stats.
* **Hotspot Active Sessions:** View connected users sorted seamlessly by downloads, uploads, or session time. 
* **One-Click Disconnects:** Terminate active users effortlessly to force them to re-authenticate or apply new configurations. 
* **Smart User Management:** Add/Edit/Delete users, securely assign Data Limits (e.g. `2G`, `500M`), enforce MAC Authentication, and attach precise Speed Profiles fetched directly from your router.
* **Hosts View:** Automatically trace connected unauthorized and authorized Hosts natively.
* **REST API Proxy:** Solves strict CORS policies out of the box using an Express proxy to securely tunnel traffic to RouterOS v7.
* **Basic Authentication Lock:** Out-of-the-box HTTP Basic Auth implemented on the backend to prevent unauthorized local-network spying.

---

## 🛠 Tech Stack
* **Frontend:** Vanilla JS + Vite SPA (Single Page Application) + Custom Glassmorphism CSS. 
* **Backend:** Node.js + Express (serving as a secure authentication middleware, proxy, and Server-Sent Events handler).

---

## 🚀 Getting Started

### Prerequisites
* A MikroTik Router running **RouterOS v7+**.
* Ensure the **REST API** is active on your router (`/ip service enable www` or `www-ssl`).
* Node.js v18+ installed on the host machine.

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/mikrotik-hotspot-dashboard.git
   cd mikrotik-hotspot-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup your Environment File:
   * Create a `.env` file in the root based on your router credentials.
   ```ini
   # MikroTik Router Connection
   ROUTER_IP=10.10.10.1:8081
   ROUTER_PROTOCOL=http
   ROUTER_USER=admin
   ROUTER_PASS=your_router_password
   
   # Dashboard Server Settings
   PORT=3000
   
   # Web GUI Security (so nobody on your network can snoop)
   DASHBOARD_USER=admin
   DASHBOARD_PASS=your_dashboard_secret
   ```

### Running in Development
To boot up the Vite HMR server alongside the Express backend concurrently:
```bash
npm run dev
```

### Deploying to Production (Self-Hosted)
Compile the Vite frontend into a static bundle, and serve it directly via Express:

```bash
npm run build
NODE_ENV=production node server.js
```
*We highly recommend using [PM2](https://pm2.keymetrics.io/) to keep the server running perpetually on your Linux box!*

---

## ⚠️ Known MikroTik Quirks Handled
* **Upload vs Download Mapping:** In typical RouterOS, `bytes-in` is physically Received (from the client's perspective: Uploaded), and `bytes-out` is physically Transmitted (from the client's perspective: Downloaded). The UI flawlessly flips these metrics natively so "Downloaded" and "Uploaded" are human-readable.
* **Profile-based Rate Limiting:** As of RouterOS v7, individual Users no longer possess a `rate-limit` attribute. The Dashboard elegantly solves this by fetching your pre-configured Router Profiles! 

---

## 🤝 Contributing
Issues and Pull Requests are always welcome! Feel free to add support for queued speed monitoring, automated Profile generation, or additional Mikrotik sub-systems. 
