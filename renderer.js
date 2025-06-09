// renderer.js - Enhanced with Delta Update System and Smart Update Detection

// DOM Elements
const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

// Form elements
const usernameSelect = document.getElementById('username-select');
const addAccountBtn = document.getElementById('add-account-btn');
const minecraftVersionDisplay = document.getElementById('minecraft-version-display');
const fabricVersionDisplay = document.getElementById('fabric-version-display');
const ramMinSelect = document.getElementById('ram-min');
const ramMaxSelect = document.getElementById('ram-max');
const ramDisplay = document.getElementById('ram-display');
const downloadStatusDisplay = document.getElementById('download-status');
const currentUsernameDisplay = document.getElementById('current-username');

// Buttons
const downloadBtn = document.getElementById('download-btn');
const playBtn = document.getElementById('play-btn');

// Account management
const addNewAccountBtn = document.getElementById('add-new-account');
const addAccountForm = document.getElementById('add-account-form');
const newUsernameInput = document.getElementById('new-username');
const accountTypeSelect = document.getElementById('account-type');
const saveAccountBtn = document.getElementById('save-account');
const cancelAccountBtn = document.getElementById('cancel-account');
const accountsList = document.getElementById('accounts-list');

// Status elements
const statusMessage = document.getElementById('status-message');
const progressBar = document.getElementById('progress-bar');

// NEW: Delta update elements
const updateButton = document.getElementById('update-btn');
const updateDialog = document.getElementById('update-dialog');

// Smart Update Detection System - INTEGRATED DIRECTLY
class SmartUpdateDetector {
  constructor() {
    this.currentVersions = {
      minecraft: null,
      fabric: null,
      lastCheck: null
    };
    
    this.availableVersions = {
      minecraft: null,
      fabric: null
    };
    
    this.versionHistory = [];
  }
  
  // Load stored version information
  loadStoredVersions() {
    try {
      const stored = localStorage.getItem('fantasticLauncher.versions');
      if (stored) {
        this.currentVersions = JSON.parse(stored);
      }
      
      const history = localStorage.getItem('fantasticLauncher.versionHistory');
      if (history) {
        this.versionHistory = JSON.parse(history);
      }
    } catch (error) {
      console.error('Failed to load stored versions:', error);
    }
  }
  
  // Save version information
  saveVersions() {
    try {
      localStorage.setItem('fantasticLauncher.versions', JSON.stringify(this.currentVersions));
      localStorage.setItem('fantasticLauncher.versionHistory', JSON.stringify(this.versionHistory));
    } catch (error) {
      console.error('Failed to save versions:', error);
    }
  }
  
  // Check for version updates
  async checkForVersionUpdates(launcher) {
    try {
      // Get latest available versions
      const latestMinecraft = await launcher.getLatestMinecraftVersion();
      const latestFabric = await launcher.getLatestFabricVersion(latestMinecraft);
      
      this.availableVersions.minecraft = latestMinecraft;
      this.availableVersions.fabric = latestFabric;
      
      // Compare with stored versions
      const updateInfo = {
        hasUpdates: false,
        minecraftUpdate: false,
        fabricUpdate: false,
        isNewInstallation: false,
        updateType: 'none', // 'major', 'minor', 'patch', 'none'
        updateAction: 'download' // 'update', 'download'
      };
      
      // Check if this is a new installation (no stored versions)
      if (!this.currentVersions.minecraft || !this.currentVersions.fabric) {
        updateInfo.isNewInstallation = true;
        updateInfo.updateAction = 'download';
        return updateInfo;
      }
      
      // Check for Minecraft update
      if (this.currentVersions.minecraft !== latestMinecraft) {
        updateInfo.hasUpdates = true;
        updateInfo.minecraftUpdate = true;
        updateInfo.updateType = this.getUpdateType(this.currentVersions.minecraft, latestMinecraft);
      }
      
      // Check for Fabric update
      if (this.currentVersions.fabric !== latestFabric) {
        updateInfo.hasUpdates = true;
        updateInfo.fabricUpdate = true;
        
        // Fabric updates are usually minor unless Minecraft also updated
        const fabricUpdateType = updateInfo.minecraftUpdate ? 'minor' : 'patch';
        if (updateInfo.updateType === 'none') {
          updateInfo.updateType = fabricUpdateType;
        }
      }
      
      // Determine action text
      if (updateInfo.hasUpdates) {
        updateInfo.updateAction = 'update';
      } else {
        updateInfo.updateAction = 'download'; // For re-download scenarios
      }
      
      return updateInfo;
    } catch (error) {
      console.error('Failed to check for version updates:', error);
      return {
        hasUpdates: false,
        isNewInstallation: true,
        updateAction: 'download',
        error: error.message
      };
    }
  }
  
  // Determine update type based on version comparison
  getUpdateType(oldVersion, newVersion) {
    try {
      // Parse version numbers (e.g., "1.21.1" -> [1, 21, 1])
      const oldParts = oldVersion.split('.').map(n => parseInt(n) || 0);
      const newParts = newVersion.split('.').map(n => parseInt(n) || 0);
      
      // Pad arrays to same length
      const maxLength = Math.max(oldParts.length, newParts.length);
      while (oldParts.length < maxLength) oldParts.push(0);
      while (newParts.length < maxLength) newParts.push(0);
      
      // Compare version parts
      for (let i = 0; i < maxLength; i++) {
        if (newParts[i] > oldParts[i]) {
          if (i === 0) return 'major';      // 1.20 -> 1.21
          if (i === 1) return 'minor';      // 1.21.0 -> 1.21.1
          return 'patch';                   // 1.21.1 -> 1.21.2
        }
        if (newParts[i] < oldParts[i]) {
          return 'downgrade'; // Shouldn't happen normally
        }
      }
      
      return 'none'; // Same version
    } catch (error) {
      return 'unknown';
    }
  }
  
  // Update stored versions after successful download
  updateStoredVersions(minecraftVersion, fabricVersion) {
    const previousVersions = { ...this.currentVersions };
    
    this.currentVersions.minecraft = minecraftVersion;
    this.currentVersions.fabric = fabricVersion;
    this.currentVersions.lastCheck = new Date().toISOString();
    
    // Add to version history
    this.versionHistory.push({
      minecraft: minecraftVersion,
      fabric: fabricVersion,
      date: new Date().toISOString(),
      action: 'installed'
    });
    
    // Keep only last 10 entries
    if (this.versionHistory.length > 10) {
      this.versionHistory = this.versionHistory.slice(-10);
    }
    
    this.saveVersions();
    
    return {
      previous: previousVersions,
      current: this.currentVersions,
      wasUpdate: previousVersions.minecraft !== minecraftVersion || 
                 previousVersions.fabric !== fabricVersion
    };
  }
  
  // Get update description for UI
  getUpdateDescription(updateInfo) {
    if (updateInfo.isNewInstallation) {
      return {
        title: 'New Installation',
        description: `Install Minecraft ${this.availableVersions.minecraft} with Fabric ${this.availableVersions.fabric}`,
        buttonText: 'Download Game',
        buttonIcon: '⬇️'
      };
    }
    
    if (!updateInfo.hasUpdates) {
      return {
        title: 'Up to Date',
        description: 'Your game is up to date',
        buttonText: 'Re-download',
        buttonIcon: '🔄'
      };
    }
    
    // Build update description
    let title = '';
    let description = '';
    const updates = [];
    
    if (updateInfo.minecraftUpdate) {
      updates.push(`Minecraft ${this.currentVersions.minecraft} → ${this.availableVersions.minecraft}`);
    }
    
    if (updateInfo.fabricUpdate) {
      updates.push(`Fabric ${this.currentVersions.fabric} → ${this.availableVersions.fabric}`);
    }
    
    switch (updateInfo.updateType) {
      case 'major':
        title = 'Major Update Available';
        break;
      case 'minor':
        title = 'Minor Update Available';
        break;
      case 'patch':
        title = 'Patch Update Available';
        break;
      default:
        title = 'Update Available';
    }
    
    description = updates.join(' & ');
    
    return {
      title: title,
      description: description,
      buttonText: 'Update Game',
      buttonIcon: '🔄'
    };
  }
}

