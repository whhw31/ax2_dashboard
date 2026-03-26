# MikroTik hAP ax2 Dashboard Deployment Guide

This guide explains how to properly build and host this Hotspot Dashboard on your Linux machine so it can be accessed from any device (like your mobile phone) on your router's local network (LAN).

## 1. Prerequisites
- **Node.js**: Ensure Node.js (v18+) is installed on your Linux machine.
- **Router Configuration**: Ensure the MikroTik REST API is enabled (`/ip service enable www`).

## 2. Prepare the Application for Production
Stop any running development servers (`npm run dev`), as you don't need the Vite dev server for production.

Build the frontend static files so they can be optimized and served directly by the Express Node server:
```bash
npm install
npm run build
```
*(This command will compile the UI and place the final files inside a new `dist/` directory).*

## 3. Configure the Environment
Ensure your `.env` file is properly configured with your Router's credentials and the basic authentication you want to use to protect the Dashboard web page itself. 

Open `.env`:
```ini
# MikroTik Router Connection
ROUTER_IP=10.10.10.1:8081
ROUTER_USER=admin
ROUTER_PASS=your_secure_mikrotik_password
ROUTER_PROTOCOL=http
ROUTER_SKIP_TLS_VERIFY=true

# Dashboard Server Settings
PORT=3000

# Dashboard Web Login Credentials (to prevent unauthorized access)
DASHBOARD_USER=admin
DASHBOARD_PASS=your_secure_dashboard_password
```

## 4. Run the Server
To run the server in production mode (which tells Express to use the `dist` folder instead of Vite), set the `NODE_ENV` environment variable to `production`:

```bash
NODE_ENV=production node server.js
```

At this point, your dashboard is fully operational! Because of the HTTP Basic Authentication we added earlier, it is cleanly secured. 

You can now grab your mobile phone (connected to your home Wi-Fi), and open your web browser to:
**`http://YOUR_LINUX_SERVER_IP:3000`**

*(Make sure to use the IP of the Linux machine running the script, NOT the MikroTik IP!). You will be prompted to enter the `DASHBOARD_USER` and `DASHBOARD_PASS` to get in.*

---

## 5. Keep the Server Running Perpetually (Optional but Recommended)
If you close your terminal window, `node server.js` will stop. To keep the dashboard running in the background persistently (even if your Linux server restarts), you should use a process manager like **PM2**.

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Start the dashboard with PM2 in production mode:
   ```bash
   NODE_ENV=production pm2 start server.js --name "mikrotik-dashboard"
   ```

3. Configure PM2 to start automatically if your Linux machine reboots:
   ```bash
   pm2 startup
   ```
   *(Run the command PM2 outputs on your screen)*, then run:
   ```bash
   pm2 save
   ```

Your dashboard is now a fully self-hosted, background LAN service!
