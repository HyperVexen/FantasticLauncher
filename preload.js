// preload.js - Enhanced with Delta Update System and Crash Detection Support
// Secure bridge between renderer and main processes

const { contextBridge, ipcRenderer } = require('electron');

// Expose launcher functions to renderer process
contextBridge.exposeInMainWorld('launcher', {
  initialize: () => ipcRenderer.invoke('launcher:initialize'),
  
  getLatestMinecraftVersion: () => 
    ipcRenderer.invoke('launcher:get-latest-minecraft-version'),
    
  getLatestFabricVersion: (minecraftVersion) => 
    ipcRenderer.invoke('launcher:get-latest-fabric-version', minecraftVersion),
    
  downloadGameFiles: (minecraftVersion, fabricVersion) => 
    ipcRenderer.invoke('launcher:download-game-files', minecraftVersion, fabricVersion),
    
  // NEW: Smart download for missing components only
  downloadMissingComponents: (minecraftVersion, fabricVersion, missingComponents) => 
    ipcRenderer.invoke('launcher:download-missing-components', minecraftVersion, fabricVersion, missingComponents),
    
  launchGame: (username, minecraftVersion, fabricVersion, ram) => 
    ipcRenderer.invoke('launcher:launch-game', username, minecraftVersion, fabricVersion, ram),
    
  // Enhanced asset verifier functions
  verifyAssets: (minecraftVersion, fabricVersion) => 
    ipcRenderer.invoke('launcher:verify-assets', minecraftVersion, fabricVersion),
    
  // NEW: Auto-detection function
  autoDetectGame: (minecraftVersion, fabricVersion) => 
    ipcRenderer.invoke('launcher:auto-detect-game', minecraftVersion, fabricVersion),
    
  // NEW: Get detection results
  getDetectionResults: () => 
    ipcRenderer.invoke('launcher:get-detection-results'),
    
  fixLibraryConflicts: (conflicts) => 
    ipcRenderer.invoke('launcher:fix-library-conflicts', conflicts),
    
  cleanupBackups: (olderThanDays) => 
    ipcRenderer.invoke('launcher:cleanup-backups', olderThanDays),
    
  // NEW: Check if game is ready to launch
  isGameReady: () => 
    ipcRenderer.invoke('launcher:is-game-ready'),
    
  // NEW: Get missing components list
  getMissingComponents: () => 
    ipcRenderer.invoke('launcher:get-missing-components'),

  checkVersionUpdates: (currentMinecraft, currentFabric) => 
    ipcRenderer.invoke('launcher:check-version-updates', currentMinecraft, currentFabric)
});

// NEW: Crash Detection and Auto-Repair API
contextBridge.exposeInMainWorld('crashDetector', {
  // Get crash statistics
  getStatistics: () => 
    ipcRenderer.invoke('crash:get-statistics'),
    
  // Get last crash report
  getLastReport: () => 
    ipcRenderer.invoke('crash:get-last-report'),
    
  // Trigger manual repair
  triggerRepair: (minecraftVersion, fabricVersion) => 
    ipcRenderer.invoke('crash:trigger-repair', minecraftVersion, fabricVersion),
    
  // Check if repair is available
  canRepair: () => 
    ipcRenderer.invoke('crash:can-repair'),
    
  // Reset repair attempts counter
  resetRepairAttempts: () => 
    ipcRenderer.invoke('crash:reset-repair-attempts'),
    
  // Enable/disable auto-repair
  setAutoRepair: (enabled) => 
    ipcRenderer.invoke('crash:set-auto-repair', enabled),
    
  // Get auto-repair status
  getAutoRepairStatus: () => 
    ipcRenderer.invoke('crash:get-auto-repair-status'),
    
  // Event listeners for crash detection
  onGameCrashed: (callback) => 
    ipcRenderer.on('game-crashed', (_, crashData) => callback(crashData)),
    
  onRepairStarted: (callback) => 
    ipcRenderer.on('repair-started', (_, repairInfo) => callback(repairInfo)),
    
  onRepairCompleted: (callback) => 
    ipcRenderer.on('repair-completed', (_, repairResult) => callback(repairResult)),
    
  onGameExited: (callback) => 
    ipcRenderer.on('game-exited', (_, exitInfo) => callback(exitInfo)),
    
  // Remove crash detection event listeners
  removeCrashListeners: () => {
    ipcRenderer.removeAllListeners('game-crashed');
    ipcRenderer.removeAllListeners('repair-started');
    ipcRenderer.removeAllListeners('repair-completed');
    ipcRenderer.removeAllListeners('game-exited');
  }
});