// Initialize the smart update detector
const smartUpdateDetector = new SmartUpdateDetector();

// NEW: Delta Update Manager
class DeltaUpdateManager {
  constructor() {
    this.state = {
      checking: false,
      available: false,
      downloading: false,
      installing: false,
      updateInfo: null,
      downloadProgress: 0,
      error: null
    };
    
    this.callbacks = {
      onStateChange: null,
      onUpdateAvailable: null,
      onDownloadProgress: null,
      onUpdateReady: null,
      onError: null
    };
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    if (window.deltaUpdater) {
      // Listen for delta update events
      window.deltaUpdater.onUpdateAvailable((updateData) => {
        this.handleUpdateAvailable(updateData);
      });
      
      window.deltaUpdater.onUpdateProgress((progressData) => {
        this.handleUpdateProgress(progressData);
      });
      
      window.deltaUpdater.onUpdateDownloaded((updateData) => {
        this.handleUpdateDownloaded(updateData);
      });
      
      window.deltaUpdater.onUpdateInstalled((updateData) => {
        this.handleUpdateInstalled(updateData);
      });
      
      window.deltaUpdater.onUpdateError((errorData) => {
        this.handleUpdateError(errorData);
      });
      
      window.deltaUpdater.onStateChange((stateData) => {
        this.handleStateChange(stateData);
      });
    }
    
    // Listen for custom events
    window.addEventListener('deltaUpdateAvailable', (event) => {
      this.handleUpdateAvailable(event.detail);
    });
    
    window.addEventListener('deltaUpdateProgress', (event) => {
      this.handleUpdateProgress(event.detail);
    });
    
    window.addEventListener('deltaUpdateDownloaded', (event) => {
      this.handleUpdateDownloaded(event.detail);
    });
    
    window.addEventListener('deltaUpdateInstalled', (event) => {
      this.handleUpdateInstalled(event.detail);
    });
    
    window.addEventListener('deltaUpdateError', (event) => {
      this.handleUpdateError(event.detail);
    });
  }
  
  async checkForUpdates() {
    if (this.state.checking) {
      console.log('Update check already in progress');
      return;
    }
    
    this.updateState({ checking: true, error: null });
    
    try {
      if (window.deltaUpdater) {
        const result = await window.deltaUpdater.checkForUpdates();
        
        if (result.available) {
          this.updateState({ 
            checking: false, 
            available: true, 
            updateInfo: result.updateInfo 
          });
          
          if (this.callbacks.onUpdateAvailable) {
            this.callbacks.onUpdateAvailable(result.updateInfo);
          }
        } else {
          this.updateState({ 
            checking: false, 
            available: false 
          });
        }
        
        return result;
      }
    } catch (error) {
      this.updateState({ 
        checking: false, 
        error: error.message 
      });
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
    }
  }
  
  async downloadUpdate() {
    if (!this.state.available || this.state.downloading) {
      return;
    }
    
    this.updateState({ downloading: true, error: null });
    
    try {
      if (window.deltaUpdater) {
        const result = await window.deltaUpdater.downloadUpdate();
        return result;
      }
    } catch (error) {
      this.updateState({ 
        downloading: false, 
        error: error.message 
      });
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
    }
  }
  
  async installUpdate() {
    if (this.state.installing) {
      return;
    }
    
    this.updateState({ installing: true, error: null });
    
    try {
      if (window.deltaUpdater) {
        const result = await window.deltaUpdater.installUpdate();
        return result;
      }
    } catch (error) {
      this.updateState({ 
        installing: false, 
        error: error.message 
      });
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
    }
  }
  
  handleUpdateAvailable(updateData) {
    console.log('Delta update available:', updateData);
    
    this.updateState({
      available: true,
      updateInfo: updateData.updateInfo,
      checking: false
    });
    
    // Show update button
    this.showUpdateButton(updateData);
    
    // Add update notification to news
    this.addUpdateNewsItem(updateData);
  }
  
  handleUpdateProgress(progressData) {
    console.log('Delta update progress:', progressData);
    
    this.updateState({
      downloadProgress: progressData.progress || 0
    });
    
    if (this.callbacks.onDownloadProgress) {
      this.callbacks.onDownloadProgress(progressData);
    }
    
    // Update progress in UI
    this.updateProgressDisplay(progressData);
  }
  
  handleUpdateDownloaded(updateData) {
    console.log('Delta update downloaded:', updateData);
    
    this.updateState({
      downloading: false,
      downloadProgress: 100
    });
    
    // Show install option
    this.showInstallOption(updateData);
    
    if (this.callbacks.onUpdateReady) {
      this.callbacks.onUpdateReady(updateData);
    }
  }
  
  handleUpdateInstalled(updateData) {
    console.log('Delta update installed:', updateData);
    
    this.updateState({
      installing: false,
      available: false,
      updateInfo: null
    });
    
    // Show restart dialog
    this.showRestartDialog(updateData);
  }
  
  handleUpdateError(errorData) {
    console.error('Delta update error:', errorData);
    
    this.updateState({
      checking: false,
      downloading: false,
      installing: false,
      error: errorData.error
    });
    
    // Show error notification
    this.showErrorNotification(errorData);
    
    if (this.callbacks.onError) {
      this.callbacks.onError(new Error(errorData.error));
    }
  }
  
  handleStateChange(stateData) {
    console.log('Delta updater state change:', stateData);
    
    // Update local state to match updater state
    this.updateState({
      checking: stateData.checking || false,
      downloading: stateData.downloading || false,
      installing: stateData.installing || false,
      available: stateData.updateAvailable || false
    });
  }
  
  showUpdateButton(updateData) {
    if (updateButton) {
      updateButton.classList.remove('hidden');
      updateButton.classList.add('flash');
      
      const benefits = window.deltaUtils?.calculateUpdateBenefits(updateData.updateInfo);
      const sizeText = benefits ? window.utils.formatFileSize(benefits.deltaSize) : 'Unknown size';
      
      updateButton.textContent = `Update Available! (${sizeText})`;
      updateButton.title = `${updateData.updateInfo.version} - ${updateData.updateInfo.releaseNotes || 'No release notes'}`;
    }
  }
  
  showInstallOption(updateData) {
    if (updateButton) {
      updateButton.classList.remove('flash');
      updateButton.textContent = 'Install Update';
      updateButton.style.backgroundColor = '#10b981'; // Green color
    }
  }
  
  showRestartDialog(updateData) {
    if (updateDialog) {
      updateDialog.classList.remove('hidden');
      updateDialog.innerHTML = `
        <div class="modal-content">
          <h2>✅ Update Installed Successfully!</h2>
          <p>FantasticLauncher has been updated to version ${updateData.updateInfo?.version || 'latest'}.</p>
          <p>A restart is required to complete the update process.</p>
          <div class="update-buttons">
            <button class="btn btn-primary" onclick="restartApplication()">Restart Now</button>
            <button class="btn btn-secondary" onclick="hideUpdateDialog()">Restart Later</button>
          </div>
        </div>
      `;
    }
  }
  
