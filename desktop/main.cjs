const { app, BrowserWindow, session } = require("electron");
const path = require("path");

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function trustedRenderer(url) {
  if (devServerUrl) return url.startsWith(new URL(devServerUrl).origin);
  return url.startsWith("file:");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1160,
    height: 820,
    minWidth: 760,
    minHeight: 600,
    title: "MediScribe",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!trustedRenderer(url)) event.preventDefault();
  });

  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(path.join(__dirname, "renderer", "index.html"));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) =>
      permission === "media" && trustedRenderer(webContents.getURL())
    );
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const microphoneOnly = details.mediaTypes?.includes("audio") && !details.mediaTypes?.includes("video");
      callback(permission === "media" && microphoneOnly && trustedRenderer(webContents.getURL()));
    });
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });

  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
}

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
