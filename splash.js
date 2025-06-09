// splash.js - Enhanced Splash Screen Manager with Game Auto-Detection

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

class SplashScreenManager {
  constructor() {
    this.splashWindow = null;
    this.mainWindow = null;
    this.isInitializationComplete = false;
    this.gameDetectionResult = null;
    this.initializationProgress = 0;
    this.autoDetectionEnabled = true;
    this.skipDownloadPrompt = false;
  }

  /**
   * Create and show the splash screen with auto-detection capabilities
   */
  createSplashScreen() {
    this.splashWindow = new BrowserWindow({
      width: 900,  // Larger for more detailed information
      height: 650,
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
      
      // Start the enhanced initialization process
      this.startEnhancedInitialization();
    });

    // Handle splash window events
    this.splashWindow.on('closed', () => {
      this.splashWindow = null;
    });

    // Prevent premature closing
    this.splashWindow.on('close', (event) => {
      if (!this.isInitializationComplete) {
        event.preventDefault();
      }
    });

    return this.splashWindow;
  }

  /**
   * Enhanced initialization with auto-detection
   */
  async startEnhancedInitialization() {
    try {
      const launcher = require('./src/launcher');
      const assetVerifier = require('./src/asset-verifier');
      
      // Phase 1: Basic initialization (0-10%)
      this.updateSplashProgress(2, 'Starting launcher...', 'Initializing core systems');
      await this.delay(300);
      
      const initResult = await launcher.initialize();
      if (!initResult || initResult.status !== 'initialized') {
        throw new Error('Failed to initialize launcher');
      }
      
      this.updateSplashProgress(8, 'Core systems ready', 'Launcher initialized successfully');
      await this.delay(200);
      
      // Phase 2: Asset verifier initialization (10-15%)
      this.updateSplashProgress(10, 'Preparing verification tools...', 'Loading asset verifier');
      await assetVerifier.initialize();
      
      this.updateSplashProgress(15, 'Verification tools ready', 'Asset verifier initialized');
      await this.delay(200);
      
      // Phase 3: Get game versions (15-25%)
      this.updateSplashProgress(18, 'Fetching game versions...', 'Connecting to version servers');
      
      let minecraftVersion, fabricVersion;
      try {
        minecraftVersion = await launcher.getLatestMinecraftVersion();
        this.updateSplashProgress(20, 'Minecraft version found', `Latest: ${minecraftVersion}`);
        
        fabricVersion = await launcher.getLatestFabricVersion(minecraftVersion);
        this.updateSplashProgress(25, 'Fabric version found', `Latest: ${fabricVersion}`);
        
        await this.delay(300);
      } catch (err) {
        this.log(`Warning: Could not fetch latest versions: ${err.message}`);
        minecraftVersion = '1.21.1'; // Fallback
        fabricVersion = '0.15.0';
        this.updateSplashProgress(25, 'Using fallback versions', 'Could not connect to servers');
      }
      
      // Phase 4: AUTO-DETECTION - This is the key enhancement (25-85%)
      this.updateSplashProgress(30, 'Scanning for existing game files...', 'Auto-detecting installations');
      
      this.gameDetectionResult = await assetVerifier.autoDetectAndVerifyGame(
        minecraftVersion, 
        fabricVersion,
        (progress, text, status) => {
          // Progress callback from auto-detection
          const adjustedProgress = 30 + (progress * 0.55); // Scale 0-100% to 30-85%
          this.updateSplashProgress(adjustedProgress, text, status);
        }
      );
      
      // Phase 5: Handle detection results (85-95%)
      this.updateSplashProgress(88, 'Processing detection results...', 'Analyzing game status');
      await this.handleDetectionResults();
      
      // Phase 6: Final preparation (95-100%)
      this.updateSplashProgress(95, 'Preparing main interface...', 'Loading launcher UI');
      await this.createMainWindow();
      
      this.updateSplashProgress(98, 'Finalizing startup...', 'Almost ready');
      await this.delay(500);
      
      this.updateSplashProgress(100, 'Ready!', this.generateReadyMessage());
      await this.delay(800);
      
      // Mark initialization as complete
      this.isInitializationComplete = true;
      
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
   * Create the main launcher window with detection results
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

    // Send detection results to renderer when ready
    this.mainWindow.webContents.once('dom-ready', () => {
      if (this.gameDetectionResult) {
        this.mainWindow.webContents.send('game-detection-complete', this.gameDetectionResult);
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
   * Generate ready message based on detection results
   */
  generateReadyMessage() {
    if (!this.gameDetectionResult) {
      return 'Initialization complete';
    }
    
    const { hasExistingInstallation, needsFullDownload, needsPartialDownload, missingComponents } = this.gameDetectionResult;
    
    if (!hasExistingInstallation || needsFullDownload) {
      return 'New installation - download required';
    } else if (needsPartialDownload) {
      return `Updates needed - ${missingComponents.length} component(s)`;
    } else {
      return 'Game ready to launch!';
    }
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
   * Enhanced error handling with detection context
   */
  handleInitializationError(error) {
    console.error('Splash screen initialization error:', error);
    
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.webContents.send('splash-error', {
        message: error.message || 'An unexpected error occurred during initialization',
        details: error.stack || 'No additional details available',
        context: 'initialization',
        canRetry: true
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
      }
    }, 5000);
  }

  /**
   * Close splash screen with smooth transition
   */
  closeSplashScreen() {
    if (this.splashWindow && !this.splashWindow.isDestroyed() && this.isInitializationComplete) {
      // Send completion signal
      this.splashWindow.webContents.send('splash-complete', {
        gameDetection: this.gameDetectionResult
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
      gameDetection: this.gameDetectionResult
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
    const logMessage = `[${timestamp}] ${message}`;
    
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
   * Destroy all windows
   */
  destroy() {
    if (this.splashWindow && !this.splashWindow.isDestroyed()) {
      this.splashWindow.destroy();
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
    }
  }
}

module.exports = SplashScreenManager;