  showErrorNotification(errorData) {
    showStatus(`Update error: ${errorData.error}`, 'error');
    
    // Add error to news
    const newsCard = document.querySelector('.news-card .card-content');
    if (newsCard) {
      const errorNews = `
        <div class="news-item" style="border-left-color: #ef4444;">
          <h4>❌ Update Error</h4>
          <p>Failed to update: ${errorData.error}</p>
          <small>${new Date().toLocaleTimeString()}</small>
        </div>
      `;
      newsCard.innerHTML = errorNews + newsCard.innerHTML;
    }
  }
  
  addUpdateNewsItem(updateData) {
    const newsCard = document.querySelector('.news-card .card-content');
    if (!newsCard) return;
    
    const benefits = window.deltaUtils?.calculateUpdateBenefits(updateData.updateInfo);
    const sizeText = benefits ? window.utils.formatFileSize(benefits.deltaSize) : 'Unknown size';
    const savingsText = benefits ? `${benefits.savingsPercentage.toFixed(1)}% smaller` : '';
    
    const updateNews = `
      <div class="news-item" style="border-left-color: #4f46e5;">
        <h4>🚀 Update Available!</h4>
        <p>Version ${updateData.updateInfo.version} is ready to download (${sizeText}${savingsText ? ' - ' + savingsText : ''})</p>
        <small>Just now</small>
      </div>
    `;
    
    newsCard.innerHTML = updateNews + newsCard.innerHTML;
  }
  
  updateProgressDisplay(progressData) {
    if (progressData.type === 'download') {
      updateProgress(progressData.progress);
      showStatus(`Downloading update: ${progressData.progress}%`, 'downloading');
    } else if (progressData.type === 'install') {
      updateProgress(progressData.progress);
      showStatus(`Installing update: ${progressData.progress}%`, 'downloading');
    }
  }
  
  updateState(changes) {
    Object.assign(this.state, changes);
    
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }
  
  getState() {
    return { ...this.state };
  }
  
  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }
}

// Initialize delta update manager
const deltaUpdateManager = new DeltaUpdateManager();

// Enhanced state management with crash detection and version tracking
let gameState = {
  minecraftVersion: null,
  fabricVersion: null,
  downloadComplete: false,
  currentAccount: null,
  accounts: [],
  // Auto-detection results
  detectionResult: null,
  gameReady: false,
  needsDownload: false,
  missingComponents: [],
  downloadEstimate: { size: '0 MB', time: '0 seconds' },
  // Crash detection state
  crashDetectionEnabled: true,
  lastCrashReport: null,
  repairInProgress: false,
  canRepair: false,
  gameRunning: false,
  // Version update state
  hasVersionUpdates: false,
  updateInfo: null,
  // NEW: Delta update state
  deltaUpdateAvailable: false,
  deltaUpdateInfo: null,
  deltaUpdateProgress: 0
};

// Page data
const pageData = {
  home: {
    title: 'Home',
    subtitle: 'Launch your Minecraft experience'
  },
  accounts: {
    title: 'Accounts',
    subtitle: 'Manage your player accounts'
  },
  settings: {
    title: 'Settings',
    subtitle: 'Configure launcher preferences'
  },
  about: {
    title: 'About',
    subtitle: 'Information about FantasticLauncher'
  }
};

// Update download button based on version updates
function updateDownloadButtonBasedOnVersions(updateInfo, gameState) {
  const description = smartUpdateDetector.getUpdateDescription(updateInfo);
  
  // Update button text and icon
  downloadBtn.innerHTML = `<i class="icon">${description.buttonIcon}</i> ${description.buttonText}`;
  
  // Update download status display
  if (updateInfo.isNewInstallation) {
    downloadStatusDisplay.textContent = 'Not Installed';
    downloadStatusDisplay.className = 'stat-value status-error';
  } else if (updateInfo.hasUpdates) {
    downloadStatusDisplay.textContent = `${description.title}`;
    downloadStatusDisplay.className = 'stat-value status-downloading';
  } else {
    downloadStatusDisplay.textContent = 'Up to Date';
    downloadStatusDisplay.className = 'stat-value status-ready';
  }
  
  // Store update info in game state
  gameState.hasVersionUpdates = updateInfo.hasUpdates;
  gameState.updateInfo = updateInfo;
  
  // Update news section with version information
  updateVersionNews(description, updateInfo);
}

// Update version news
function updateVersionNews(description, updateInfo) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  let newsContent = '';
  
  if (updateInfo.isNewInstallation) {
    newsContent = `
      <div class="news-item">
        <h4>🎮 ${description.title}</h4>
        <p>${description.description}</p>
        <small>Ready to install</small>
      </div>
    `;
  } else if (updateInfo.hasUpdates) {
    const updateTypeEmoji = {
      'major': '🚀',
      'minor': '✨', 
      'patch': '🔧'
    };
    
    newsContent = `
      <div class="news-item">
        <h4>${updateTypeEmoji[updateInfo.updateType] || '🔄'} ${description.title}</h4>
        <p>${description.description}</p>
        <small>Update available now</small>
      </div>
    `;
  } else {
    newsContent = `
      <div class="news-item">
        <h4>✅ ${description.title}</h4>
        <p>You're running the latest versions</p>
        <small>Last checked: ${new Date().toLocaleTimeString()}</small>
      </div>
    `;
  }
  
  // Add to beginning of news content, but preserve existing content
  const existingContent = newsCard.innerHTML;
  const lines = existingContent.split('\n');
  const welcomeIndex = lines.findIndex(line => line.includes('Welcome to FantasticLauncher'));
  
  if (welcomeIndex !== -1) {
    // Insert before welcome message
    lines.splice(welcomeIndex, 0, newsContent);
    newsCard.innerHTML = lines.join('\n');
  } else {
    newsCard.innerHTML = newsContent + existingContent;
  }
}

// Enhanced download function with smart update logic
async function enhancedDownloadGameFiles() {
  try {
    // Check for version updates first
    const updateInfo = await smartUpdateDetector.checkForVersionUpdates(window.launcher);
    const description = smartUpdateDetector.getUpdateDescription(updateInfo);
    
    // Update status message based on action type
    const actionText = updateInfo.updateAction === 'update' ? 'Updating' : 'Downloading';
    showStatus(`${actionText} game files...`, 'downloading');
    updateGameStatusIndicator('downloading');
    
    // Update button text during process
    downloadBtn.innerHTML = `<i class="icon">⏳</i> ${actionText}...`;
    downloadBtn.disabled = true;
    
    // Perform the download/update
    let result;
    if (updateInfo.hasUpdates && !updateInfo.isNewInstallation) {
      // Smart update - only download what changed
      result = await window.launcher.downloadMissingComponents(
        smartUpdateDetector.availableVersions.minecraft,
        smartUpdateDetector.availableVersions.fabric,
        ['minecraft', 'fabric'] // Update core components
      );
    } else {
      // Full download
      result = await window.launcher.downloadGameFiles(
        smartUpdateDetector.availableVersions.minecraft,
        smartUpdateDetector.availableVersions.fabric
      );
    }
    
    if (result.success) {
      // Update stored versions
      const versionUpdate = smartUpdateDetector.updateStoredVersions(
        smartUpdateDetector.availableVersions.minecraft,
        smartUpdateDetector.availableVersions.fabric
      );
      
      // Update game state versions
      gameState.minecraftVersion = smartUpdateDetector.availableVersions.minecraft;
      gameState.fabricVersion = smartUpdateDetector.availableVersions.fabric;
      
      // Show appropriate success message
      if (versionUpdate.wasUpdate) {
        showStatus(`${actionText} completed! Updated to latest versions.`, 'success');
        
        // Add update success to news
        const newsCard = document.querySelector('.news-card .card-content');
        if (newsCard) {
          const updateSuccessNews = `
            <div class="news-item" style="border-left-color: #10b981;">
              <h4>✅ Update Complete!</h4>
              <p>Successfully updated to Minecraft ${smartUpdateDetector.availableVersions.minecraft} with Fabric ${smartUpdateDetector.availableVersions.fabric}</p>
              <small>Just now</small>
            </div>
          `;
          newsCard.innerHTML = updateSuccessNews + newsCard.innerHTML;
        }
      } else {
        showStatus(`${actionText} completed successfully!`, 'success');
      }
      
      // Update UI state
      gameState.downloadComplete = true;
      gameState.gameReady = true;
      gameState.hasVersionUpdates = false;
      downloadBtn.innerHTML = '✅ Complete';
      downloadBtn.disabled = true;
      playBtn.disabled = !gameState.currentAccount;
      updateGameStatusIndicator('ready');
      
      // Update version displays
      minecraftVersionDisplay.textContent = gameState.minecraftVersion;
      fabricVersionDisplay.textContent = gameState.fabricVersion;
      
    } else {
      showStatus(`${actionText} failed: ${result.error}`, 'error');
      downloadBtn.innerHTML = `<i class="icon">${description.buttonIcon}</i> ${description.buttonText}`;
      downloadBtn.disabled = false;
      updateGameStatusIndicator('needs_repair');
    }
    
  } catch (error) {
    showStatus(`Operation failed: ${error.message}`, 'error');
    downloadBtn.disabled = false;
    updateGameStatusIndicator('needs_repair');
  }
}

