// main.js - Enhanced with Crash Detection and Delta Update System
// Main process file for the FantasticLauncher application

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const launcher = require('./src/launcher');
const assetVerifier = require('./src/asset-verifier');
const game = require('./src/game');
const DeltaUpdater = require('./src/delta-updater'); // NEW: Delta updater instead of update-checker
const SplashScreenManager = require('./splash');

// Global references
let splashManager;
let deltaUpdater; // NEW: Delta updater instance
let isAppReady = false;

// Crash detection state
let crashDetectionEnabled = true;
let lastCrashReport = null;
let repairInProgress = false;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (splashManager) {
      const mainWindow = splashManager.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    }
  });
}

// Create splash screen and handle app initialization
function createSplashScreen() {
  splashManager = new SplashScreenManager();
  return splashManager.createSplashScreen();
}

// Handle app ready event
app.whenReady().then(() => {
  isAppReady = true;
  
  // Create and show splash screen first
  createSplashScreen();
  
  // Initialize delta updater instead of update checker
  if (splashManager) {
    deltaUpdater = new DeltaUpdater({
      githubOwner: 'XcaLiber1290',
      githubRepo: 'FantasticLauncher',
      currentVersion: app.getVersion(),
      appName: 'FantasticLauncher',
      autoDownload: false,
      autoInstall: false,
      checkInterval: 3600000 // Check every hour
    });
    
    // Set up delta updater callbacks
    setupDeltaUpdaterCallbacks();
  }
  
  // Set up crash detection callbacks
  setupCrashDetectionCallbacks();
  
  // Handle activation (macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplashScreen();
    }
  });
});

// NEW: Set up delta updater callbacks
function setupDeltaUpdaterCallbacks() {
  if (!deltaUpdater) return;
  
  deltaUpdater.setCallbacks({
    onUpdateAvailable: (updateInfo) => {
      console.log('Delta update available:', updateInfo);
      
      // Notify all windows about available update
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('delta-update-available', {
            updateInfo: updateInfo,
            currentVersion: deltaUpdater.getConfig().currentVersion,
            newVersion: updateInfo.version,
            deltaSize: updateInfo.deltaFiles?.reduce((total, file) => total + (file.size || 0), 0) || 0,
            releaseNotes: updateInfo.releaseNotes
          });
        }
      });
    },
    
    onUpdateDownloaded: (updateInfo) => {
      console.log('Delta update downloaded:', updateInfo);
      
      // Notify all windows about downloaded update
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('delta-update-downloaded', {
            updateInfo: updateInfo,
            readyToInstall: true
          });
        }
      });
    },
    
    onUpdateProgress: (progressInfo) => {
      // Send progress updates to renderer
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('delta-update-progress', progressInfo);
        }
      });
    },
    
    onUpdateInstalled: (updateInfo) => {
      console.log('Delta update installed:', updateInfo);
      
      // Show restart dialog
      const mainWindow = splashManager ? splashManager.getMainWindow() : null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        const response = dialog.showMessageBoxSync(mainWindow, {
          type: 'info',
          buttons: ['Restart Now', 'Restart Later'],
          defaultId: 0,
          title: 'Update Installed',
          message: 'Update installed successfully',
          detail: `${updateInfo.appName} has been updated to version ${updateInfo.version}. A restart is required to apply the changes.`
        });
        
        if (response === 0) {
          deltaUpdater.restartApplication();
        }
      }
    },
    
    onError: (error) => {
      console.error('Delta updater error:', error);
      
      // Notify all windows about update error
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('delta-update-error', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      });
    },
    
    onStateChange: (state) => {
      // Broadcast state changes to all windows
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('delta-updater-state-change', state);
        }
      });
    }
  });
  
  // Start checking for updates
  setTimeout(() => {
    deltaUpdater.checkForUpdates().catch(error => {
      console.error('Initial update check failed:', error);
    });
  }, 5000); // Check 5 seconds after startup
}

