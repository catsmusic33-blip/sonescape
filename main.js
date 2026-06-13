import { app, BrowserWindow, systemPreferences, session, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process'; // 🚀 Module to spin up background threads

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');

function startInternalServerAndWindow() {
  // 1. If running as a packaged app bundle, spin up the local production code worker automatically!
  if (app.isPackaged) {
    // Executes Vite's internal production server from within your app's package folder
    serverProcess = spawn(process.execPath, [
      path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--port', '5173'
    ], {
      env: { ...process.env, NODE_ENV: 'production' }
    });
  }

  // 2. Initialize the display application frame window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,      
      contextIsolation: true,       
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs') 
    }
  });

  // Give the background worker thread 1.5 seconds to settle before matching the port channel
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:8080');
  }, 1500);

  // Core Loopback Handler Bridge Mapping
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      if (sources.length === 0) {
        callback(null);
        return;
      }
      callback({ video: sources, audio: "loopback" });
    });
  }, { useSystemPicker: false });
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    await systemPreferences.askForMediaAccess('microphone');
  }
  startInternalServerAndWindow();
});

// Ensure the background worker thread closes completely when you quit the application
app.on('will-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});