// Initialize the launcher with auto-detection, crash detection, version checking, and delta updates
async function initLauncher() {
  try {
    showStatus('Starting launcher...', 'info');
    
    // Load saved data
    loadAccounts();
    loadSettings();
    
    // Initialize crash detection event listeners
    setupCrashDetectionListeners();
    
    // NEW: Initialize delta update system
    await initializeDeltaUpdates();
    
    // Initialize launcher backend
    if (window.launcher) {
      await window.launcher.initialize();
      
      // Get latest versions
      const minecraftVersion = await window.launcher.getLatestMinecraftVersion();
      gameState.minecraftVersion = minecraftVersion;
      minecraftVersionDisplay.textContent = minecraftVersion || 'Loading...';
      
      const fabricVersion = await window.launcher.getLatestFabricVersion(minecraftVersion);
      gameState.fabricVersion = fabricVersion;
      fabricVersionDisplay.textContent = fabricVersion || 'Loading...';
      
      // Get crash detection status
      await updateCrashDetectionStatus();
      
      // NEW: Check for version updates and update UI accordingly
      smartUpdateDetector.loadStoredVersions();
      const updateInfo = await smartUpdateDetector.checkForVersionUpdates(window.launcher);
      updateDownloadButtonBasedOnVersions(updateInfo, gameState);
      
      showStatus('Launcher initialized successfully', 'success');
    } else {
      // Demo mode
      minecraftVersionDisplay.textContent = '1.21.1';
      fabricVersionDisplay.textContent = '0.15.0';
      gameState.minecraftVersion = '1.21.1';
      gameState.fabricVersion = '0.15.0';
      showStatus('Demo mode active', 'info');
    }
    
    // Update UI based on current state
    updateUI();
    
  } catch (error) {
    showStatus(`Failed to initialize launcher: ${error.message}`, 'error');
    console.error('Launcher initialization error:', error);
    
    // Report error
    if (window.errorHandler) {
      window.errorHandler.reportError(error, 'launcher_initialization');
    }
  }
}

// NEW: Initialize delta update system
async function initializeDeltaUpdates() {
  try {
    // Set up delta update callbacks
    deltaUpdateManager.setCallbacks({
      onUpdateAvailable: (updateInfo) => {
        console.log('Delta update available in renderer:', updateInfo);
        gameState.deltaUpdateAvailable = true;
        gameState.deltaUpdateInfo = updateInfo;
        
        // Show update notification
        showStatus('Launcher update available!', 'info');
      },
      
      onDownloadProgress: (progressData) => {
        gameState.deltaUpdateProgress = progressData.progress || 0;
        
        // Update progress bar
        updateProgress(progressData.progress);
        showStatus(`Downloading launcher update: ${progressData.progress}%`, 'downloading');
      },
      
      onUpdateReady: (updateData) => {
        showStatus('Launcher update downloaded and ready to install!', 'success');
        
        // Show install notification in news
        const newsCard = document.querySelector('.news-card .card-content');
        if (newsCard) {
          const installNews = `
            <div class="news-item" style="border-left-color: #10b981;">
              <h4>📦 Update Ready!</h4>
              <p>Launcher update has been downloaded and is ready to install. Click the update button to install.</p>
              <small>Just now</small>
            </div>
          `;
          newsCard.innerHTML = installNews + newsCard.innerHTML;
        }
      },
      
      onError: (error) => {
        console.error('Delta update error in renderer:', error);
        gameState.deltaUpdateAvailable = false;
        gameState.deltaUpdateInfo = null;
        showStatus(`Update error: ${error.message}`, 'error');
      }
    });
    
    // Check for delta updates on startup
    setTimeout(async () => {
      try {
        await deltaUpdateManager.checkForUpdates();
      } catch (error) {
        console.error('Initial delta update check failed:', error);
      }
    }, 10000); // Check 10 seconds after startup
    
  } catch (error) {
    console.error('Failed to initialize delta updates:', error);
  }
}

// Set up crash detection event listeners
function setupCrashDetectionListeners() {
  // Listen for game crashes
  if (window.electronAPI) {
    window.electronAPI.on('game-crashed', (crashData) => {
      handleGameCrash(crashData);
    });
    
    window.electronAPI.on('repair-started', (repairInfo) => {
      handleRepairStarted(repairInfo);
    });
    
    window.electronAPI.on('repair-completed', (repairResult) => {
      handleRepairCompleted(repairResult);
    });
    
    window.electronAPI.on('game-exited', (exitInfo) => {
      handleGameExit(exitInfo);
    });
  }
}

// Handle game crash notification
function handleGameCrash(crashData) {
  console.log('Game crash detected in renderer:', crashData);
  
  gameState.lastCrashReport = crashData.crashReport;
  gameState.canRepair = crashData.canRepair;
  gameState.gameRunning = false;
  
  // Update UI
  updateGameStatusIndicator('crashed');
  
  // Show crash notification in news section
  showCrashNotification(crashData.crashReport);
  
  // Show repair button if repair is available
  if (crashData.canRepair) {
    showRepairButton();
  }
  
  // Update status
  showStatus(`Game crashed: ${crashData.crashReport.type}`, 'error');
}

// Handle repair started notification
function handleRepairStarted(repairInfo) {
  console.log('Repair started:', repairInfo);
  
  gameState.repairInProgress = true;
  
  // Update UI
  showStatus(`Auto-repair in progress (${repairInfo.attempt}/${repairInfo.maxAttempts})...`, 'downloading');
  updateProgress(10);
  
  // Disable buttons during repair
  downloadBtn.disabled = true;
  playBtn.disabled = true;
  
  // Show repair progress in news
  showRepairProgress(repairInfo);
}