// Set up crash detection callbacks
function setupCrashDetectionCallbacks() {
  // Set up crash detection callbacks in game module
  game.setCrashCallbacks({
    onCrashDetected: (crashReport) => {
      console.log('Game crash detected:', crashReport);
      lastCrashReport = crashReport;
      
      // Notify all windows about the crash
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('game-crashed', {
            crashReport: crashReport,
            canRepair: game.canRepair(),
            autoRepairEnabled: crashDetectionEnabled
          });
        }
      });
      
      // Show crash notification dialog if not auto-repairing
      if (crashDetectionEnabled && game.canRepair()) {
        showCrashRepairDialog(crashReport);
      } else {
        showCrashNotificationDialog(crashReport);
      }
    },
    
    onRepairStarted: (repairInfo) => {
      console.log('Auto-repair started:', repairInfo);
      repairInProgress = true;
      
      // Notify all windows about repair start
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('repair-started', repairInfo);
        }
      });
    },
    
    onRepairCompleted: (repairResult) => {
      console.log('Auto-repair completed:', repairResult);
      repairInProgress = false;
      
      // Notify all windows about repair completion
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('repair-completed', repairResult);
        }
      });
      
      // Show repair result dialog
      showRepairResultDialog(repairResult);
    },
    
    onGameExit: (exitInfo) => {
      console.log('Game exited:', exitInfo);
      
      // Notify all windows about game exit
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('game-exited', exitInfo);
        }
      });
    }
  });
}

// Show crash repair dialog
function showCrashRepairDialog(crashReport) {
  const mainWindow = splashManager ? splashManager.getMainWindow() : null;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      buttons: ['Repair & Fix', 'Ignore', 'View Details'],
      defaultId: 0,
      title: 'Minecraft Crashed',
      message: 'Minecraft has crashed unexpectedly',
      detail: `Crash Type: ${crashReport.type}\n\nThe launcher can automatically repair common issues by re-downloading game files and fixing conflicts.\n\nWould you like to repair and fix the installation?`
    });
    
    switch (response) {
      case 0: // Repair & Fix
        triggerManualRepair();
        break;
      case 1: // Ignore
        break;
      case 2: // View Details
        showCrashDetailsDialog(crashReport);
        break;
    }
  }
}

// Show crash notification dialog (when auto-repair is not available)
function showCrashNotificationDialog(crashReport) {
  const mainWindow = splashManager ? splashManager.getMainWindow() : null;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    const canRepair = game.canRepair();
    const buttons = canRepair ? ['Repair & Fix', 'View Details', 'OK'] : ['View Details', 'OK'];
    
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'error',
      buttons: buttons,
      defaultId: canRepair ? 0 : 1,
      title: 'Minecraft Crashed',
      message: 'Minecraft has crashed unexpectedly',
      detail: canRepair 
        ? `Crash Type: ${crashReport.type}\n\nClick "Repair & Fix" to automatically repair the installation.`
        : `Crash Type: ${crashReport.type}\n\nAuto-repair is not available. Please check your network connection or try restarting the launcher.`
    });
    
    if (canRepair && response === 0) {
      triggerManualRepair();
    } else if (response === (canRepair ? 1 : 0)) {
      showCrashDetailsDialog(crashReport);
    }
  }
}

// Show repair result dialog
function showRepairResultDialog(repairResult) {
  const mainWindow = splashManager ? splashManager.getMainWindow() : null;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    const message = repairResult.success 
      ? 'Game files have been repaired successfully!'
      : 'Repair process completed with some issues.';
    
    const detail = repairResult.success
      ? 'The following repairs were applied:\n' + 
        (repairResult.repairResult?.steps?.map(step => 
          `• ${step.step}: ${step.success ? '✓' : '✗'} ${step.details}`
        ).join('\n') || 'Standard repairs completed')
      : 'Some repair steps failed:\n' + 
        (repairResult.repairResult?.errors?.join('\n• ') || repairResult.error || 'Unknown errors occurred');
    
    dialog.showMessageBoxSync(mainWindow, {
      type: repairResult.success ? 'info' : 'warning',
      buttons: ['OK'],
      title: 'Repair Complete',
      message: message,
      detail: detail
    });
  }
}

