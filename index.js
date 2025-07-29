// index.js
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

// Create an Express application
const app = express();

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static('public')); 

// Define the port the server will run on
const PORT = process.env.PORT || 3000;

// The URL of the service you want to keep alive
const PING_TARGET_URL = 'https://endpoint-wxtt.onrender.com/health';

// Store ping statistics and logs
let stats = {
  totalPings: 0,
  successfulPings: 0,
  failedPings: 0,
  lastPingTime: null,
  lastPingStatus: null,
  lastPingDuration: null,
  uptime: 0,
  startTime: new Date(),
  recentLogs: []
};

// Function to add a log entry
function addLog(message, status = 'info') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    message,
    status
  };
  
  stats.recentLogs.unshift(logEntry);
  
  // Keep only the last 50 logs
  if (stats.recentLogs.length > 50) {
    stats.recentLogs = stats.recentLogs.slice(0, 50);
  }
  
  console.log(`[${logEntry.timestamp}] ${message}`);
}

// Enhanced ping function with retry logic
async function pingTarget(isRetry = false) {
  const startTime = Date.now();
  if (!isRetry) stats.totalPings++;
  
  try {
    const response = await axios.get(PING_TARGET_URL, {
      timeout: isRetry ? 60000 : 45000, 
      headers: {
        'User-Agent': 'Keep-Alive-Service/1.0',
        'Accept': 'application/json, text/plain, */*',
        'Connection': 'keep-alive'
      }
    });
    
    const duration = Date.now() - startTime;
    if (!isRetry) stats.successfulPings++;
    stats.lastPingStatus = 'success';
    stats.lastPingTime = new Date();
    stats.lastPingDuration = duration;
    
    addLog(`Ping successful! Status: ${response.status}, Duration: ${duration}ms`, 'success');
    return { success: true, status: response.status, duration };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (!isRetry && error.code === 'ECONNABORTED') {
      addLog(`Ping timed out (${duration}ms), retrying for cold start...`, 'warning');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return await pingTarget(true);
    }
    
    if (!isRetry) stats.failedPings++;
    stats.lastPingStatus = 'failed';
    stats.lastPingTime = new Date();
    stats.lastPingDuration = duration;
    
    let errorMessage = 'Unknown error';
    if (error.code === 'ECONNABORTED') {
      errorMessage = `Request timeout (${Math.round(duration/1000)}s)`;
    } else if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else {
      errorMessage = error.message;
    }
    
    addLog(`Ping failed: ${errorMessage}`, 'error');
    return { success: false, error: errorMessage, duration };
  }
}

// --- Cron Job Setup ---
cron.schedule('*/3 * * * *', () => {
  addLog('Scheduled ping initiated.', 'info');
  pingTarget();
});

cron.schedule('*/12 * * * *', () => {
  addLog('Anti-cold-start ping initiated.', 'info');
  pingTarget();
});

cron.schedule('*/10 * * * *', async () => {
  try {
    await axios.get(`http://localhost:${PORT}/health`, { timeout: 5000 });
    addLog('Self-ping successful.', 'info');
  } catch (error) {
    addLog('Self-ping failed: ' + error.message, 'warning');
  }
});

// --- Express Server Routes ---