// NEW: Delta Updater API (replaces old updater)
contextBridge.exposeInMainWorld('deltaUpdater', {
  // Check for updates
  checkForUpdates: () => 
    ipcRenderer.invoke('delta-updater:check-for-updates'),
  
  // Force check for updates (ignores cache)
  forceCheckForUpdates: () => 
    ipcRenderer.invoke('delta-updater:force-check'),
  
  // Download update
  downloadUpdate: () => 
    ipcRenderer.invoke('delta-updater:download-update'),
  
  // Install downloaded update
  installUpdate: () => 
    ipcRenderer.invoke('delta-updater:install-update'),
  
  // Cancel ongoing download
  cancelDownload: () => 
    ipcRenderer.invoke('delta-updater:cancel-download'),
  
  // Restart application to apply updates
  restartApplication: () => 
    ipcRenderer.invoke('delta-updater:restart-app'),
  
  // Get updater state
  getState: () => 
    ipcRenderer.invoke('delta-updater:get-state'),
  
  // Get update statistics
  getStatistics: () => 
    ipcRenderer.invoke('delta-updater:get-statistics'),
  
  // Event listeners for delta updater
  onUpdateAvailable: (callback) => 
    ipcRenderer.on('delta-update-available', (_, updateData) => callback(updateData)),
    
  onUpdateDownloaded: (callback) => 
    ipcRenderer.on('delta-update-downloaded', (_, updateData) => callback(updateData)),
    
  onUpdateProgress: (callback) => 
    ipcRenderer.on('delta-update-progress', (_, progressData) => callback(progressData)),
    
  onUpdateInstalled: (callback) => 
    ipcRenderer.on('delta-update-installed', (_, updateData) => callback(updateData)),
    
  onUpdateError: (callback) => 
    ipcRenderer.on('delta-update-error', (_, errorData) => callback(errorData)),
    
  onStateChange: (callback) => 
    ipcRenderer.on('delta-updater-state-change', (_, stateData) => callback(stateData)),
    
  // Remove all delta updater event listeners
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('delta-update-available');
    ipcRenderer.removeAllListeners('delta-update-downloaded');
    ipcRenderer.removeAllListeners('delta-update-progress');
    ipcRenderer.removeAllListeners('delta-update-installed');
    ipcRenderer.removeAllListeners('delta-update-error');
    ipcRenderer.removeAllListeners('delta-updater-state-change');
  }
});

// DEPRECATED: Legacy updater API (for backwards compatibility)
// This will show warnings and redirect to deltaUpdater
contextBridge.exposeInMainWorld('updater', {
  checkForUpdates: () => {
    console.warn('updater.checkForUpdates is deprecated. Use deltaUpdater.checkForUpdates instead.');
    return ipcRenderer.invoke('delta-updater:check-for-updates');
  },
  
  downloadUpdate: () => {
    console.warn('updater.downloadUpdate is deprecated. Use deltaUpdater.downloadUpdate instead.');
    return ipcRenderer.invoke('delta-updater:download-update');
  },
  
  applyUpdate: (updatePath) => {
    console.warn('updater.applyUpdate is deprecated. Use deltaUpdater.installUpdate instead.');
    return ipcRenderer.invoke('delta-updater:install-update');
  },
  
  getUpdateInfo: () => {
    console.warn('updater.getUpdateInfo is deprecated. Use deltaUpdater.getState instead.');
    return ipcRenderer.invoke('delta-updater:get-state');
  },
  
  // Event listeners with deprecation warnings
  onUpdateAvailable: (callback) => {
    console.warn('updater.onUpdateAvailable is deprecated. Use deltaUpdater.onUpdateAvailable instead.');
    return ipcRenderer.on('delta-update-available', (_, updateInfo) => callback(updateInfo));
  },
    
  onUpdateDownloadStarted: (callback) => {
    console.warn('updater.onUpdateDownloadStarted is deprecated. Use deltaUpdater.onUpdateProgress instead.');
    return ipcRenderer.on('delta-update-progress', (_, data) => {
      if (data.type === 'download' && data.progress === 0) callback();
    });
  },
    
  onUpdateDownloadProgress: (callback) => {
    console.warn('updater.onUpdateDownloadProgress is deprecated. Use deltaUpdater.onUpdateProgress instead.');
    return ipcRenderer.on('delta-update-progress', (_, data) => {
      if (data.type === 'download') callback(data);
    });
  },
    
  onUpdateDownloadFinished: (callback) => {
    console.warn('updater.onUpdateDownloadFinished is deprecated. Use deltaUpdater.onUpdateDownloaded instead.');
    return ipcRenderer.on('delta-update-downloaded', (_, data) => callback(data));
  },
    
  onUpdateReadyToInstall: (callback) => {
    console.warn('updater.onUpdateReadyToInstall is deprecated. Use deltaUpdater.onUpdateDownloaded instead.');
    return ipcRenderer.on('delta-update-downloaded', (_, data) => callback(data));
  },
    
  // Remove event listeners
  removeAllListeners: () => {
    console.warn('updater.removeAllListeners is deprecated. Use deltaUpdater.removeAllListeners instead.');
    ipcRenderer.removeAllListeners('delta-update-available');
    ipcRenderer.removeAllListeners('delta-update-downloaded');
    ipcRenderer.removeAllListeners('delta-update-progress');
    ipcRenderer.removeAllListeners('delta-update-installed');
    ipcRenderer.removeAllListeners('delta-update-error');
  }
});