// Show crash details dialog
function showCrashDetailsDialog(crashReport) {
  const mainWindow = splashManager ? splashManager.getMainWindow() : null;
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    const details = `Crash ID: ${crashReport.id}
Time: ${new Date(crashReport.timestamp).toLocaleString()}
Type: ${crashReport.type}
Username: ${crashReport.username}
Minecraft Version: ${crashReport.minecraftVersion}
Fabric Version: ${crashReport.fabricVersion}
Play Time: ${crashReport.playTime} seconds
Network Connected: ${crashReport.networkConnected}
Repair Attempted: ${crashReport.repairAttempted}
Repair Successful: ${crashReport.repairSuccessful}

Details: ${crashReport.details}`;
    
    dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      buttons: ['OK'],
      title: 'Crash Details',
      message: 'Crash Report Details',
      detail: details
    });
  }
}

// Trigger manual repair
async function triggerManualRepair() {
  if (repairInProgress) {
    console.log('Repair already in progress');
    return;
  }
  
  try {
    // Get current game versions
    const minecraftVersion = await launcher.getLatestMinecraftVersion();
    const fabricVersion = await launcher.getLatestFabricVersion(minecraftVersion);
    
    console.log(`Triggering manual repair for Minecraft ${minecraftVersion} with Fabric ${fabricVersion}`);
    
    // Start repair process
    const repairResult = await game.triggerRepair(minecraftVersion, fabricVersion);
    
    console.log('Manual repair result:', repairResult);
    
    // Show result
    showRepairResultDialog({ success: repairResult.success, repairResult: repairResult });
    
  } catch (error) {
    console.error('Manual repair failed:', error);
    
    const mainWindow = splashManager ? splashManager.getMainWindow() : null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        'Repair Failed',
        `Failed to repair game installation:\n\n${error.message}`
      );
    }
  }
}