// Root route to serve the Tailwind CSS dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Keep-Alive Service Dashboard</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            darkMode: 'class',
            theme: {
              extend: {
                animation: {
                  'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }
              }
            }
          }
        </script>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Inter', sans-serif; }
          .stat-card { transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out; }
          .stat-card:hover { transform: translateY(-4px); }
        </style>
    </head>
    <body class="bg-gray-900 text-gray-200">
        <div class="container mx-auto p-4 sm:p-6 lg:p-8">
            
            <header class="mb-8">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-4">
                    <h1 class="text-4xl font-bold text-white">🚀 Keep-Alive Dashboard</h1>
                    <div id="status-banner" class="flex items-center mt-4 sm:mt-0 px-4 py-2 rounded-full transition-all duration-300">
                        <span id="status-indicator" class="w-4 h-4 rounded-full mr-3"></span>
                        <span id="status-text" class="font-semibold text-lg"></span>
                    </div>
                </div>
                <p class="text-gray-400">Monitoring: <a href="${PING_TARGET_URL}" target="_blank" class="text-indigo-400 hover:text-indigo-300 break-all">${PING_TARGET_URL}</a></p>
            </header>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                <div id="total-pings-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Total Pings</h3>
                    <p id="total-pings" class="text-4xl font-extrabold text-white mt-2">0</p>
                </div>
                <div id="successful-pings-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Successful</h3>
                    <p id="successful-pings" class="text-4xl font-extrabold text-green-400 mt-2">0</p>
                </div>
                <div id="failed-pings-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Failed</h3>
                    <p id="failed-pings" class="text-4xl font-extrabold text-red-400 mt-2">0</p>
                </div>
                <div id="success-rate-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Success Rate</h3>
                    <p id="success-rate" class="text-4xl font-extrabold text-indigo-400 mt-2">0%</p>
                </div>
                <div id="uptime-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Uptime</h3>
                    <p id="uptime" class="text-4xl font-extrabold text-white mt-2">0h 0m</p>
                </div>
                <div id="last-ping-card" class="stat-card bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
                    <h3 class="text-sm font-medium text-gray-400 uppercase">Last Ping (ms)</h3>
                    <p id="last-ping-duration" class="text-4xl font-extrabold text-white mt-2">N/A</p>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-4 mb-8">
                <button id="manual-ping-btn" class="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out shadow-md hover:shadow-lg w-full sm:w-auto">
                    <svg id="ping-icon" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <svg id="ping-loader" class="animate-spin h-5 w-5 mr-2 hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Manual Ping
                </button>
                <div class="text-sm text-gray-400">
                    Auto-refreshing in <span id="countdown" class="font-semibold text-white">30</span>s.
                </div>
            </div>

            <div class="bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-700">
                <h3 class="text-xl font-bold text-white mb-4">📊 Activity Logs</h3>
                <div class="h-96 overflow-y-auto pr-2">
                    <table class="w-full text-left">
                        <tbody id="logs-container">
                            </tbody>
                    </table>
                </div>
            </div>
            
        </div>

        <script>
            const API_URL = '/api/stats';
            const PING_URL = '/api/ping';
            let autoRefreshInterval;

            const ICONS = {
                success: '<svg class="w-5 h-5 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
                error: '<svg class="w-5 h-5 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
                warning: '<svg class="w-5 h-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>',
                info: '<svg class="w-5 h-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
            };

            function formatUptime(seconds) {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                return \`\${h}h \${m}m\`;
            }

            function updateUI(stats) {
                const successRate = stats.totalPings > 0 ? ((stats.successfulPings / stats.totalPings) * 100).toFixed(1) : 0;
                
                document.getElementById('total-pings').textContent = stats.totalPings;
                document.getElementById('successful-pings').textContent = stats.successfulPings;
                document.getElementById('failed-pings').textContent = stats.failedPings;
                document.getElementById('success-rate').textContent = \`\${successRate}%\`;
                document.getElementById('uptime').textContent = formatUptime(Math.floor((Date.now() - new Date(stats.startTime).getTime()) / 1000));
                document.getElementById('last-ping-duration').textContent = stats.lastPingDuration !== null ? stats.lastPingDuration : 'N/A';

                // Update Status Banner
                const statusBanner = document.getElementById('status-banner');
                const statusIndicator = document.getElementById('status-indicator');
                const statusText = document.getElementById('status-text');
                
                statusBanner.classList.remove('bg-green-500/20', 'bg-red-500/20', 'bg-gray-500/20', 'animate-pulse-fast');
                statusIndicator.classList.remove('bg-green-400', 'bg-red-400', 'bg-gray-400');

                if (stats.lastPingStatus === 'success') {
                    statusBanner.classList.add('bg-green-500/20');
                    statusIndicator.classList.add('bg-green-400');
                    statusText.textContent = 'Service Online';
                } else if (stats.lastPingStatus === 'failed') {
                    statusBanner.classList.add('bg-red-500/20', 'animate-pulse-fast');
                    statusIndicator.classList.add('bg-red-400');
                    statusText.textContent = 'Service Offline';
                } else {
                    statusBanner.classList.add('bg-gray-500/20');
                    statusIndicator.classList.add('bg-gray-400');
                    statusText.textContent = 'Initializing...';
                }

                // Update Logs
                const logsContainer = document.getElementById('logs-container');
                logsContainer.innerHTML = stats.recentLogs.map(log => \`
                    <tr class="border-b border-gray-700/50 hover:bg-gray-700/50">
                        <td class="p-3 w-10">\${ICONS[log.status] || ICONS.info}</td>
                        <td class="p-3 text-gray-300">\${log.message}</td>
                        <td class="p-3 text-right text-sm text-gray-500 whitespace-nowrap">\${new Date(log.timestamp).toLocaleTimeString()}</td>
                    </tr>
                \`).join('');
            }

            async function fetchData() {
                try {
                    const response = await fetch(API_URL);
                    if (!response.ok) throw new Error('Network response was not ok.');
                    const stats = await response.json();
                    updateUI(stats);
                } catch (error) {
                    console.error("Failed to fetch stats:", error);
                    const statusText = document.getElementById('status-text');
                    statusText.textContent = 'Connection Error';
                    statusText.parentElement.classList.add('bg-red-500/20');
                    statusText.previousElementSibling.classList.add('bg-red-400');
                }
            }

            async function handleManualPing() {
                const pingBtn = document.getElementById('manual-ping-btn');
                const pingIcon = document.getElementById('ping-icon');
                const pingLoader = document.getElementById('ping-loader');

                pingBtn.disabled = true;
                pingIcon.classList.add('hidden');
                pingLoader.classList.remove('hidden');

                try {
                    await fetch(PING_URL, { method: 'POST' });
                    // Give a moment for the server to process the log
                    setTimeout(fetchData, 1000);
                } catch (error) {
                    console.error("Failed to trigger manual ping:", error);
                } finally {
                    setTimeout(() => {
                        pingBtn.disabled = false;
                        pingIcon.classList.remove('hidden');
                        pingLoader.classList.add('hidden');
                    }, 1000);
                }
            }
            
            function startCountdown() {
                let timeLeft = 30;
                const countdownEl = document.getElementById('countdown');
                
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = setInterval(() => {
                    timeLeft--;
                    if (timeLeft <= 0) {
                        timeLeft = 30;
                        fetchData();
                    }
                    countdownEl.textContent = timeLeft;
                }, 1000);
            }

            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('manual-ping-btn').addEventListener('click', handleManualPing);
                fetchData();
                startCountdown();
            });
        </script>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API endpoint to get stats
app.get('/api/stats', (req, res) => {
  res.json(stats);
});

// Manual ping endpoint
app.post('/api/ping', async (req, res) => {
  addLog('Manual ping triggered via API', 'info');
  const result = await pingTarget();
  res.json(result);
});

// Graceful shutdown
process.on('SIGINT', () => {
  addLog('Server shutting down.', 'warning');
  process.exit(0);
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Pinger service listening on port ${PORT}`);
  addLog(`Server started on port ${PORT}.`, 'info');
  // Initial ping
  setTimeout(pingTarget, 5000);
});

module.exports = app;