// Handle repair completed notification
function handleRepairCompleted(repairResult) {
  console.log('Repair completed:', repairResult);
  
  gameState.repairInProgress = false;
  
  // Update UI based on repair result
  if (repairResult.success) {
    showStatus('Auto-repair completed successfully!', 'success');
    updateProgress(100);
    
    // Update game state
    gameState.gameReady = true;
    gameState.downloadComplete = true;
    
    // Re-enable buttons
    downloadBtn.disabled = true;
    downloadBtn.innerHTML = '✓ Repaired';
    playBtn.disabled = !gameState.currentAccount;
    
    // Update download status
    downloadStatusDisplay.textContent = 'Repaired & Ready';
    downloadStatusDisplay.className = 'stat-value status-ready';
    
    // Show success notification
    showRepairSuccess(repairResult);
    
  } else {
    showStatus(`Auto-repair failed: ${repairResult.error || 'Unknown error'}`, 'error');
    updateProgress(0);
    
    // Re-enable buttons
    downloadBtn.disabled = false;
    playBtn.disabled = true;
    
    // Show manual repair option
    showManualRepairOption(repairResult);
  }
  
  // Update game status
  updateGameStatusIndicator(repairResult.success ? 'ready' : 'needs_repair');
}

// Handle game exit notification
function handleGameExit(exitInfo) {
  console.log('Game exited:', exitInfo);
  
  gameState.gameRunning = false;
  
  if (exitInfo.isCrash) {
    updateGameStatusIndicator('crashed');
    showStatus(`Game crashed after ${exitInfo.playTime} seconds`, 'error');
  } else {
    updateGameStatusIndicator('ready');
    showStatus(`Game exited normally after ${exitInfo.playTime} seconds`, 'info');
  }
  
  // Re-enable play button
  playBtn.disabled = !gameState.currentAccount || !gameState.gameReady;
}

// Update crash detection status
async function updateCrashDetectionStatus() {
  try {
    if (window.electronAPI && window.electronAPI.invoke) {
      const crashStatus = await window.electronAPI.invoke('crash:get-auto-repair-status');
      gameState.crashDetectionEnabled = crashStatus.enabled;
      
      const canRepair = await window.electronAPI.invoke('crash:can-repair');
      gameState.canRepair = canRepair;
      
      const lastCrash = await window.electronAPI.invoke('crash:get-last-report');
      gameState.lastCrashReport = lastCrash;
    }
  } catch (error) {
    console.error('Failed to update crash detection status:', error);
  }
}

// Show crash notification in news section
function showCrashNotification(crashReport) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  const crashNews = `
    <div class="news-item" style="border-left-color: #ef4444;">
      <h4>🚨 Game Crashed</h4>
      <p>Minecraft crashed unexpectedly (${crashReport.type}). ${gameState.canRepair ? 'Auto-repair is available.' : 'Please check the game installation.'}</p>
      <small>${new Date(crashReport.timestamp).toLocaleTimeString()}</small>
    </div>
  `;
  
  newsCard.innerHTML = crashNews + newsCard.innerHTML;
}

// Show repair button
function showRepairButton() {
  // Add repair button next to download button if it doesn't exist
  let repairBtn = document.getElementById('repair-btn');
  
  if (!repairBtn) {
    repairBtn = document.createElement('button');
    repairBtn.id = 'repair-btn';
    repairBtn.className = 'btn btn-primary';
    repairBtn.innerHTML = '<i class="icon">🔧</i> Repair & Fix';
    repairBtn.style.marginLeft = '0.5rem';
    
    repairBtn.addEventListener('click', triggerManualRepair);
    
    // Add to launch buttons container
    const launchButtons = document.querySelector('.launch-buttons');
    if (launchButtons) {
      launchButtons.appendChild(repairBtn);
    }
  }
  
  repairBtn.style.display = 'inline-flex';
  repairBtn.disabled = gameState.repairInProgress;
}

// Hide repair button
function hideRepairButton() {
  const repairBtn = document.getElementById('repair-btn');
  if (repairBtn) {
    repairBtn.style.display = 'none';
  }
}

// Show repair progress in news
function showRepairProgress(repairInfo) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  const repairNews = `
    <div class="news-item" style="border-left-color: #f59e0b;">
      <h4>🔧 Auto-Repair in Progress</h4>
      <p>Attempting to fix game files automatically (${repairInfo.attempt}/${repairInfo.maxAttempts}). Please wait...</p>
      <small>Just now</small>
    </div>
  `;
  
  newsCard.innerHTML = repairNews + newsCard.innerHTML;
}

// Show repair success notification
function showRepairSuccess(repairResult) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  const successNews = `
    <div class="news-item" style="border-left-color: #10b981;">
      <h4>✅ Auto-Repair Complete</h4>
      <p>Game files have been repaired successfully! The game is now ready to launch.</p>
      <small>Just now</small>
    </div>
  `;
  
  newsCard.innerHTML = successNews + newsCard.innerHTML;
  hideRepairButton();
}

// Show manual repair option
function showManualRepairOption(repairResult) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  const manualRepairNews = `
    <div class="news-item" style="border-left-color: #ef4444;">
      <h4>⚠️ Auto-Repair Failed</h4>
      <p>Automatic repair could not fix all issues. Click "Repair & Fix" to try manual repair or check your network connection.</p>
      <small>Just now</small>
    </div>
  `;
  
  newsCard.innerHTML = manualRepairNews + newsCard.innerHTML;
  showRepairButton();
}

// Trigger manual repair
async function triggerManualRepair() {
  if (!gameState.minecraftVersion || !gameState.fabricVersion) {
    showStatus('Game versions not loaded yet', 'error');
    return;
  }
  
  if (gameState.repairInProgress) {
    showStatus('Repair already in progress', 'warning');
    return;
  }
  
  try {
    showStatus('Starting manual repair...', 'downloading');
    updateProgress(5);
    
    // Disable repair button
    const repairBtn = document.getElementById('repair-btn');
    if (repairBtn) {
      repairBtn.disabled = true;
      repairBtn.innerHTML = '<i class="icon">🔧</i> Repairing...';
    }
    
    if (window.electronAPI && window.electronAPI.invoke) {
      const result = await window.electronAPI.invoke('crash:trigger-repair', 
        gameState.minecraftVersion, gameState.fabricVersion);
      
      if (result.success) {
        showStatus('Manual repair completed successfully!', 'success');
        updateProgress(100);
        
        // Update game state
        gameState.gameReady = true;
        gameState.downloadComplete = true;
        gameState.repairInProgress = false;
        
        // Update UI
        downloadStatusDisplay.textContent = 'Repaired & Ready';
        downloadStatusDisplay.className = 'stat-value status-ready';
        downloadBtn.innerHTML = '✓ Repaired';
        downloadBtn.disabled = true;
        playBtn.disabled = !gameState.currentAccount;
        
        hideRepairButton();
        
        // Show success in news
        showRepairSuccess(result);
        
      } else {
        showStatus(`Manual repair failed: ${result.error}`, 'error');
        updateProgress(0);
        
        // Re-enable repair button
        if (repairBtn) {
          repairBtn.disabled = false;
          repairBtn.innerHTML = '<i class="icon">🔧</i> Repair & Fix';
        }
      }
    } else {
      // Demo mode
      await new Promise(resolve => setTimeout(resolve, 2000));
      showStatus('Manual repair completed! (Demo)', 'success');
      updateProgress(100);
      hideRepairButton();
    }
    
  } catch (error) {
    showStatus(`Manual repair failed: ${error.message}`, 'error');
    updateProgress(0);
    
    // Re-enable repair button
    const repairBtn = document.getElementById('repair-btn');
    if (repairBtn) {
      repairBtn.disabled = false;
      repairBtn.innerHTML = '<i class="icon">🔧</i> Repair & Fix';
    }
    
    console.error('Manual repair error:', error);
  }
}