// Handle all windows closed
app.on('window-all-closed', () => {
  // Cleanup crash detector
  game.cleanupCrashDetector();
  
  // Cleanup delta updater
  if (deltaUpdater) {
    deltaUpdater.destroy();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app before quit
app.on('before-quit', (event) => {
  if (splashManager && !splashManager.isReady()) {
    const choice = dialog.showMessageBoxSync(null, {
      type: 'question',
      buttons: ['Wait', 'Force Quit'],
      defaultId: 0,
      title: 'FantasticLauncher',
      message: 'Launcher is still initializing. Do you want to wait or force quit?',
      detail: 'Force quitting may cause issues on next startup.'
    });
    
    if (choice === 0) {
      event.preventDefault();
      return;
    }
  }
  
  // Cleanup
  game.cleanupCrashDetector();
  
  if (deltaUpdater) {
    deltaUpdater.destroy();
  }
  
  if (splashManager) {
    splashManager.destroy();
  }
});

// Enhanced IPC Handlers

// Splash screen IPC handlers
ipcMain.on('splash-ready', () => {
  console.log('Splash screen is ready');
});

ipcMain.on('splash-completed', () => {
  console.log('Splash screen initialization completed');
});

ipcMain.on('splash-error-report', (event, errorData) => {
  console.error('Splash screen error report:', errorData);
  
  const fs = require('fs');
  const errorLogPath = path.join(app.getPath('userData'), 'error.log');
  const errorEntry = `[${errorData.timestamp}] Splash Error: ${errorData.message}\n${errorData.stack}\n\n`;
  
  try {
    fs.appendFileSync(errorLogPath, errorEntry);
  } catch (err) {
    console.error('Failed to write error log:', err);
  }
});

ipcMain.on('splash-request-retry', () => {
  console.log('Splash screen requesting retry');
  if (splashManager) {
    splashManager.startEnhancedInitialization();
  }
});

// Enhanced launcher IPC handlers with auto-detection
ipcMain.handle('launcher:initialize', async () => {
  try {
    console.log('Initializing launcher...');
    const result = await launcher.initialize();
    console.log('Launcher initialization result:', result);
    return result;
  } catch (error) {
    console.error('Launcher initialization error:', error);
    return { status: 'failed', error: error.message };
  }
});

ipcMain.handle('launcher:get-latest-minecraft-version', async () => {
  try {
    console.log('Fetching latest Minecraft version...');
    const version = await launcher.getLatestMinecraftVersion();
    console.log('Latest Minecraft version:', version);
    return version;
  } catch (error) {
    console.error('Failed to get Minecraft version:', error);
    return null;
  }
});

ipcMain.handle('launcher:check-version-updates', async (event, currentMinecraft, currentFabric) => {
  try {
    const latestMinecraft = await launcher.getLatestMinecraftVersion();
    const latestFabric = await launcher.getLatestFabricVersion(latestMinecraft);
    
    return {
      current: { minecraft: currentMinecraft, fabric: currentFabric },
      available: { minecraft: latestMinecraft, fabric: latestFabric },
      hasUpdates: currentMinecraft !== latestMinecraft || currentFabric !== latestFabric
    };
  } catch (error) {
    console.error('Version check error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('launcher:get-latest-fabric-version', async (event, minecraftVersion) => {
  try {
    console.log(`Fetching latest Fabric version for Minecraft ${minecraftVersion}...`);
    const version = await launcher.getLatestFabricVersion(minecraftVersion);
    console.log('Latest Fabric version:', version);
    return version;
  } catch (error) {
    console.error('Failed to get Fabric version:', error);
    return null;
  }
});

// NEW: Auto-detection handler
ipcMain.handle('launcher:auto-detect-game', async (event, minecraftVersion, fabricVersion) => {
  try {
    console.log(`Auto-detecting game for Minecraft ${minecraftVersion} with Fabric ${fabricVersion}...`);
    
    // Get main window for progress updates
    const mainWindow = splashManager ? splashManager.getMainWindow() : null;
    
    const result = await assetVerifier.autoDetectAndVerifyGame(
      minecraftVersion, 
      fabricVersion,
      (progress, text, status) => {
        // Send progress updates to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('detection-progress', {
            progress,
            text,
            status
          });
        }
      }
    );
    
    console.log('Auto-detection result:', result);
    
    // Send completion event to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('game-detection-complete', result);
    }
    
    return result;
  } catch (error) {
    console.error('Auto-detection error:', error);
    return { 
      hasExistingInstallation: false, 
      error: error.message,
      needsFullDownload: true,
      verificationComplete: false 
    };
  }
});

// NEW: Get detection results handler
ipcMain.handle('launcher:get-detection-results', async () => {
  try {
    return assetVerifier.gameDetectionResult || null;
  } catch (error) {
    console.error('Failed to get detection results:', error);
    return null;
  }
});

// NEW: Check if game is ready handler
ipcMain.handle('launcher:is-game-ready', async () => {
  try {
    return assetVerifier.isGameReadyToLaunch();
  } catch (error) {
    console.error('Failed to check game readiness:', error);
    return false;
  }
});

// NEW: Get missing components handler
ipcMain.handle('launcher:get-missing-components', async () => {
  try {
    return assetVerifier.getMissingComponentsList();
  } catch (error) {
    console.error('Failed to get missing components:', error);
    return { minecraft: [], fabric: [], libraries: [], assets: [] };
  }
});

// Enhanced download handler
ipcMain.handle('launcher:download-game-files', async (event, minecraftVersion, fabricVersion) => {
  try {
    console.log(`Downloading game files for Minecraft ${minecraftVersion} with Fabric ${fabricVersion}...`);
    
    // Get main window for progress updates
    const mainWindow = splashManager ? splashManager.getMainWindow() : null;
    
    // Set up progress reporting
    const originalProgress = launcher.downloadProgress;
    launcher.downloadProgress = {
      ...originalProgress,
      onUpdate: (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progressData);
        }
      }
    };
    
    const result = await launcher.downloadGameFiles(minecraftVersion, fabricVersion);
    console.log('Download result:', result);
    
    // Send completion event
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-complete', result);
    }
    
    return result;
  } catch (error) {
    console.error('Download error:', error);
    return { success: false, error: error.message };
  }
});

// NEW: Smart download for missing components only
ipcMain.handle('launcher:download-missing-components', async (event, minecraftVersion, fabricVersion, missingComponents) => {
  try {
    console.log(`Downloading missing components: ${missingComponents.join(', ')}`);
    
    const mainWindow = splashManager ? splashManager.getMainWindow() : null;
    
    // Use targeted download based on missing components
    const result = await launcher.downloadTargetedComponents(
      minecraftVersion, 
      fabricVersion, 
      missingComponents,
      (progressData) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progressData);
        }
      }
    );
    
    console.log('Targeted download result:', result);
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-complete', result);
    }
    
    return result;
  } catch (error) {
    console.error('Targeted download error:', error);
    return { success: false, error: error.message };
  }
});