// NEW: Enhanced system and detection APIs
contextBridge.exposeInMainWorld('system', {
  getInfo: () => ipcRenderer.invoke('system:get-info'),
  
  getGameDirectories: () => ipcRenderer.invoke('system:get-game-directories'),
  
  checkDiskSpace: () => ipcRenderer.invoke('system:check-disk-space'),
  
  checkJavaVersion: () => ipcRenderer.invoke('system:check-java-version')
});

// NEW: Game detection event listeners
contextBridge.exposeInMainWorld('gameDetection', {
  // Listen for game detection complete event
  onGameDetectionComplete: (callback) => 
    ipcRenderer.on('game-detection-complete', (_, detectionResult) => callback(detectionResult)),
    
  // Listen for detection progress updates
  onDetectionProgress: (callback) => 
    ipcRenderer.on('detection-progress', (_, progressData) => callback(progressData)),
    
  // Listen for component verification updates
  onComponentVerified: (callback) => 
    ipcRenderer.on('component-verified', (_, componentData) => callback(componentData)),
    
  // Remove detection event listeners
  removeDetectionListeners: () => {
    ipcRenderer.removeAllListeners('game-detection-complete');
    ipcRenderer.removeAllListeners('detection-progress');
    ipcRenderer.removeAllListeners('component-verified');
  }
});

// NEW: Enhanced download progress tracking
contextBridge.exposeInMainWorld('downloadProgress', {
  // Listen for overall download progress
  onDownloadProgress: (callback) => 
    ipcRenderer.on('download-progress', (_, progressData) => callback(progressData)),
    
  // Listen for individual file download progress
  onFileDownloadProgress: (callback) => 
    ipcRenderer.on('file-download-progress', (_, fileData) => callback(fileData)),
    
  // Listen for download queue updates
  onDownloadQueueUpdate: (callback) => 
    ipcRenderer.on('download-queue-update', (_, queueData) => callback(queueData)),
    
  // Listen for download completion
  onDownloadComplete: (callback) => 
    ipcRenderer.on('download-complete', (_, resultData) => callback(resultData)),
    
  // Listen for download errors
  onDownloadError: (callback) => 
    ipcRenderer.on('download-error', (_, errorData) => callback(errorData)),
    
  // Remove download progress listeners
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('file-download-progress');
    ipcRenderer.removeAllListeners('download-queue-update');
    ipcRenderer.removeAllListeners('download-complete');
    ipcRenderer.removeAllListeners('download-error');
  }
});

// NEW: Launcher state management
contextBridge.exposeInMainWorld('launcherState', {
  // Get current launcher state
  getState: () => ipcRenderer.invoke('launcher:get-state'),
  
  // Set launcher state
  setState: (stateData) => ipcRenderer.invoke('launcher:set-state', stateData),
  
  // Listen for state changes
  onStateChange: (callback) => 
    ipcRenderer.on('launcher-state-change', (_, stateData) => callback(stateData)),
    
  // Remove state listeners
  removeStateListeners: () => {
    ipcRenderer.removeAllListeners('launcher-state-change');
  }
});