// Update game status indicator
function updateGameStatusIndicator(status) {
  const statusIndicator = document.querySelector('.status-indicator');
  const gameStatus = document.querySelector('.game-status span');
  
  if (!statusIndicator || !gameStatus) return;
  
  // Remove existing status classes
  statusIndicator.classList.remove('ready', 'downloading', 'crashed', 'needs_repair');
  
  let newContent = '';

  switch (status) {
    case 'ready':
      statusIndicator.classList.add('ready');
      newContent = '';
      break;
    case 'downloading':
      statusIndicator.classList.add('downloading');
      newContent = '<em>Downloading...</em>';
      break;
    case 'crashed':
      statusIndicator.classList.add('crashed');
      newContent = '<span style="color: red;">Game Crashed</span>';
      break;
    case 'needs_repair':
      statusIndicator.classList.add('crashed');
      newContent = '<span style="color: orange;">Needs Repair</span>';
      break;
    default:
      newContent = '<span style="color: gray;">Unknown Status</span>';
  }

  gameStatus.innerHTML = newContent;
}

// Handle game detection results from splash screen (enhanced with crash detection)
function handleGameDetectionResults(detectionResult) {
  console.log('Received game detection results:', detectionResult);
  
  gameState.detectionResult = detectionResult;
  gameState.gameReady = !detectionResult.needsFullDownload && !detectionResult.needsPartialDownload;
  gameState.needsDownload = detectionResult.needsFullDownload || detectionResult.needsPartialDownload;
  gameState.missingComponents = detectionResult.missingComponents || [];
  gameState.downloadEstimate = detectionResult.downloadEstimate || { size: '0 MB', time: '0 seconds' };
  
  // Update download status based on detection
  if (gameState.gameReady) {
    gameState.downloadComplete = true;
    downloadStatusDisplay.textContent = 'Ready';
    downloadStatusDisplay.className = 'stat-value status-ready';
    playBtn.disabled = !gameState.currentAccount;
    downloadBtn.textContent = '✓ Verified';
    downloadBtn.disabled = true;
    showStatus('Game ready to launch!', 'success');
    updateGameStatusIndicator('ready');
  } else if (gameState.needsDownload) {
    gameState.downloadComplete = false;
    
    if (detectionResult.needsFullDownload) {
      downloadStatusDisplay.textContent = 'Full Download Needed';
      downloadStatusDisplay.className = 'stat-value status-error';
      downloadBtn.innerHTML = '<i class="icon">⬇️</i> Download Game (' + gameState.downloadEstimate.size + ')';
      showStatus(`Full installation required (${gameState.downloadEstimate.size})`, 'warning');
      updateGameStatusIndicator('needs_repair');
    } else {
      downloadStatusDisplay.textContent = 'Update Needed';
      downloadStatusDisplay.className = 'stat-value status-downloading';
      const missingText = gameState.missingComponents.slice(0, 2).join(', ');
      downloadBtn.innerHTML = '<i class="icon">⬇️</i> Update ' + missingText + ' (' + gameState.downloadEstimate.size + ')';
      showStatus(`Updates needed: ${missingText} (${gameState.downloadEstimate.size})`, 'warning');
      updateGameStatusIndicator('downloading');
    }
    
    playBtn.disabled = true;
    downloadBtn.disabled = false;
  }
  
  // Update news section with detection info
  updateNewsWithDetectionInfo(detectionResult);
  
  // Update UI
  updateUI();
}

// Update news section with detection information (keeping existing implementation)
function updateNewsWithDetectionInfo(detectionResult) {
  const newsCard = document.querySelector('.news-card .card-content');
  if (!newsCard) return;
  
  let newsContent = '';
  
  if (detectionResult.hasExistingInstallation) {
    if (detectionResult.needsFullDownload) {
      newsContent = `
        <div class="news-item">
          <h4>⚠️ Game Installation Incomplete</h4>
          <p>Your Minecraft installation is missing critical components. A full download (${detectionResult.downloadEstimate?.size}) is required.</p>
          <small>Auto-detected just now</small>
        </div>
      `;
    } else if (detectionResult.needsPartialDownload) {
      const missing = detectionResult.missingComponents.join(', ');
      newsContent = `
        <div class="news-item">
          <h4>🔄 Updates Available</h4>
          <p>Missing components detected: ${missing}. A quick update (${detectionResult.downloadEstimate?.size}) will get you ready to play.</p>
          <small>Auto-detected just now</small>
        </div>
      `;
    } else {
      newsContent = `
        <div class="news-item">
          <h4>✅ Game Ready!</h4>
          <p>Your Minecraft installation with Fabric has been verified and is ready to launch. All components are present and up to date.</p>
          <small>Verified just now</small>
        </div>
      `;
    }
  } else {
    newsContent = `
      <div class="news-item">
        <h4>🎮 New Installation</h4>
        <p>No existing Minecraft installation found. Click "Download Game" to install Minecraft ${gameState.minecraftVersion} with Fabric ${gameState.fabricVersion}.</p>
        <small>Detected just now</small>
      </div>
    `;
  }
  
  // Add crash detection info if available
  if (gameState.lastCrashReport) {
    newsContent = `
      <div class="news-item" style="border-left-color: #ef4444;">
        <h4>🚨 Previous Crash Detected</h4>
        <p>Last crash: ${gameState.lastCrashReport.type} - ${gameState.canRepair ? 'Repair available' : 'Check installation'}</p>
        <small>${new Date(gameState.lastCrashReport.timestamp).toLocaleTimeString()}</small>
      </div>
    ` + newsContent;
  }
  
  // Add welcome message
  newsContent += `
    <div class="news-item">
      <h4>Welcome to FantasticLauncher!</h4>
      <p>Your advanced Minecraft launcher with automatic crash detection, repair functionality, and delta updates.</p>
      <small>FantasticLauncher v1.0.0</small>
    </div>
  `;
  
  newsCard.innerHTML = newsContent;
}

// Enhanced game file download with smart detection
async function downloadGameFiles() {
  return await enhancedDownloadGameFiles();
}

// Enhanced game launch with crash detection support
async function launchGame() {
  if (!gameState.currentAccount) {
    showStatus('Please select an account first', 'error');
    switchPage('accounts');
    return;
  }
  
  if (!gameState.downloadComplete && !gameState.gameReady) {
    const action = gameState.needsDownload ? 'download/update' : 'download';
    if (confirm(`Game files need to be ${action}ed first. Would you like to do this now?`)) {
      await downloadGameFiles();
      if (!gameState.downloadComplete) return;
    } else {
      return;
    }
  }
  
  try {
    showStatus('Launching game with crash detection...', 'downloading');
    playBtn.disabled = true;
    updateGameStatusIndicator('downloading');
    
    const ram = {
      min: ramMinSelect.value,
      max: ramMaxSelect.value
    };
    
    if (window.launcher) {
      const result = await window.launcher.launchGame(
        gameState.currentAccount,
        gameState.minecraftVersion,
        gameState.fabricVersion,
        ram
      );
      
      if (result.success || result.pid) {
        gameState.gameRunning = true;
        showStatus(`Game launched successfully! PID: ${result.pid} (Crash detection active)`, 'success');
        updateGameStatusIndicator('ready');
        
        // Update news with launch info
        const newsCard = document.querySelector('.news-card .card-content');
        if (newsCard) {
          const launchNews = `
            <div class="news-item">
              <h4>🚀 Game Launched!</h4>
              <p>Minecraft with Fabric is now running for ${gameState.currentAccount}. Process ID: ${result.pid}. Crash detection is active.</p>
              <small>Just now</small>
            </div>
          `;
          newsCard.innerHTML = launchNews + newsCard.innerHTML;
        }
      } else {
        showStatus(`Game launch failed: ${result.error}`, 'error');
        updateGameStatusIndicator('needs_repair');
        
        // Show repair option if available
        if (gameState.canRepair) {
          showRepairButton();
        }
      }
    } else {
      // Demo mode
      await new Promise(resolve => setTimeout(resolve, 2000));
      gameState.gameRunning = true;
      showStatus('Game launched successfully! (Demo Mode - Crash detection simulated)', 'success');
      updateGameStatusIndicator('ready');
    }
    
  } catch (error) {
    showStatus(`Game launch failed: ${error.message}`, 'error');
    updateGameStatusIndicator('needs_repair');
    
    // Show repair option if available
    if (gameState.canRepair) {
      showRepairButton();
    }
  } finally {
    playBtn.disabled = false;
  }
}