// Enhanced launch handler with crash detection
ipcMain.handle('launcher:launch-game', async (event, username, minecraftVersion, fabricVersion, ram) => {
  try {
    console.log(`Launching game for ${username} with Minecraft ${minecraftVersion}, Fabric ${fabricVersion}`);
    const result = await launcher.launchGame(username, minecraftVersion, fabricVersion, ram);
    console.log('Launch result:', result);
    return result;
  } catch (error) {
    console.error('Launch error:', error);
    return { success: false, error: error.message };
  }
});

// Asset verifier IPC handlers with enhanced detection
ipcMain.handle('launcher:verify-assets', async (event, minecraftVersion, fabricVersion) => {
  try {
    console.log(`Verifying assets for Minecraft ${minecraftVersion} with Fabric ${fabricVersion}...`);
    
    const mainWindow = splashManager ? splashManager.getMainWindow() : null;
    
    const result = await assetVerifier.autoDetectAndVerifyGame(
      minecraftVersion, 
      fabricVersion,
      (progress, text, status) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('detection-progress', { progress, text, status });
        }
      }
    );
    
    console.log('Asset verification result:', result);
    return result;
  } catch (error) {
    console.error('Asset verification error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('launcher:fix-library-conflicts', async (event, conflicts) => {
  try {
    console.log('Fixing library conflicts:', conflicts);
    const result = await assetVerifier.resolveLibraryConflicts(conflicts);
    return { success: true, fixed: conflicts.length };
  } catch (error) {
    console.error('Library conflict fix error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('launcher:cleanup-backups', async (event, olderThanDays) => {
  try {
    console.log(`Cleaning up backups older than ${olderThanDays} days...`);
    const result = await assetVerifier.restoreJsonFiles();
    console.log('Backup cleanup result:', result);
    return result;
  } catch (error) {
    console.error('Backup cleanup error:', error);
    return { success: false, error: error.message };
  }
});

// NEW: Crash detection IPC handlers
ipcMain.handle('crash:get-statistics', async () => {
  try {
    return game.getCrashStatistics();
  } catch (error) {
    console.error('Failed to get crash statistics:', error);
    return { totalCrashes: 0, crashesLast24h: 0, crashesLastWeek: 0, commonCrashTypes: {}, repairSuccessRate: 0 };
  }
});

ipcMain.handle('crash:get-last-report', async () => {
  try {
    return game.getLastCrashReport();
  } catch (error) {
    console.error('Failed to get last crash report:', error);
    return null;
  }
});

ipcMain.handle('crash:trigger-repair', async (event, minecraftVersion, fabricVersion) => {
  try {
    console.log('Manual repair triggered from renderer');
    return await game.triggerRepair(minecraftVersion, fabricVersion);
  } catch (error) {
    console.error('Manual repair failed:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('crash:can-repair', async () => {
  try {
    return game.canRepair();
  } catch (error) {
    console.error('Failed to check repair availability:', error);
    return false;
  }
});

ipcMain.handle('crash:reset-repair-attempts', async () => {
  try {
    game.resetRepairAttempts();
    return { success: true };
  } catch (error) {
    console.error('Failed to reset repair attempts:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('crash:set-auto-repair', async (event, enabled) => {
  try {
    crashDetectionEnabled = enabled;
    game.setAutoRepair(enabled);
    console.log(`Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  } catch (error) {
    console.error('Failed to set auto-repair:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('crash:get-auto-repair-status', async () => {
  try {
    return { enabled: crashDetectionEnabled };
  } catch (error) {
    console.error('Failed to get auto-repair status:', error);
    return { enabled: false };
  }
});

// NEW: Delta updater IPC handlers
ipcMain.handle('delta-updater:check-for-updates', async () => {
  try {
    if (!deltaUpdater) {
      return { available: false, error: 'Delta updater not initialized' };
    }
    const updateInfo = await deltaUpdater.checkForUpdates();
    return { available: !!updateInfo, updateInfo: updateInfo };
  } catch (error) {
    console.error('Delta update check error:', error);
    return { available: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:download-update', async () => {
  try {
    if (!deltaUpdater) {
      throw new Error('Delta updater not initialized');
    }
    const result = await deltaUpdater.downloadUpdate();
    return { success: true, result: result };
  } catch (error) {
    console.error('Delta update download error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:install-update', async () => {
  try {
    if (!deltaUpdater) {
      throw new Error('Delta updater not initialized');
    }
    const result = await deltaUpdater.installUpdate();
    return { success: true, result: result };
  } catch (error) {
    console.error('Delta update install error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:get-state', async () => {
  try {
    if (!deltaUpdater) {
      return { initialized: false };
    }
    return { initialized: true, ...deltaUpdater.getState() };
  } catch (error) {
    console.error('Failed to get delta updater state:', error);
    return { initialized: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:get-statistics', async () => {
  try {
    if (!deltaUpdater) {
      return null;
    }
    return deltaUpdater.getUpdateStatistics();
  } catch (error) {
    console.error('Failed to get delta updater statistics:', error);
    return null;
  }
});

ipcMain.handle('delta-updater:cancel-download', async () => {
  try {
    if (!deltaUpdater) {
      throw new Error('Delta updater not initialized');
    }
    deltaUpdater.cancelDownload();
    return { success: true };
  } catch (error) {
    console.error('Failed to cancel delta update download:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:force-check', async () => {
  try {
    if (!deltaUpdater) {
      throw new Error('Delta updater not initialized');
    }
    const updateInfo = await deltaUpdater.forceCheckForUpdates();
    return { available: !!updateInfo, updateInfo: updateInfo };
  } catch (error) {
    console.error('Delta updater force check error:', error);
    return { available: false, error: error.message };
  }
});

ipcMain.handle('delta-updater:restart-app', async () => {
  try {
    if (!deltaUpdater) {
      throw new Error('Delta updater not initialized');
    }
    await deltaUpdater.restartApplication();
    return { success: true };
  } catch (error) {
    console.error('Failed to restart application:', error);
    return { success: false, error: error.message };
  }
});

// Enhanced system info IPC handler
ipcMain.handle('system:get-info', () => {
  const os = require('os');
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.versions,
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
      free: Math.round(os.freemem() / 1024 / 1024 / 1024)    // GB
    },
    cpu: os.cpus()[0]?.model || 'Unknown',
    hostname: os.hostname()
  };
});

// NEW: System utilities
ipcMain.handle('system:get-game-directories', () => {
  try {
    return {
      minecraft: launcher.MINECRAFT_DIR,
      versions: launcher.VERSIONS_DIR,
      libraries: launcher.LIBRARIES_DIR,
      assets: launcher.ASSETS_DIR
    };
  } catch (error) {
    console.error('Failed to get game directories:', error);
    return null;
  }
});

ipcMain.handle('system:check-disk-space', async () => {
  try {
    const fs = require('fs');
    const stats = fs.statSync(launcher.MINECRAFT_DIR || app.getPath('userData'));
    return {
      available: stats.size,
      path: launcher.MINECRAFT_DIR || app.getPath('userData')
    };
  } catch (error) {
    console.error('Failed to check disk space:', error);
    return { available: 0, path: 'unknown' };
  }
});

ipcMain.handle('system:check-java-version', async () => {
  try {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec('java -version', (error, stdout, stderr) => {
        if (error) {
          resolve({ available: false, version: null, error: error.message });
        } else {
          const versionMatch = stderr.match(/version "(.+?)"/);
          resolve({ 
            available: true, 
            version: versionMatch ? versionMatch[1] : 'unknown',
            output: stderr 
          });
        }
      });
    });
  } catch (error) {
    console.error('Failed to check Java version:', error);
    return { available: false, version: null, error: error.message };
  }
});

// NEW: Launcher state management
let launcherState = {
  initialized: false,
  gameReady: false,
  downloadInProgress: false,
  currentVersion: { minecraft: null, fabric: null },
  lastDetection: null,
  crashDetectionEnabled: crashDetectionEnabled,
  lastCrashReport: lastCrashReport,
  repairInProgress: repairInProgress,
  deltaUpdaterState: null
};

ipcMain.handle('launcher:get-state', () => {
  // Include delta updater state if available
  if (deltaUpdater) {
    launcherState.deltaUpdaterState = deltaUpdater.getState();
  }
  return launcherState;
});

ipcMain.handle('launcher:set-state', (event, newState) => {
  launcherState = { ...launcherState, ...newState };
  
  // Broadcast state change to all windows
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('launcher-state-change', launcherState);
    }
  });
  
  return launcherState;
});

// NEW: Enhanced logging system
const logHistory = [];
const MAX_LOG_ENTRIES = 1000;

function logToHistory(level, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
    pid: process.pid
  };
  
  logHistory.push(entry);
  
  // Keep only recent entries
  if (logHistory.length > MAX_LOG_ENTRIES) {
    logHistory.shift();
  }
  
  // Also log to console
  console.log(`[${level.toUpperCase()}] ${message}`, data || '');
}

ipcMain.handle('logger:log', (event, level, message, data) => {
  logToHistory(level, message, data);
});

ipcMain.handle('logger:debug', (event, message, data) => {
  logToHistory('DEBUG', message, data);
});

ipcMain.handle('logger:info', (event, message, data) => {
  logToHistory('INFO', message, data);
});

ipcMain.handle('logger:warn', (event, message, data) => {
  logToHistory('WARN', message, data);
});

ipcMain.handle('logger:error', (event, message, data) => {
  logToHistory('ERROR', message, data);
});

ipcMain.handle('logger:get-logs', (event, limit = 100) => {
  return logHistory.slice(-limit);
});

// NEW: Error handling and reporting
ipcMain.handle('error:report', async (event, errorData) => {
  console.error('Error reported from renderer:', errorData);
  
  // Log to history
  logToHistory('ERROR', `Renderer Error: ${errorData.message}`, errorData);
  
  // Save to error log file
  try {
    const fs = require('fs');
    const errorLogPath = path.join(app.getPath('userData'), 'error.log');
    const errorEntry = `[${errorData.timestamp}] ${errorData.context}: ${errorData.message}\n${errorData.stack || 'No stack trace'}\n\n`;
    
    fs.appendFileSync(errorLogPath, errorEntry);
  } catch (err) {
    console.error('Failed to write error to log file:', err);
  }
  
  return { received: true, timestamp: new Date().toISOString() };
});

// Enhanced error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logToHistory('FATAL', 'Uncaught Exception', { message: error.message, stack: error.stack });
  
  if (isAppReady) {
    dialog.showErrorBox(
      'FantasticLauncher - Critical Error',
      `An unexpected error occurred:\n\n${error.message}\n\nThe application will attempt to continue, but you may need to restart.`
    );
  }
  
  if (splashManager && splashManager.splashWindow && !splashManager.splashWindow.isDestroyed()) {
    splashManager.handleInitializationError(error);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logToHistory('ERROR', 'Unhandled Promise Rejection', { reason: reason.toString(), promise: promise.toString() });
  
  const error = new Error(reason);
  
  if (isAppReady) {
    dialog.showErrorBox(
      'FantasticLauncher - Unhandled Promise',
      `An unhandled promise rejection occurred:\n\n${error.message}\n\nPlease check the console for more details.`
    );
  }
  
  if (splashManager && splashManager.splashWindow && !splashManager.splashWindow.isDestroyed()) {
    splashManager.handleInitializationError(error);
  }
});

// Handle certificate errors (for HTTPS requests)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Export for other modules
module.exports = {
  getSplashManager: () => splashManager,
  getMainWindow: () => splashManager ? splashManager.getMainWindow() : null,
  getDeltaUpdater: () => deltaUpdater, // NEW: Delta updater getter
  getLauncherState: () => launcherState,
  updateLauncherState: (newState) => {
    launcherState = { ...launcherState, ...newState };
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('launcher-state-change', launcherState);
      }
    });
  },
  getCrashDetectionStatus: () => ({
    enabled: crashDetectionEnabled,
    lastCrashReport: lastCrashReport,
    repairInProgress: repairInProgress
  }),
  triggerManualRepair: triggerManualRepair
};