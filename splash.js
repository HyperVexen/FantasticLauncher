// splash.js - Enhanced Splash Screen Manager with Auto-Update System

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const DeltaUpdater = require('./src/delta-updater');

class SplashScreenManager {
  constructor() {
    this.splashWindow = null;
    this.mainWindow = null;
    this.isInitializationComplete = false;
    this.gameDetectionResult = null;
    this.initializationProgress = 0;
    this.autoDetectionEnabled = true;
    this.skipDownloadPrompt = false;
    
    // NEW: Auto-update system
    this.deltaUpdater = null;
    this.autoUpdateEnabled = true;
    this.autoUpdateThreshold = 30 * 1024 * 1024; // 30MB threshold
    this.updateInProgress = false;
    this.updateDownloaded = false;
    this.pendingUpdate = null;
  }

  /**
   * Create and show the splash screen with auto-update capabilities
   */
  createSplashScreen() {
    this.splashWindow = new BrowserWindow({
      width: 950,  // Slightly larger for update status
      height: 700,
      frame: false,
      alwaysOnTop: true,
      transparent: true,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'splash-preload.js')
      },
      icon: path.join(__dirname, 'assets', 'icon.png'),
      show: false
    });

    // Load the enhanced splash screen HTML
    this.splashWindow.loadFile('./splash.html');

    // Show splash screen when ready
    this.splashWindow.once('ready-to-show', () => {
      this.splashWindow.show();
      this.splashWindow.center();
      
      // Start the enhanced initialization process with auto-update
      this.startEnhancedInitializationWithUpdates();
    });

    // Handle splash window events
    this.splashWindow.on('closed', () => {
      this.splashWindow = null;
    });

    // Prevent premature closing during updates
    this.splashWindow.on('close', (event) => {
      if (!this.isInitializationComplete || this.updateInProgress) {
        event.preventDefault();
      }
    });

    return this.splashWindow;
  }

  /**
   * Enhanced initialization with auto-update system
   */
  async startEnhancedInitializationWithUpdates() {
    try {
      // Phase 0: Initialize Delta Updater (0-5%)
      this.updateSplashProgress(1, 'Initializing update system...', 'Setting up delta updater');
      await this.initializeDeltaUpdater();
      
      // Phase 1: Check for updates first (5-15%)
      this.updateSplashProgress(5, 'Checking for launcher updates...', 'Connecting to update servers');
      await this.checkForAutomaticUpdates();
      
      // Phase 2: Download small updates automatically (15-35% if updating)
      if (this.pendingUpdate && this.shouldAutoDownload(this.pendingUpdate)) {
        await this.performAutomaticUpdate();
        // Progress is handled within performAutomaticUpdate
      } else {
        // Skip to next phase if no auto-update
        this.updateSplashProgress(35, 'No automatic updates needed', 'Proceeding with initialization');
      }
      
      // Phase 3: Basic launcher initialization (35-45%)
      this.updateSplashProgress(37, 'Starting launcher...', 'Initializing core systems');
      await this.delay(300);
      
      const launcher = require('./src/launcher');
      const assetVerifier = require('./src/asset-verifier');
      
      const initResult = await launcher.initialize();
      if (!initResult || initResult.status !== 'initialized') {
        throw new Error('Failed to initialize launcher');
      }
      
      this.updateSplashProgress(43, 'Core systems ready', 'Launcher initialized successfully');
      await this.delay(200);
      
      // Phase 4: Asset verifier initialization (45-50%)
      this.updateSplashProgress(45, 'Preparing verification tools...', 'Loading asset verifier');
      await assetVerifier.initialize();
      
      this.updateSplashProgress(50, 'Verification tools ready', 'Asset verifier initialized');
      await this.delay(200);
      
      // Phase 5: Get game versions (50-60%)
      this.updateSplashProgress(53, 'Fetching game versions...', 'Connecting to version servers');
      
      let minecraftVersion, fabricVersion;
      try {
        minecraftVersion = await launcher.getLatestMinecraftVersion();
        this.updateSplashProgress(55, 'Minecraft version found', `Latest: ${minecraftVersion}`);
        
        fabricVersion = await launcher.getLatestFabricVersion(minecraftVersion);
        this.updateSplashProgress(60, 'Fabric version found', `Latest: ${fabricVersion}`);
        
        await this.delay(300);
      } catch (err) {
        this.log(`Warning: Could not fetch latest versions: ${err.message}`);
        minecraftVersion = '1.21.1'; // Fallback
        fabricVersion = '0.15.0';
        this.updateSplashProgress(60, 'Using fallback versions', 'Could not connect to servers');
      }
      
      // Phase 6: AUTO-DETECTION (60-90%)
      this.updateSplashProgress(65, 'Scanning for existing game files...', 'Auto-detecting installations');
      
      this.gameDetectionResult = await assetVerifier.autoDetectAndVerifyGame(
        minecraftVersion, 
        fabricVersion,
        (progress, text, status) => {
          // Progress callback from auto-detection
          const adjustedProgress = 65 + (progress * 0.25); // Scale 0-100% to 65-90%
          this.updateSplashProgress(adjustedProgress, text, status);
        }
      );
      
      // Phase 7: Handle detection results (90-95%)
      this.updateSplashProgress(92, 'Processing detection results...', 'Analyzing game status');
      await this.handleDetectionResults();
      
      // Phase 8: Final preparation (95-100%)
      this.updateSplashProgress(95, 'Preparing main interface...', 'Loading launcher UI');
      await this.createMainWindow();
      
      this.updateSplashProgress(98, 'Finalizing startup...', 'Almost ready');
      await this.delay(500);
      
      this.updateSplashProgress(100, 'Ready!', this.generateReadyMessage());
      await this.delay(800);
      
      // Mark initialization as complete
      this.isInitializationComplete = true;
      
      // Show update notification if there's a pending update that wasn't auto-downloaded
      if (this.pendingUpdate && !this.updateDownloaded) {
        this.showLargeUpdateNotification();
      }
      
      // Auto-close splash screen after showing results
      setTimeout(() => {
        this.closeSplashScreen();
      }, 2000);
      
    } catch (error) {
      console.error('Enhanced initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Initialize Delta Updater
   */
  async initializeDeltaUpdater() {
    try {
      const { app } = require('electron');
      
      this.deltaUpdater = new DeltaUpdater({
        githubOwner: 'HyperVexen',
        githubRepo: 'FantasticLauncher',
        currentVersion: app.getVersion(),
        appName: 'FantasticLauncher',
        autoDownload: false, // We'll handle this manually
        autoInstall: false,  // We'll handle this manually
        checkInterval: 0     // Disable automatic checking
      });
      
      // Set up callbacks for update events
      this.deltaUpdater.setCallbacks({
        onUpdateAvailable: (updateInfo) => {
          this.log(`Update available: ${updateInfo.version}`);
          this.pendingUpdate = updateInfo;
        },
        
        onUpdateProgress: (progressInfo) => {
          this.handleUpdateProgress(progressInfo);
        },
        
        onUpdateDownloaded: (updateInfo) => {
          this.log('Update downloaded successfully');
          this.updateDownloaded = true;
          this.updateInProgress = false;
        },
        
        onError: (error) => {
          this.log(`Update error: ${error.message}`, true);
          this.updateInProgress = false;
        }
      });
      
      this.log('Delta updater initialized');
    } catch (error) {
      this.log(`Failed to initialize delta updater: ${error.message}`, true);
      this.autoUpdateEnabled = false;
    }
  }

  /**
   * Check for automatic updates
   */
  async checkForAutomaticUpdates() {
    if (!this.autoUpdateEnabled || !this.deltaUpdater) {
      this.updateSplashProgress(15, 'Auto-update disabled', 'Skipping update check');
      return;
    }

    try {
      this.updateSplashProgress(8, 'Checking for updates...', 'Querying GitHub releases');
      
      const updateInfo = await this.deltaUpdater.checkForUpdates();
      
      if (updateInfo) {
        const updateSize = this.calculateUpdateSize(updateInfo);
        this.updateSplashProgress(15, 'Update found!', 
          `Version ${updateInfo.version} available (${this.formatFileSize(updateSize)})`);
        
        this.pendingUpdate = {
          ...updateInfo,
          estimatedSize: updateSize
        };
        
        this.log(`Found update: ${updateInfo.version} (${this.formatFileSize(updateSize)})`);
      } else {
        this.updateSplashProgress(15, 'No updates available', 'Launcher is up to date');
        this.log('No updates available');
      }
      
    } catch (error) {
      this.log(`Update check failed: ${error.message}`, true);
      this.updateSplashProgress(15, 'Update check failed', 'Proceeding without updates');
    }
  }

  /**
   * Calculate estimated update size
   */
  calculateUpdateSize(updateInfo) {
    let totalSize = 0;
    
    // Add delta files size
    if (updateInfo.deltaFiles) {
      for (const deltaFile of updateInfo.deltaFiles) {
        totalSize += deltaFile.size || 0;
      }
    }
    
    // Add new files size
    if (updateInfo.newFiles) {
      totalSize += updateInfo.newFiles.size || 0;
    }
    
    return totalSize;
  }

  /**
   * Check if update should be downloaded automatically
   */
  shouldAutoDownload(updateInfo) {
    if (!updateInfo || !this.autoUpdateEnabled) {
      return false;
    }
    
    const updateSize = updateInfo.estimatedSize || this.calculateUpdateSize(updateInfo);
    return updateSize <= this.autoUpdateThreshold;
  }

  /**
   * Perform automatic update download
   */
  async performAutomaticUpdate() {
    if (!this.pendingUpdate || this.updateInProgress) {
      return;
    }
    
    this.updateInProgress = true;
    const updateSize = this.pendingUpdate.estimatedSize;
    
    try {
      this.updateSplashProgress(18, 'Downloading update automatically...', 
        `Downloading ${this.formatFileSize(updateSize)} update`);
      
      // Start the download
      await this.deltaUpdater.downloadUpdate(this.pendingUpdate);
      
      // Update will be applied after main launcher starts
      this.updateSplashProgress(35, 'Update downloaded!', 
        `Version ${this.pendingUpdate.version} ready to install`);
      
      this.log(`Auto-downloaded update: ${this.pendingUpdate.version}`);
      
    } catch (error) {
      this.log(`Auto-update download failed: ${error.message}`, true);
      this.updateSplashProgress(35, 'Update download failed', 'Proceeding with current version');
      this.updateInProgress = false;
    }
  }

  /**
   * Handle update progress during download
   */
  handleUpdateProgress(progressInfo) {
    if (progressInfo.type === 'download') {
      const progress = progressInfo.progress || 0;
      const adjustedProgress = 18 + (progress * 0.17); // Scale to 18-35% range
      
      let statusText = `Downloading update: ${progress}%`;
      if (progressInfo.file) {
        statusText += ` (${progressInfo.file})`;
      }
      
      this.updateSplashProgress(adjustedProgress, 'Downloading update...', statusText);
    }
  }

  /**
   * Show notification for large updates that weren't auto-downloaded
   */
  showLargeUpdateNotification() {
    if (!this.pendingUpdate) return;
    
    const updateSize = this.pendingUpdate.estimatedSize;
    const message = `Update ${this.pendingUpdate.version} available (${this.formatFileSize(updateSize)}) - Will be shown in launcher`;
    
    this.updateSplashProgress(100, 'Large update available', message);
    this.log(`Large update notification: ${message}`);
  }

  /**
   * Handle detection results and decide next steps
   */
  async handleDetectionResults() {
    if (!this.gameDetectionResult) {
      this.log('No detection results available');
      return;
    }
    
    const { hasExistingInstallation, needsFullDownload, needsPartialDownload, missingComponents } = this.gameDetectionResult;
    
    if (!hasExistingInstallation || needsFullDownload) {
      // Full installation needed
      this.updateSplashProgress(90, 'Full installation required', 
        `Download needed: ${this.gameDetectionResult.downloadEstimate?.size || '~150 MB'}`);
      
      // Store result for main window to handle
      this.gameDetectionResult.requiresUserAction = true;
      this.gameDetectionResult.actionType = 'full_download';
      
    } else if (needsPartialDownload) {
      // Partial download needed
      const missingText = missingComponents.join(', ');
      this.updateSplashProgress(90, 'Partial download required', 
        `Missing: ${missingText} (${this.gameDetectionResult.downloadEstimate?.size || '~50 MB'})`);
      
      this.gameDetectionResult.requiresUserAction = true;
      this.gameDetectionResult.actionType = 'partial_download';
      
    } else {
      // Game is ready!
      this.updateSplashProgress(92, 'Game installation verified', 'All components present and verified');
      this.gameDetectionResult.requiresUserAction = false;
      this.gameDetectionResult.actionType = 'ready_to_play';
    }
  }

  /**
   * Create the main launcher window with detection and update results
   */
  async createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1000,
      height: 750,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      },
      icon: path.join(__dirname, 'assets', 'icon.png'),
      show: false
    });

    // Load the main launcher interface
    this.mainWindow.loadFile('./index.html');

    // Send detection and update results to renderer when ready
    this.mainWindow.webContents.once('dom-ready', () => {
      if (this.gameDetectionResult) {
        this.mainWindow.webContents.send('game-detection-complete', this.gameDetectionResult);
      }
      
      // Send update information
      if (this.pendingUpdate) {
        this.mainWindow.webContents.send('launcher-update-available', {
          updateInfo: this.pendingUpdate,
          autoDownloaded: this.updateDownloaded,
          readyToInstall: this.updateDownloaded,
          autoUpdateThreshold: this.autoUpdateThreshold
        });
      }
    });

    // Show main window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      this.mainWindow.center();
    });

    // Handle main window closed
    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    return this.mainWindow;
  }

  /**
   * Generate ready message based on detection and update results
   */
  generateReadyMessage() {
    let message = '';
    
    // Update status first
    if (this.updateDownloaded) {
      message = 'Launcher update ready to install';
    } else if (this.pendingUpdate && !this.shouldAutoDownload(this.pendingUpdate)) {
      message = 'Large launcher update available';
    } else {
      message = 'Launcher up to date';
    }
    
    // Game status second
    if (this.gameDetectionResult) {
      const { hasExistingInstallation, needsFullDownload, needsPartialDownload, missingComponents } = this.gameDetectionResult;
      
      if (!hasExistingInstallation || needsFullDownload) {
        message += ' • Game download required';
      } else if (needsPartialDownload) {
        message += ` • Game updates needed (${missingComponents.length} components)`;
      } else {
        message += ' • Game ready to launch!';
      }
    }
    
    return message;
  }

  /**
   * Update splash screen progress with enhanced information
   */
  updateSplashProgress(percent, text = '', status = '') {
    this.initializationProgress = Math.max(this.initializationProgress, percent);
    
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send('splash-update', {
        progress: this.initializationProgress,
        text: text,
        status: status,
        updateInfo: this.pendingUpdate ? {
          available: true,
          version: this.pendingUpdate.version,
          size: this.formatFileSize(this.pendingUpdate.estimatedSize || 0),
          autoDownloaded: this.updateDownloaded,
          inProgress: this.updateInProgress
        } : null,
        gameDetection: this.gameDetectionResult ? {
          hasExisting: this.gameDetectionResult.hasExistingInstallation,
          needsDownload: this.gameDetectionResult.needsFullDownload || this.gameDetectionResult.needsPartialDownload,
          downloadSize: this.gameDetectionResult.downloadEstimate?.size,
          missingCount: this.gameDetectionResult.missingComponents?.length || 0
        } : null
      });
    }
  }

  /**
   * Enhanced error handling with update context
   */
  handleInitializationError(error) {
    console.error('Splash screen initialization error:', error);
    
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send('splash-error', {
        message: error.message || 'An unexpected error occurred during initialization',
        details: error.stack || 'No additional details available',
        context: this.updateInProgress ? 'update' : 'initialization',
        canRetry: true,
        updateRelated: this.updateInProgress
      });
    }

    // Auto-retry after 5 seconds
    setTimeout(() => {
      if (this.splashWindow && !this.splashWindow.isDestroyed()) {
        this.splashWindow.webContents.send('splash-retry');
        
        // Reset state for retry
        this.isInitializationComplete = false;
        this.initializationProgress = 0;
        this.gameDetectionResult = null;
        this.updateInProgress = false;
        this.pendingUpdate = null;
      }
    }, 5000);
  }

  /**
   * Close splash screen with smooth transition
   */
  closeSplashScreen() {
    if (this.splashWindow && !this.splashWindow.isDestroyed() && this.isInitializationComplete) {
      // Send completion signal with update status
      this.splashWindow.webContents.send('splash-complete', {
        gameDetection: this.gameDetectionResult,
        updateStatus: {
          available: !!this.pendingUpdate,
          downloaded: this.updateDownloaded,
          version: this.pendingUpdate?.version,
          size: this.pendingUpdate ? this.formatFileSize(this.pendingUpdate.estimatedSize || 0) : null
        }
      });
      
      // Fade out effect
      this.splashWindow.webContents.executeJavaScript(`
        document.body.style.transition = 'opacity 0.8s ease-out';
        document.body.style.opacity = '0';
      `);
      
      setTimeout(() => {
        if (this.splashWindow && !this.splashWindow.isDestroyed()) {
          this.splashWindow.close();
          this.splashWindow = null;
        }
      }, 800);
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get update status for main window
   */
  getUpdateStatus() {
    return {
      available: !!this.pendingUpdate,
      downloaded: this.updateDownloaded,
      inProgress: this.updateInProgress,
      autoUpdateThreshold: this.autoUpdateThreshold,
      updateInfo: this.pendingUpdate
    };
  }

  /**
   * Trigger manual update download (for large updates)
   */
  async downloadLargeUpdate() {
    if (!this.pendingUpdate || this.updateInProgress) {
      return { success: false, error: 'No update available or already in progress' };
    }
    
    try {
      this.updateInProgress = true;
      await this.deltaUpdater.downloadUpdate(this.pendingUpdate);
      this.updateDownloaded = true;
      this.updateInProgress = false;
      
      return { success: true };
    } catch (error) {
      this.updateInProgress = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Install downloaded update
   */
  async installUpdate() {
    if (!this.updateDownloaded || !this.deltaUpdater) {
      return { success: false, error: 'No update downloaded' };
    }
    
    try {
      await this.deltaUpdater.installUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detection results for main window
   */
  getDetectionResults() {
    return this.gameDetectionResult;
  }

  /**
   * Get the main window instance
   */
  getMainWindow() {
    return this.mainWindow;
  }

  /**
   * Check if initialization is complete
   */
  isReady() {
    return this.isInitializationComplete;
  }

  /**
   * Get current initialization progress
   */
  getProgress() {
    return {
      progress: this.initializationProgress,
      isComplete: this.isInitializationComplete,
      gameDetection: this.gameDetectionResult,
      updateStatus: this.getUpdateStatus()
    };
  }

  /**
   * Utility function to add delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Logging function
   */
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[SplashManager] [${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Force close splash screen (emergency)
   */
  forceCloseSplash() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.destroy();
      this.splashWindow = null;
    }
  }

  /**
   * Destroy all windows and cleanup
   */
  destroy() {
    if (this.deltaUpdater) {
      this.deltaUpdater.destroy();
    }
    
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.destroy();
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }
  }
}

module.exports = SplashScreenManager;