// Navigation (keeping existing implementation)
function switchPage(pageName) {
  // Update menu items
  menuItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.page === pageName) {
      item.classList.add('active');
    }
  });
  
  // Update pages
  pages.forEach(page => {
    page.classList.remove('active');
    if (page.id === `page-${pageName}`) {
      page.classList.add('active');
    }
  });
  
  // Update header
  const data = pageData[pageName];
  if (data) {
    pageTitle.textContent = data.title;
    pageSubtitle.textContent = data.subtitle;
  }
}

// Account Management (keeping existing functions)
function loadAccounts() {
  try {
    const saved = localStorage.getItem('fantasticLauncher.accounts');
    if (saved) {
      gameState.accounts = JSON.parse(saved);
    }
    
    const currentAccount = localStorage.getItem('fantasticLauncher.currentAccount');
    if (currentAccount) {
      gameState.currentAccount = currentAccount;
    }
    
    updateAccountsUI();
  } catch (error) {
    console.error('Failed to load accounts:', error);
    gameState.accounts = [];
  }
}

function saveAccounts() {
  try {
    localStorage.setItem('fantasticLauncher.accounts', JSON.stringify(gameState.accounts));
    if (gameState.currentAccount) {
      localStorage.setItem('fantasticLauncher.currentAccount', gameState.currentAccount);
    }
  } catch (error) {
    console.error('Failed to save accounts:', error);
  }
}

function addAccount(username, type = 'offline') {
  if (!username || username.length < 3 || username.length > 16) {
    showStatus('Username must be between 3 and 16 characters', 'error');
    return false;
  }
  
  if (gameState.accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase())) {
    showStatus('Account already exists', 'error');
    return false;
  }
  
  const account = {
    id: Date.now().toString(),
    username: username,
    type: type,
    dateAdded: new Date().toISOString()
  };
  
  gameState.accounts.push(account);
  saveAccounts();
  updateAccountsUI();
  
  if (gameState.accounts.length === 1) {
    setCurrentAccount(account.username);
  }
  
  showStatus(`Account "${username}" added successfully`, 'success');
  return true;
}

function removeAccount(username) {
  gameState.accounts = gameState.accounts.filter(acc => acc.username !== username);
  
  if (gameState.currentAccount === username) {
    gameState.currentAccount = gameState.accounts.length > 0 ? gameState.accounts[0].username : null;
  }
  
  saveAccounts();
  updateAccountsUI();
  showStatus(`Account "${username}" removed`, 'info');
}

function setCurrentAccount(username) {
  gameState.currentAccount = username;
  saveAccounts();
  updateAccountsUI();
  
  // Update play button state based on game readiness
  if (gameState.gameReady && gameState.downloadComplete && !gameState.gameRunning) {
    playBtn.disabled = false;
  }
}

function updateAccountsUI() {
  // Update username select dropdown
  usernameSelect.innerHTML = '<option value="">Select or Add Account</option>';
  
  gameState.accounts.forEach(account => {
    const option = document.createElement('option');
    option.value = account.username;
    option.textContent = `${account.username} (${account.type})`;
    if (account.username === gameState.currentAccount) {
      option.selected = true;
    }
    usernameSelect.appendChild(option);
  });
  
  // Update current user display
  if (gameState.currentAccount) {
    currentUsernameDisplay.textContent = gameState.currentAccount;
  } else {
    currentUsernameDisplay.textContent = 'No User Selected';
  }
  
  // Update accounts list page
  if (gameState.accounts.length === 0) {
    accountsList.innerHTML = `
      <div class="account-item default">
        <div class="account-avatar">👤</div>
        <div class="account-info">
          <h4>No accounts added yet</h4>
          <p>Click "Add Account" to get started</p>
        </div>
      </div>
    `;
  } else {
    accountsList.innerHTML = '';
    gameState.accounts.forEach(account => {
      const accountElement = document.createElement('div');
      accountElement.className = 'account-item';
      accountElement.innerHTML = `
        <div class="account-avatar">👤</div>
        <div class="account-info">
          <h4>${account.username}</h4>
          <p>${account.type} account • Added ${new Date(account.dateAdded).toLocaleDateString()}</p>
        </div>
        <button class="btn btn-secondary remove-account" data-username="${account.username}">Remove</button>
      `;
      
      accountElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('remove-account')) {
          setCurrentAccount(account.username);
          switchPage('home');
        }
      });
      
      accountsList.appendChild(accountElement);
    });
    
    // Add remove account event listeners
    document.querySelectorAll('.remove-account').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const username = e.target.dataset.username;
        if (confirm(`Are you sure you want to remove account "${username}"?`)) {
          removeAccount(username);
        }
      });
    });
  }
}