// Enhanced logging for debugging
contextBridge.exposeInMainWorld('logger', {
  log: (level, message, data = null) => 
    ipcRenderer.invoke('logger:log', level, message, data),
    
  debug: (message, data = null) => 
    ipcRenderer.invoke('logger:debug', message, data),
    
  info: (message, data = null) => 
    ipcRenderer.invoke('logger:info', message, data),
    
  warn: (message, data = null) => 
    ipcRenderer.invoke('logger:warn', message, data),
    
  error: (message, data = null) => 
    ipcRenderer.invoke('logger:error', message, data),
    
  // Get recent logs
  getLogs: (limit = 100) => 
    ipcRenderer.invoke('logger:get-logs', limit)
});

// Enhanced backwards compatibility - keep existing electronAPI with crash detection
contextBridge.exposeInMainWorld('electronAPI', {
  // Game detection events (for backwards compatibility)
  onGameDetectionComplete: (callback) => 
    ipcRenderer.on('game-detection-complete', (_, detectionResult) => callback(detectionResult)),
    
  // NEW: Crash detection events
  onGameCrashed: (callback) => 
    ipcRenderer.on('game-crashed', (_, crashData) => callback(crashData)),
    
  onRepairStarted: (callback) => 
    ipcRenderer.on('repair-started', (_, repairInfo) => callback(repairInfo)),
    
  onRepairCompleted: (callback) => 
    ipcRenderer.on('repair-completed', (_, repairResult) => callback(repairResult)),
    
  onGameExited: (callback) => 
    ipcRenderer.on('game-exited', (_, exitInfo) => callback(exitInfo)),
  
  // Send messages to main process
  send: (channel, data) => ipcRenderer.send(channel, data),
  
  // Invoke main process functions
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // Listen for events from main process
  on: (channel, callback) => ipcRenderer.on(channel, callback),
  
  // Remove event listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Performance monitoring for debugging
contextBridge.exposeInMainWorld('performance', {
  // Mark performance points
  mark: (name) => performance.mark(name),
  
  // Measure performance between marks
  measure: (name, startMark, endMark) => performance.measure(name, startMark, endMark),
  
  // Get performance entries
  getEntries: () => performance.getEntries(),
  
  // Clear performance entries
  clearEntries: () => performance.clearMarks() && performance.clearMeasures(),
  
  // Get memory usage (if available)
  getMemoryUsage: () => performance.memory ? {
    usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
  } : null
});

// Utility functions for the renderer
contextBridge.exposeInMainWorld('utils', {
  // Format file sizes
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  // Format duration
  formatDuration: (seconds) => {
    if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} minutes`;
    return `${Math.ceil(seconds / 3600)} hours`;
  },
  
  // Format crash type for display
  formatCrashType: (crashType) => {
    const crashTypeMap = {
      'exit_crash': 'Unexpected Exit',
      'process_error': 'Process Error',
      'crash_report': 'Game Crash Report',
      'log_crash': 'Log-based Crash',
      'manual_repair': 'Manual Repair',
      'memory': 'Out of Memory',
      'missing_file': 'Missing Files',
      'network': 'Network Error',
      'corrupted': 'File Corruption'
    };
    
    return crashTypeMap[crashType] || crashType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },
  
  // Format update type for display
  formatUpdateType: (updateType) => {
    const updateTypeMap = {
      'delta': 'Delta Update',
      'full': 'Full Update',
      'patch': 'Patch Update',
      'minor': 'Minor Update',
      'major': 'Major Update'
    };
    
    return updateTypeMap[updateType] || updateType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  },
  
  // Debounce function
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  // Throttle function
  throttle: (func, limit) => {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
});

// Enhanced error handling and reporting with crash detection context
contextBridge.exposeInMainWorld('errorHandler', {
  // Report errors to main process
  reportError: (error, context = 'renderer') => 
    ipcRenderer.invoke('error:report', {
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }),
    
  // Report crash-related errors
  reportCrashError: (error, crashContext) =>
    ipcRenderer.invoke('error:report', {
      message: error.message,
      stack: error.stack,
      context: `crash-${crashContext}`,
      timestamp: new Date().toISOString(),
      crashRelated: true,
      crashContext: crashContext
    }),
    
  // Report delta update errors
  reportUpdateError: (error, updateContext) =>
    ipcRenderer.invoke('error:report', {
      message: error.message,
      stack: error.stack,
      context: `delta-update-${updateContext}`,
      timestamp: new Date().toISOString(),
      updateRelated: true,
      updateContext: updateContext
    }),
    
  // Handle uncaught errors
  setupGlobalErrorHandling: () => {
    window.addEventListener('error', (event) => {
      ipcRenderer.invoke('error:report', {
        message: event.error?.message || event.message,
        stack: event.error?.stack,
        context: 'uncaught-exception',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        timestamp: new Date().toISOString()
      });
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      ipcRenderer.invoke('error:report', {
        message: event.reason?.message || 'Unhandled Promise Rejection',
        stack: event.reason?.stack,
        context: 'unhandled-rejection',
        reason: event.reason,
        timestamp: new Date().toISOString()
      });
    });
  }
});

// NEW: Crash Detection Utilities
contextBridge.exposeInMainWorld('crashUtils', {
  // Format crash report for display
  formatCrashReport: (crashReport) => {
    if (!crashReport) return null;
    
    return {
      id: crashReport.id,
      timestamp: new Date(crashReport.timestamp).toLocaleString(),
      type: crashReport.type,
      typeFormatted: window.utils?.formatCrashType ? window.utils.formatCrashType(crashReport.type) : crashReport.type,
      details: crashReport.details,
      username: crashReport.username,
      minecraftVersion: crashReport.minecraftVersion,
      fabricVersion: crashReport.fabricVersion,
      playTime: crashReport.playTime,
      networkConnected: crashReport.networkConnected,
      repairAttempted: crashReport.repairAttempted,
      repairSuccessful: crashReport.repairSuccessful,
      canRepair: crashReport.canRepair || false
    };
  },
  
  // Generate crash summary
  generateCrashSummary: (crashReport) => {
    if (!crashReport) return 'No crash data available';
    
    const typeFormatted = window.utils?.formatCrashType ? window.utils.formatCrashType(crashReport.type) : crashReport.type;
    const playTimeText = crashReport.playTime > 0 ? ` after ${crashReport.playTime} seconds` : '';
    
    return `${typeFormatted}${playTimeText} - ${crashReport.repairAttempted ? (crashReport.repairSuccessful ? 'Auto-repaired' : 'Repair failed') : 'No repair attempted'}`;
  },
  
  // Check if crash is repairable
  isCrashRepairable: (crashType) => {
    const repairableCrashes = ['missing_file', 'corrupted', 'exit_crash', 'process_error'];
    return repairableCrashes.includes(crashType);
  },
  
  // Get crash severity level
  getCrashSeverity: (crashType) => {
    const severityMap = {
      'memory': 'high',
      'corrupted': 'high',
      'missing_file': 'medium',
      'network': 'low',
      'exit_crash': 'medium',
      'process_error': 'medium',
      'crash_report': 'high',
      'log_crash': 'medium'
    };
    
    return severityMap[crashType] || 'medium';
  }
});

// NEW: Auto-Repair Utilities
contextBridge.exposeInMainWorld('repairUtils', {
  // Format repair result for display
  formatRepairResult: (repairResult) => {
    if (!repairResult) return null;
    
    return {
      success: repairResult.success,
      steps: repairResult.repairResult?.steps || [],
      errors: repairResult.repairResult?.errors || [],
      duration: repairResult.duration || 0,
      timestamp: new Date().toLocaleString()
    };
  },
  
  // Generate repair summary
  generateRepairSummary: (repairResult) => {
    if (!repairResult) return 'No repair data available';
    
    if (repairResult.success) {
      const successfulSteps = repairResult.repairResult?.steps?.filter(step => step.success).length || 0;
      const totalSteps = repairResult.repairResult?.steps?.length || 0;
      return `Repair completed successfully (${successfulSteps}/${totalSteps} steps)`;
    } else {
      const errorCount = repairResult.repairResult?.errors?.length || 0;
      return `Repair failed with ${errorCount} error(s)`;
    }
  },
  
  // Get repair step status
  getRepairStepStatus: (step) => {
    if (!step) return 'unknown';
    return step.success ? 'success' : 'failed';
  },
  
  // Format repair step for display
  formatRepairStep: (step) => {
    if (!step) return null;
    
    const stepNames = {
      'minecraft_json': 'Minecraft JSON Files',
      'fabric_json': 'Fabric JSON Files',
      'library_conflicts': 'Library Conflicts',
      'game_verification': 'Game Verification'
    };
    
    return {
      name: stepNames[step.step] || step.step,
      success: step.success,
      details: step.details,
      status: step.success ? 'success' : 'failed'
    };
  }
});

// NEW: Delta Update Utilities
contextBridge.exposeInMainWorld('deltaUtils', {
  // Format update info for display
  formatUpdateInfo: (updateInfo) => {
    if (!updateInfo) return null;
    
    return {
      version: updateInfo.version,
      fromVersion: updateInfo.fromVersion,
      releaseDate: updateInfo.releaseDate ? new Date(updateInfo.releaseDate).toLocaleString() : null,
      releaseNotes: updateInfo.releaseNotes,
      deltaFiles: updateInfo.deltaFiles || [],
      newFiles: updateInfo.newFiles,
      downloadSize: updateInfo.deltaFiles?.reduce((total, file) => total + (file.size || 0), 0) || 0,
      isDelta: !!(updateInfo.deltaFiles && updateInfo.deltaFiles.length > 0),
      releaseUrl: updateInfo.releaseUrl
    };
  },
  
  // Generate update summary
  generateUpdateSummary: (updateInfo) => {
    if (!updateInfo) return 'No update data available';
    
    const deltaSize = updateInfo.deltaFiles?.reduce((total, file) => total + (file.size || 0), 0) || 0;
    const sizeText = window.utils?.formatFileSize ? window.utils.formatFileSize(deltaSize) : `${Math.round(deltaSize / 1024 / 1024)} MB`;
    
    if (updateInfo.deltaFiles && updateInfo.deltaFiles.length > 0) {
      return `Delta update to ${updateInfo.version} (${sizeText})`;
    } else {
      return `Full update to ${updateInfo.version}`;
    }
  },
  
  // Calculate update benefits
  calculateUpdateBenefits: (updateInfo) => {
    if (!updateInfo || !updateInfo.deltaFiles) return null;
    
    let totalOriginalSize = 0;
    let totalDeltaSize = 0;
    
    for (const deltaFile of updateInfo.deltaFiles) {
      totalOriginalSize += deltaFile.originalSize || 0;
      totalDeltaSize += deltaFile.size || 0;
    }
    
    const savings = totalOriginalSize - totalDeltaSize;
    const savingsPercentage = totalOriginalSize > 0 ? (savings / totalOriginalSize) * 100 : 0;
    
    return {
      originalSize: totalOriginalSize,
      deltaSize: totalDeltaSize,
      savings: savings,
      savingsPercentage: savingsPercentage,
      downloadTime: Math.ceil(totalDeltaSize / (1024 * 1024 * 2)) // Estimate at 2MB/s
    };
  },
  
  // Get update type
  getUpdateType: (updateInfo) => {
    if (!updateInfo) return 'unknown';
    
    if (updateInfo.deltaFiles && updateInfo.deltaFiles.length > 0) {
      return 'delta';
    } else if (updateInfo.newFiles) {
      return 'full';
    } else {
      return 'patch';
    }
  }
});

// NEW: Network Status Utilities
contextBridge.exposeInMainWorld('networkUtils', {
  // Check if online
  isOnline: () => navigator.onLine,
  
  // Listen for online/offline events
  onOnline: (callback) => window.addEventListener('online', callback),
  onOffline: (callback) => window.addEventListener('offline', callback),
  
  // Remove network event listeners
  removeNetworkListeners: () => {
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  },
  
  // Test network connectivity
  testConnectivity: async () => {
    try {
      const response = await fetch('https://minecraft.net', { 
        method: 'HEAD', 
        mode: 'no-cors',
        cache: 'no-cache'
      });
      return true;
    } catch (error) {
      return false;
    }
  }
});

// Initialize global error handling
if (window.errorHandler) {
  window.errorHandler.setupGlobalErrorHandling();
}

// NEW: Delta Update Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Set up delta update event listeners if available
  if (window.deltaUpdater) {
    console.log('Setting up delta update event listeners...');
    
    // Listen for updates
    window.deltaUpdater.onUpdateAvailable((updateData) => {
      console.log('Delta update available in preload:', updateData);
      
      // Dispatch custom event to renderer
      window.dispatchEvent(new CustomEvent('deltaUpdateAvailable', { 
        detail: updateData 
      }));
    });
    
    // Listen for download progress
    window.deltaUpdater.onUpdateProgress((progressInfo) => {
      console.log('Delta update progress in preload:', progressInfo);
      
      window.dispatchEvent(new CustomEvent('deltaUpdateProgress', { 
        detail: progressInfo 
      }));
    });
    
    // Listen for download completion
    window.deltaUpdater.onUpdateDownloaded((updateData) => {
      console.log('Delta update downloaded in preload:', updateData);
      
      window.dispatchEvent(new CustomEvent('deltaUpdateDownloaded', { 
        detail: updateData 
      }));
    });
    
    // Listen for installation completion
    window.deltaUpdater.onUpdateInstalled((updateData) => {
      console.log('Delta update installed in preload:', updateData);
      
      window.dispatchEvent(new CustomEvent('deltaUpdateInstalled', { 
        detail: updateData 
      }));
    });
    
    // Listen for errors
    window.deltaUpdater.onUpdateError((errorData) => {
      console.log('Delta update error in preload:', errorData);
      
      window.dispatchEvent(new CustomEvent('deltaUpdateError', { 
        detail: errorData 
      }));
    });
    
    // Listen for state changes
    window.deltaUpdater.onStateChange((stateData) => {
      console.log('Delta updater state change in preload:', stateData);
      
      window.dispatchEvent(new CustomEvent('deltaUpdaterStateChange', { 
        detail: stateData 
      }));
    });
  }
  
  // Set up crash detection event listeners if available
  if (window.crashDetector) {
    console.log('Setting up crash detection event listeners...');
    
    // Listen for crashes
    window.crashDetector.onGameCrashed((crashData) => {
      console.log('Game crash detected in preload:', crashData);
      
      // Dispatch custom event to renderer
      window.dispatchEvent(new CustomEvent('gameCrashed', { 
        detail: crashData 
      }));
    });
    
    // Listen for repair events
    window.crashDetector.onRepairStarted((repairInfo) => {
      console.log('Repair started in preload:', repairInfo);
      
      window.dispatchEvent(new CustomEvent('repairStarted', { 
        detail: repairInfo 
      }));
    });
    
    window.crashDetector.onRepairCompleted((repairResult) => {
      console.log('Repair completed in preload:', repairResult);
      
      window.dispatchEvent(new CustomEvent('repairCompleted', { 
        detail: repairResult 
      }));
    });
    
    // Listen for game exit
    window.crashDetector.onGameExited((exitInfo) => {
      console.log('Game exited in preload:', exitInfo);
      
      window.dispatchEvent(new CustomEvent('gameExited', { 
        detail: exitInfo 
      }));
    });
  }
  
  // Set up network status monitoring
  if (window.networkUtils) {
    window.networkUtils.onOnline(() => {
      console.log('Network connection restored');
      window.dispatchEvent(new CustomEvent('networkOnline'));
    });
    
    window.networkUtils.onOffline(() => {
      console.log('Network connection lost');
      window.dispatchEvent(new CustomEvent('networkOffline'));
    });
  }
});

// Cleanup function for when the window is about to unload
window.addEventListener('beforeunload', () => {
  // Remove all event listeners
  if (window.gameDetection) {
    window.gameDetection.removeDetectionListeners();
  }
  
  if (window.downloadProgress) {
    window.downloadProgress.removeDownloadListeners();
  }
  
  if (window.launcherState) {
    window.launcherState.removeStateListeners();
  }
  
  if (window.crashDetector) {
    window.crashDetector.removeCrashListeners();
  }
  
  if (window.deltaUpdater) {
    window.deltaUpdater.removeAllListeners();
  }
  
  if (window.networkUtils) {
    window.networkUtils.removeNetworkListeners();
  }
});

// Export some utilities for global access
window.formatCrashType = window.utils?.formatCrashType;
window.formatUpdateType = window.utils?.formatUpdateType;
window.formatFileSize = window.utils?.formatFileSize;
window.formatDuration = window.utils?.formatDuration;