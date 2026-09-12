const { contextBridge } = require("electron");

// Intentionally expose no filesystem, shell, or process APIs to the renderer.
contextBridge.exposeInMainWorld("mediscribeDesktop", { chromiumShell: true });