// Settings Management (keeping existing implementation)
function loadSettings() {
  try {
    const ramMin = localStorage.getItem('fantasticLauncher.ramMin') || '2G';
    const ramMax = localStorage.getItem('fantasticLauncher.ramMax') || '4G';
    
    ramMinSelect.value = ramMin;
    ramMaxSelect.value = ramMax;
    
    updateRamDisplay();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function saveSettings() {
  try {
    localStorage.setItem('fantasticLauncher.ramMin', ramMinSelect.value);
    localStorage.setItem('fantasticLauncher.ramMax', ramMaxSelect.value);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function updateRamDisplay() {
  const min = ramMinSelect.value;
  const max = ramMaxSelect.value;
  ramDisplay.textContent = `${min} - ${max}`;
}

// UI Helper Functions (keeping existing implementation)
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  
  // Remove existing status classes
  statusMessage.classList.remove('status-ready', 'status-downloading', 'status-error');
  
  // Add appropriate status class
  switch (type) {
    case 'success':
    case 'ready':
      statusMessage.classList.add('status-ready');
      break;
    case 'downloading':
    case 'warning':
      statusMessage.classList.add('status-downloading');
      break;
    case 'error':
      statusMessage.classList.add('status-error');
      break;
  }
  
  console.log(`[${type.toUpperCase()}] ${message}`);
}

function hideStatus() {
  statusMessage.textContent = 'Ready';
  statusMessage.classList.remove('status-downloading', 'status-error');
  statusMessage.classList.add('status-ready');
}

function updateProgress(percent) {
  progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function updateUI() {
  // Update download status based on detection results and crash state
  if (gameState.gameReady && gameState.downloadComplete && !gameState.repairInProgress) {
    downloadStatusDisplay.textContent = 'Ready';
    downloadStatusDisplay.className = 'stat-value status-ready';
    playBtn.disabled = !gameState.currentAccount || gameState.gameRunning;
    downloadBtn.innerHTML = '✓ Verified';
    downloadBtn.disabled = true;
    updateGameStatusIndicator('ready');
  } else if (gameState.needsDownload || gameState.repairInProgress) {
    if (gameState.repairInProgress) {
      downloadStatusDisplay.textContent = 'Repairing...';
      downloadStatusDisplay.className = 'stat-value status-downloading';
      updateGameStatusIndicator('downloading');
    } else if (gameState.detectionResult?.needsFullDownload) {
      downloadStatusDisplay.textContent = 'Full Download Needed';
      downloadStatusDisplay.className = 'stat-value status-error';
      updateGameStatusIndicator('needs_repair');
    } else {
      downloadStatusDisplay.textContent = 'Update Needed';
      downloadStatusDisplay.className = 'stat-value status-downloading';
      updateGameStatusIndicator('downloading');
    }
    playBtn.disabled = true;
    downloadBtn.disabled = gameState.repairInProgress;
  } else {
    downloadStatusDisplay.textContent = 'Not Downloaded';
    downloadStatusDisplay.className = 'stat-value';
    playBtn.disabled = true;
    updateGameStatusIndicator('needs_repair');
  }
  
  // Show repair button if there was a crash and repair is available
  if (gameState.lastCrashReport && gameState.canRepair && !gameState.repairInProgress) {
    showRepairButton();
  } else {
    hideRepairButton();
  }
  
  // Update other UI elements
  updateAccountsUI();
  updateRamDisplay();
}

// NEW: Delta Update Functions
async function checkForDeltaUpdates() {
  try {
    const result = await deltaUpdateManager.checkForUpdates();
    return result;
  } catch (error) {
    console.error('Failed to check for delta updates:', error);
    showStatus(`Update check failed: ${error.message}`, 'error');
  }
}

async function downloadDeltaUpdate() {
  try {
    showStatus('Downloading launcher update...', 'downloading');
    const result = await deltaUpdateManager.downloadUpdate();
    showStatus('Launcher update downloaded successfully!', 'success');
    return result;
  } catch (error) {
    console.error('Failed to download delta update:', error);
    showStatus(`Update download failed: ${error.message}`, 'error');
  }
}

async function installDeltaUpdate() {
  try {
    showStatus('Installing launcher update...', 'downloading');
    const result = await deltaUpdateManager.installUpdate();
    showStatus('Launcher update installed successfully!', 'success');
    return result;
  } catch (error) {
    console.error('Failed to install delta update:', error);
    showStatus(`Update installation failed: ${error.message}`, 'error');
  }
}

function hideUpdateDialog() {
  if (updateDialog) {
    updateDialog.classList.add('hidden');
  }
}

async function restartApplication() {
  try {
    if (window.deltaUpdater) {
      await window.deltaUpdater.restartApplication();
    }
  } catch (error) {
    console.error('Failed to restart application:', error);
    showStatus('Failed to restart application', 'error');
  }
}

// Event Listeners (enhanced with crash detection and delta updates)
document.addEventListener('DOMContentLoaded', () => {
  // Navigation
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      if (page) {
        switchPage(page);
      }
    });
  });
  
  // Account selection
  usernameSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      setCurrentAccount(e.target.value);
    }
  });
  
  // Add account button (quick add)
  addAccountBtn.addEventListener('click', () => {
    const username = prompt('Enter username (3-16 characters):');
    if (username) {
      addAccount(username.trim());
    }
  });
  
  // Account management (accounts page)
  addNewAccountBtn.addEventListener('click', () => {
    addAccountForm.style.display = 'block';
    newUsernameInput.focus();
  });
  
  saveAccountBtn.addEventListener('click', () => {
    const username = newUsernameInput.value.trim();
    const type = accountTypeSelect.value;
    
    if (addAccount(username, type)) {
      newUsernameInput.value = '';
      addAccountForm.style.display = 'none';
    }
  });
  
  cancelAccountBtn.addEventListener('click', () => {
    newUsernameInput.value = '';
    addAccountForm.style.display = 'none';
  });
  
  // RAM settings
  ramMinSelect.addEventListener('change', () => {
    const minValue = parseInt(ramMinSelect.value);
    const maxValue = parseInt(ramMaxSelect.value);
    
    if (minValue > maxValue) {
      ramMaxSelect.value = ramMinSelect.value;
    }
    
    updateRamDisplay();
    saveSettings();
  });
  
  ramMaxSelect.addEventListener('change', () => {
    const minValue = parseInt(ramMinSelect.value);
    const maxValue = parseInt(ramMaxSelect.value);
    
    if (maxValue < minValue) {
      ramMinSelect.value = ramMaxSelect.value;
    }
    
    updateRamDisplay();
    saveSettings();
  });
  
  // Game buttons
  downloadBtn.addEventListener('click', downloadGameFiles);
  playBtn.addEventListener('click', launchGame);
  
  // NEW: Delta update button
  if (updateButton) {
    updateButton.addEventListener('click', async () => {
      const updateState = deltaUpdateManager.getState();
      
      if (updateState.available && !updateState.downloading && !updateState.installing) {
        // Start download
        await downloadDeltaUpdate();
      } else if (updateState.downloadProgress === 100 && !updateState.installing) {
        // Install update
        await installDeltaUpdate();
      } else {
        // Show update dialog with details
        if (updateDialog) {
          const updateInfo = updateState.updateInfo;
          const benefits = window.deltaUtils?.calculateUpdateBenefits(updateInfo);
          
          updateDialog.classList.remove('hidden');
          updateDialog.innerHTML = `
            <div class="modal-content">
              <h2>🚀 Update Available!</h2>
              <p><strong>Version:</strong> ${updateInfo?.version || 'Unknown'}</p>
              ${benefits ? `
                <p><strong>Download Size:</strong> ${window.utils.formatFileSize(benefits.deltaSize)}</p>
                <p><strong>Bandwidth Savings:</strong> ${benefits.savingsPercentage.toFixed(1)}%</p>
              ` : ''}
              <div class="release-notes">
                ${updateInfo?.releaseNotes || 'No release notes available.'}
              </div>
              <div class="update-buttons">
                <button class="btn btn-primary" onclick="downloadDeltaUpdate(); hideUpdateDialog();">Download Update</button>
                <button class="btn btn-secondary" onclick="hideUpdateDialog()">Skip</button>
              </div>
            </div>
          `;
        }
      }
    });
  }
  
  // Current user click to switch accounts
  document.querySelector('.current-user').addEventListener('click', () => {
    switchPage('accounts');
  });
  
  // Initialize launcher
  initLauncher();
});

// Listen for game detection results from splash screen
if (window.electronAPI) {
  window.electronAPI.onGameDetectionComplete((detectionResult) => {
    handleGameDetectionResults(detectionResult);
  });
}

// IPC listener for game detection results (alternative method)
if (window.ipcRenderer) {
  window.ipcRenderer.on('game-detection-complete', (event, detectionResult) => {
    handleGameDetectionResults(detectionResult);
  });
}

// Enhanced error handling with crash detection context
window.addEventListener('error', (event) => {
  console.error('Renderer error:', event.error);
  
  if (window.errorHandler) {
    window.errorHandler.reportError(event.error, 'renderer_error');
  }
  
  // Check if this error might be related to game crash
  if (gameState.gameRunning && event.error.message.includes('game')) {
    showStatus('Potential game-related error detected', 'warning');
  }
});

// Export functions for global access
window.switchPage = switchPage;
window.hideUpdateDialog = hideUpdateDialog;
window.downloadDeltaUpdate = downloadDeltaUpdate; // NEW: Delta update function
window.installDeltaUpdate = installDeltaUpdate; // NEW: Delta update function
window.restartApplication = restartApplication; // NEW: Restart function
window.handleGameDetectionResults = handleGameDetectionResults;
window.triggerManualRepair = triggerManualRepair;
window.updateGameStatusIndicator = updateGameStatusIndicator;
window.updateDownloadButtonBasedOnVersions = updateDownloadButtonBasedOnVersions;
window.enhancedDownloadGameFiles = enhancedDownloadGameFiles;
window.checkForDeltaUpdates = checkForDeltaUpdates; // NEW: Delta update check function