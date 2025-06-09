// splash-preload.js - Updated preload script for splash screen

const { contextBridge, ipcRenderer } = require('electron');

// Expose splash screen API to renderer process
contextBridge.exposeInMainWorld('splashAPI', {
  // Listen for splash screen updates
  onUpdate: (callback) => {
    ipcRenderer.on('splash-update', (event, data) => {
      callback(data);
    });
  },

  // Listen for splash screen errors
  onError: (callback) => {
    ipcRenderer.on('splash-error', (event, data) => {
      callback(data);
    });
  },

  // Listen for retry signal
  onRetry: (callback) => {
    ipcRenderer.on('splash-retry', () => {
      callback();
    });
  },

  // Listen for completion signal
  onComplete: (callback) => {
    ipcRenderer.on('splash-complete', () => {
      callback();
    });
  },

  // Clean up event listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('splash-update');
    ipcRenderer.removeAllListeners('splash-error');
    ipcRenderer.removeAllListeners('splash-retry');
    ipcRenderer.removeAllListeners('splash-complete');
  },

  // Send ready signal to main process
  ready: () => {
    ipcRenderer.send('splash-ready');
  },

  // Send completion acknowledgment
  complete: () => {
    ipcRenderer.send('splash-completed');
  },

  // Get system info for display
  getSystemInfo: () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    };
  },

  // Send error report to main process
  reportError: (error) => {
    ipcRenderer.send('splash-error-report', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  },

  // Request initialization retry
  requestRetry: () => {
    ipcRenderer.send('splash-request-retry');
  },

  // Get app version info
  getAppInfo: () => {
    return {
      name: 'FantasticLauncher',
      version: '1.0.0',
      description: 'Advanced Minecraft Launcher with Fabric Support'
    };
  }
});