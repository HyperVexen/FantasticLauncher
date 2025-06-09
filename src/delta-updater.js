// delta-updater.js - Complete GitHub-based Delta Update System
// Handles checking, downloading, and applying delta updates from GitHub releases

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');
const { app } = require('electron');
const AdmZip = require('adm-zip');

class DeltaUpdater {
  constructor(options = {}) {
    // Configuration
    this.config = {
      // GitHub repository details
      githubOwner: options.githubOwner || 'HyperVexen',
      githubRepo: options.githubRepo || 'FantasticLauncher',
      githubToken: options.githubToken || null, // Optional for private repos
      
      // Current app information
      currentVersion: options.currentVersion || app.getVersion(),
      appName: options.appName || 'FantasticLauncher',
      
      // Update settings
      checkInterval: options.checkInterval || 3600000, // 1 hour
      autoDownload: options.autoDownload || false,
      autoInstall: options.autoInstall || false,
      allowPrerelease: options.allowPrerelease || false,
      
      // Paths
      appPath: options.appPath || process.execPath,
      updatePath: options.updatePath || path.join(app.getPath('userData'), 'updates'),
      backupPath: options.backupPath || path.join(app.getPath('userData'), 'backups'),
      tempPath: options.tempPath || path.join(app.getPath('userData'), 'temp'),
      
      // Advanced options
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 30000,
      verifySignatures: options.verifySignatures || false,
      enableRollback: options.enableRollback || true
    };
    
    // State management
    this.state = {
      checking: false,
      downloading: false,
      installing: false,
      updateAvailable: false,
      downloadProgress: 0,
      currentUpdate: null,
      lastCheck: null,
      error: null,
      rollbackAvailable: false
    };
    
    // Event callbacks
    this.callbacks = {
      onUpdateAvailable: null,
      onUpdateDownloaded: null,
      onUpdateProgress: null,
      onUpdateInstalled: null,
      onError: null,
      onStateChange: null
    };
    
    // Internal properties
    this.checkTimer = null;
    this.downloadController = null;
    this.manifestCache = new Map();
    
    // Initialize
    this.initialize();
  }
  
  /**
   * Initialize the delta updater
   */
  async initialize() {
    try {
      // Create necessary directories
      await this.ensureDirectories();
      
      // Check for existing updates
      await this.checkForExistingUpdate();
      
      // Check for rollback capability
      await this.checkRollbackCapability();
      
      // Start automatic checking if enabled
      if (this.config.checkInterval > 0) {
        this.startAutomaticChecking();
      }
      
      this.log('Delta updater initialized successfully');
      this.updateState({ initialized: true });
      
    } catch (error) {
      this.log(`Failed to initialize delta updater: ${error.message}`, true);
      this.updateState({ error: error.message });
    }
  }
  
  /**
   * Check for updates from GitHub releases
   */
  async checkForUpdates(force = false) {
    if (this.state.checking && !force) {
      this.log('Update check already in progress');
      return this.state.currentUpdate;
    }
    
    this.updateState({ checking: true, error: null });
    
    try {
      this.log('Checking for updates from GitHub...');
      
      // Get latest release from GitHub
      const latestRelease = await this.fetchLatestRelease();
      
      if (!latestRelease) {
        this.log('No releases found');
        this.updateState({ checking: false, lastCheck: new Date() });
        return null;
      }
      
      // Compare versions
      const isNewer = this.compareVersions(latestRelease.tag_name, this.config.currentVersion);
      
      if (isNewer > 0) {
        this.log(`Update available: ${this.config.currentVersion} → ${latestRelease.tag_name}`);
        
        // Parse update manifest
        const updateInfo = await this.parseUpdateManifest(latestRelease);
        
        this.updateState({
          checking: false,
          updateAvailable: true,
          currentUpdate: updateInfo,
          lastCheck: new Date()
        });
        
        // Trigger callback
        if (this.callbacks.onUpdateAvailable) {
          this.callbacks.onUpdateAvailable(updateInfo);
        }
        
        // Auto-download if enabled
        if (this.config.autoDownload) {
          await this.downloadUpdate(updateInfo);
        }
        
        return updateInfo;
        
      } else {
        this.log('No updates available');
        this.updateState({ 
          checking: false, 
          updateAvailable: false, 
          lastCheck: new Date() 
        });
        return null;
      }
      
    } catch (error) {
      this.log(`Update check failed: ${error.message}`, true);
      this.updateState({ 
        checking: false, 
        error: error.message, 
        lastCheck: new Date() 
      });
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
    }
  }
  
  /**
   * Download update files
   */
  async downloadUpdate(updateInfo = null) {
    const update = updateInfo || this.state.currentUpdate;
    
    if (!update) {
      throw new Error('No update available to download');
    }
    
    if (this.state.downloading) {
      this.log('Download already in progress');
      return;
    }
    
    this.updateState({ downloading: true, downloadProgress: 0, error: null });
    
    try {
      this.log(`Starting download for version ${update.version}`);
      
      // Create download controller for cancellation
      this.downloadController = new AbortController();
      
      // Clear previous update files
      await this.clearUpdateDirectory();
      
      // Download delta files
      const downloadedFiles = [];
      let totalFiles = update.deltaFiles.length + (update.newFiles ? 1 : 0);
      let completedFiles = 0;
      
      // Download delta patches
      for (const deltaFile of update.deltaFiles) {
        const localPath = path.join(this.config.updatePath, deltaFile.name);
        await this.downloadFile(deltaFile.downloadUrl, localPath, deltaFile.size, deltaFile.hash);
        downloadedFiles.push({ type: 'delta', path: localPath, info: deltaFile });
        
        completedFiles++;
        const progress = Math.floor((completedFiles / totalFiles) * 100);
        this.updateState({ downloadProgress: progress });
        
        if (this.callbacks.onUpdateProgress) {
          this.callbacks.onUpdateProgress({
            type: 'download',
            progress: progress,
            file: deltaFile.name,
            completed: completedFiles,
            total: totalFiles
          });
        }
      }
      
      // Download new files archive if exists
      if (update.newFiles) {
        const localPath = path.join(this.config.updatePath, 'new-files.zip');
        await this.downloadFile(update.newFiles.downloadUrl, localPath, update.newFiles.size, update.newFiles.hash);
        downloadedFiles.push({ type: 'new', path: localPath, info: update.newFiles });
        
        completedFiles++;
        this.updateState({ downloadProgress: 100 });
      }
      
      // Verify all downloads
      this.log('Verifying downloaded files...');
      await this.verifyDownloadedFiles(downloadedFiles);
      
      // Save update metadata
      const updateMetadata = {
        version: update.version,
        downloadedAt: new Date().toISOString(),
        files: downloadedFiles,
        manifest: update
      };
      
      await this.saveUpdateMetadata(updateMetadata);
      
      this.log(`Download completed successfully for version ${update.version}`);
      this.updateState({ 
        downloading: false, 
        downloadProgress: 100,
        updateDownloaded: true 
      });
      
      // Trigger callback
      if (this.callbacks.onUpdateDownloaded) {
        this.callbacks.onUpdateDownloaded(update);
      }
      
      // Auto-install if enabled
      if (this.config.autoInstall) {
        await this.installUpdate(update);
      }
      
      return downloadedFiles;
      
    } catch (error) {
      this.log(`Download failed: ${error.message}`, true);
      this.updateState({ 
        downloading: false, 
        downloadProgress: 0, 
        error: error.message 
      });
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
    } finally {
      this.downloadController = null;
    }
  }
  
  /**
   * Install downloaded update
   */
  async installUpdate(updateInfo = null) {
    const update = updateInfo || this.state.currentUpdate;
    
    if (!update) {
      throw new Error('No update available to install');
    }
    
    if (this.state.installing) {
      this.log('Installation already in progress');
      return;
    }
    
    // Check if update is downloaded
    const updateMetadata = await this.loadUpdateMetadata();
    if (!updateMetadata || updateMetadata.version !== update.version) {
      throw new Error('Update must be downloaded before installation');
    }
    
    this.updateState({ installing: true, error: null });
    
    try {
      this.log(`Starting installation for version ${update.version}`);
      
      // Create backup of current installation
      if (this.config.enableRollback) {
        await this.createBackup();
      }
      
      // Apply delta patches
      let processedFiles = 0;
      const totalFiles = updateMetadata.files.length;
      
      for (const file of updateMetadata.files) {
        if (file.type === 'delta') {
          await this.applyDeltaPatch(file);
        } else if (file.type === 'new') {
          await this.extractNewFiles(file);
        }
        
        processedFiles++;
        const progress = Math.floor((processedFiles / totalFiles) * 100);
        
        if (this.callbacks.onUpdateProgress) {
          this.callbacks.onUpdateProgress({
            type: 'install',
            progress: progress,
            file: path.basename(file.path),
            completed: processedFiles,
            total: totalFiles
          });
        }
      }
      
      // Verify installation
      await this.verifyInstallation(update);
      
      // Update version info
      await this.updateVersionInfo(update.version);
      
      // Clean up update files
      await this.cleanupUpdateFiles();
      
      this.log(`Installation completed successfully for version ${update.version}`);
      this.updateState({ 
        installing: false,
        updateAvailable: false,
        updateDownloaded: false,
        currentUpdate: null
      });
      
      // Trigger callback
      if (this.callbacks.onUpdateInstalled) {
        this.callbacks.onUpdateInstalled(update);
      }
      
      return true;
      
    } catch (error) {
      this.log(`Installation failed: ${error.message}`, true);
      
      // Attempt rollback if enabled
      if (this.config.enableRollback) {
        try {
          await this.rollback();
          this.log('Rollback completed successfully');
        } catch (rollbackError) {
          this.log(`Rollback also failed: ${rollbackError.message}`, true);
        }
      }
      
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
  
  /**
   * Rollback to previous version
   */
  async rollback() {
    if (!this.config.enableRollback) {
      throw new Error('Rollback is disabled');
    }
    
    const backupInfo = await this.getLatestBackup();
    if (!backupInfo) {
      throw new Error('No backup available for rollback');
    }
    
    this.log(`Starting rollback to version ${backupInfo.version}`);
    
    try {
      // Extract backup files
      const backupPath = path.join(this.config.backupPath, backupInfo.filename);
      const zip = new AdmZip(backupPath);
      
      // Get app directory
      const appDir = path.dirname(this.config.appPath);
      
      // Extract backup over current installation
      zip.extractAllTo(appDir, true);
      
      // Update version info
      await this.updateVersionInfo(backupInfo.version);
      
      this.log(`Rollback completed successfully to version ${backupInfo.version}`);
      this.updateState({ rollbackAvailable: true });
      
      return true;
      
    } catch (error) {
      this.log(`Rollback failed: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Fetch latest release from GitHub
   */
  async fetchLatestRelease() {
    const url = `https://api.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases/latest`;
    const headers = {
      'User-Agent': `${this.config.appName}/${this.config.currentVersion}`,
      'Accept': 'application/vnd.github.v3+json'
    };
    
    if (this.config.githubToken) {
      headers['Authorization'] = `token ${this.config.githubToken}`;
    }
    
    try {
      const response = await this.httpRequest(url, { headers });
      const release = JSON.parse(response);
      
      // Filter prerelease if not allowed
      if (release.prerelease && !this.config.allowPrerelease) {
        this.log('Skipping prerelease version');
        return null;
      }
      
      return release;
      
    } catch (error) {
      if (error.message.includes('404')) {
        this.log('No releases found in repository');
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Parse update manifest from GitHub release
   */
  async parseUpdateManifest(release) {
    // Find update manifest in release assets
    const manifestAsset = release.assets.find(asset => 
      asset.name === 'update-manifest.json' || asset.name === 'manifest.json'
    );
    
    if (!manifestAsset) {
      // Create basic manifest from release info
      return this.createBasicManifest(release);
    }
    
    try {
      // Download and parse manifest
      const manifestData = await this.httpRequest(manifestAsset.browser_download_url);
      const manifest = JSON.parse(manifestData);
      
      // Enhance manifest with release info
      manifest.version = release.tag_name;
      manifest.releaseDate = release.published_at;
      manifest.releaseNotes = release.body;
      manifest.releaseUrl = release.html_url;
      
      // Process asset URLs
      for (const deltaFile of manifest.deltaFiles || []) {
        const asset = release.assets.find(a => a.name === deltaFile.name);
        if (asset) {
          deltaFile.downloadUrl = asset.browser_download_url;
          deltaFile.size = asset.size;
        }
      }
      
      if (manifest.newFiles) {
        const newFilesAsset = release.assets.find(a => a.name === manifest.newFiles.name);
        if (newFilesAsset) {
          manifest.newFiles.downloadUrl = newFilesAsset.browser_download_url;
          manifest.newFiles.size = newFilesAsset.size;
        }
      }
      
      return manifest;
      
    } catch (error) {
      this.log(`Failed to parse manifest: ${error.message}`, true);
      return this.createBasicManifest(release);
    }
  }
  
  /**
   * Create basic manifest when detailed manifest is not available
   */
  createBasicManifest(release) {
    // Look for delta files in assets
    const deltaFiles = release.assets
      .filter(asset => asset.name.endsWith('.patch') || asset.name.endsWith('.delta'))
      .map(asset => ({
        name: asset.name,
        downloadUrl: asset.browser_download_url,
        size: asset.size,
        targetFile: asset.name.replace(/\.(patch|delta)$/, ''),
        hash: null // Will be calculated during download
      }));
    
    // Look for new files archive
    const newFilesAsset = release.assets.find(asset => 
      asset.name === 'new-files.zip' || asset.name === 'additions.zip'
    );
    
    return {
      version: release.tag_name,
      releaseDate: release.published_at,
      releaseNotes: release.body,
      releaseUrl: release.html_url,
      deltaFiles: deltaFiles,
      newFiles: newFilesAsset ? {
        name: newFilesAsset.name,
        downloadUrl: newFilesAsset.browser_download_url,
        size: newFilesAsset.size,
        hash: null
      } : null,
      requiresFullRestart: true,
      minimumVersion: null
    };
  }
  
  /**
   * Apply delta patch to a file
   */
  async applyDeltaPatch(patchFile) {
    const patchPath = patchFile.path;
    const targetFile = patchFile.info.targetFile;
    const appDir = path.dirname(this.config.appPath);
    const targetPath = path.join(appDir, targetFile);
    
    this.log(`Applying patch ${path.basename(patchPath)} to ${targetFile}`);
    
    try {
      // Check if target file exists
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Target file not found: ${targetPath}`);
      }
      
      // For now, we'll implement a simple binary patch system
      // In production, you'd want to use a more sophisticated system like bsdiff
      const patchData = fs.readFileSync(patchPath);
      const originalData = fs.readFileSync(targetPath);
      
      // Apply patch (this is a simplified implementation)
      const patchedData = await this.applyBinaryPatch(originalData, patchData);
      
      // Create backup of original
      const backupPath = targetPath + '.backup';
      fs.copyFileSync(targetPath, backupPath);
      
      // Write patched file
      fs.writeFileSync(targetPath, patchedData);
      
      // Verify patch was applied correctly
      if (patchFile.info.expectedHash) {
        const actualHash = this.calculateFileHash(targetPath);
        if (actualHash !== patchFile.info.expectedHash) {
          // Restore backup
          fs.copyFileSync(backupPath, targetPath);
          throw new Error(`Patch verification failed for ${targetFile}`);
        }
      }
      
      // Remove backup
      fs.unlinkSync(backupPath);
      
      this.log(`Successfully patched ${targetFile}`);
      
    } catch (error) {
      this.log(`Failed to apply patch to ${targetFile}: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Simple binary patch implementation
   * Note: In production, use a library like bsdiff for better compression
   */
  async applyBinaryPatch(originalData, patchData) {
    // This is a simplified patch format for demonstration
    // Format: [operation][length][data]
    // Operations: 0=copy from original, 1=insert new data, 2=skip bytes
    
    const result = [];
    let originalPos = 0;
    let patchPos = 0;
    
    while (patchPos < patchData.length) {
      const operation = patchData[patchPos++];
      const length = patchData.readUInt32LE(patchPos);
      patchPos += 4;
      
      switch (operation) {
        case 0: // Copy from original
          if (originalPos + length > originalData.length) {
            throw new Error('Invalid patch: copy extends beyond original data');
          }
          result.push(originalData.slice(originalPos, originalPos + length));
          originalPos += length;
          break;
          
        case 1: // Insert new data
          if (patchPos + length > patchData.length) {
            throw new Error('Invalid patch: insert extends beyond patch data');
          }
          result.push(patchData.slice(patchPos, patchPos + length));
          patchPos += length;
          break;
          
        case 2: // Skip bytes in original
          originalPos += length;
          break;
          
        default:
          throw new Error(`Unknown patch operation: ${operation}`);
      }
    }
    
    return Buffer.concat(result);
  }
  
  /**
   * Extract new files from archive
   */
  async extractNewFiles(newFilesArchive) {
    const archivePath = newFilesArchive.path;
    const appDir = path.dirname(this.config.appPath);
    
    this.log(`Extracting new files from ${path.basename(archivePath)}`);
    
    try {
      const zip = new AdmZip(archivePath);
      const entries = zip.getEntries();
      
      for (const entry of entries) {
        if (!entry.isDirectory) {
          const targetPath = path.join(appDir, entry.entryName);
          const targetDir = path.dirname(targetPath);
          
          // Ensure target directory exists
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          
          // Extract file
          zip.extractEntryTo(entry, targetDir, false, true);
          this.log(`Extracted: ${entry.entryName}`);
        }
      }
      
      this.log('Successfully extracted new files');
      
    } catch (error) {
      this.log(`Failed to extract new files: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Create backup of current installation
   */
  async createBackup() {
    const backupFilename = `backup-${this.config.currentVersion}-${Date.now()}.zip`;
    const backupPath = path.join(this.config.backupPath, backupFilename);
    const appDir = path.dirname(this.config.appPath);
    
    this.log(`Creating backup: ${backupFilename}`);
    
    try {
      const zip = new AdmZip();
      
      // Add all application files to backup
      this.addDirectoryToZip(zip, appDir, '');
      
      // Write backup file
      zip.writeZip(backupPath);
      
      // Save backup metadata
      const backupInfo = {
        filename: backupFilename,
        version: this.config.currentVersion,
        createdAt: new Date().toISOString(),
        size: fs.statSync(backupPath).size
      };
      
      await this.saveBackupInfo(backupInfo);
      
      // Clean old backups (keep last 3)
      await this.cleanupOldBackups();
      
      this.log(`Backup created successfully: ${backupFilename}`);
      
    } catch (error) {
      this.log(`Failed to create backup: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Add directory contents to ZIP archive recursively
   */
  addDirectoryToZip(zip, dirPath, zipPath) {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const itemZipPath = path.join(zipPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        // Skip certain directories
        if (this.shouldSkipDirectory(item)) {
          continue;
        }
        this.addDirectoryToZip(zip, itemPath, itemZipPath);
      } else {
        // Skip certain files
        if (this.shouldSkipFile(item)) {
          continue;
        }
        zip.addLocalFile(itemPath, zipPath);
      }
    }
  }
  
  /**
   * Check if directory should be skipped in backup
   */
  shouldSkipDirectory(dirName) {
    const skipDirs = ['node_modules', '.git', 'updates', 'backups', 'temp', 'logs'];
    return skipDirs.includes(dirName);
  }
  
  /**
   * Check if file should be skipped in backup
   */
  shouldSkipFile(fileName) {
    const skipFiles = ['.log', '.tmp', '.cache'];
    return skipFiles.some(ext => fileName.endsWith(ext));
  }
  
  /**
   * Download file with progress tracking
   */
  async downloadFile(url, targetPath, expectedSize = null, expectedHash = null) {
    return new Promise((resolve, reject) => {
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      const tempPath = targetPath + '.tmp';
      const file = fs.createWriteStream(tempPath);
      
      const request = https.get(url, { 
        signal: this.downloadController?.signal,
        timeout: this.config.timeout 
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10) || expectedSize;
        let downloadedSize = 0;
        
        response.pipe(file);
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          
          if (this.callbacks.onUpdateProgress && totalSize) {
            const progress = Math.floor((downloadedSize / totalSize) * 100);
            this.callbacks.onUpdateProgress({
              type: 'file_download',
              file: path.basename(targetPath),
              progress: progress,
              downloaded: downloadedSize,
              total: totalSize
            });
          }
        });
        
        file.on('finish', async () => {
          file.close();
          
          try {
            // Verify download
            if (expectedSize && fs.statSync(tempPath).size !== expectedSize) {
              throw new Error('Downloaded file size mismatch');
            }
            
            if (expectedHash) {
              const actualHash = this.calculateFileHash(tempPath);
              if (actualHash !== expectedHash) {
                throw new Error('Downloaded file hash mismatch');
              }
            }
            
            // Move to final location
            fs.renameSync(tempPath, targetPath);
            resolve(targetPath);
            
          } catch (error) {
            // Clean up
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
            reject(error);
          }
        });
      });
      
      request.on('error', (error) => {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });
      
      file.on('error', (error) => {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });
    });
  }
  
  /**
   * HTTP request helper
   */
  async httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        timeout: this.config.timeout,
        ...options
      }, (response) => {
        if (response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      
      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
  
  /**
   * Compare version strings
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.replace(/^v/, '').split('.').map(Number);
    const v2Parts = version2.replace(/^v/, '').split('.').map(Number);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return 1;
      if (v1Part < v2Part) return -1;
    }
    
    return 0;
  }
  
  /**
   * Calculate file hash
   */
  calculateFileHash(filePath, algorithm = 'sha256') {
    const hash = crypto.createHash(algorithm);
    const data = fs.readFileSync(filePath);
    hash.update(data);
    return hash.digest('hex');
  }
  
  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    const dirs = [
      this.config.updatePath,
      this.config.backupPath,
      this.config.tempPath
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
  
  /**
   * Update internal state and trigger callbacks
   */
  updateState(changes) {
    Object.assign(this.state, changes);
    
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(this.state);
    }
  }
  
  /**
   * Logging function
   */
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[DeltaUpdater] [${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }
  
  /**
   * Start automatic update checking
   */
  startAutomaticChecking() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    
    this.checkTimer = setInterval(async () => {
      try {
        await this.checkForUpdates();
      } catch (error) {
        this.log(`Automatic update check failed: ${error.message}`, true);
      }
    }, this.config.checkInterval);
    
    this.log(`Automatic update checking started (interval: ${this.config.checkInterval}ms)`);
  }
  
  /**
   * Stop automatic update checking
   */
  stopAutomaticChecking() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      this.log('Automatic update checking stopped');
    }
  }
  
  /**
   * Cancel ongoing download
   */
  cancelDownload() {
    if (this.downloadController) {
      this.downloadController.abort();
      this.downloadController = null;
      this.updateState({ downloading: false, downloadProgress: 0 });
      this.log('Download cancelled');
    }
  }
  
  /**
   * Check for existing update files
   */
  async checkForExistingUpdate() {
    try {
      const updateMetadata = await this.loadUpdateMetadata();
      if (updateMetadata) {
        this.log(`Found existing update: ${updateMetadata.version}`);
        this.updateState({ 
          updateDownloaded: true,
          currentUpdate: updateMetadata.manifest 
        });
      }
    } catch (error) {
      this.log(`Failed to check existing updates: ${error.message}`, true);
    }
  }
  
  /**
   * Check rollback capability
   */
  async checkRollbackCapability() {
    try {
      const latestBackup = await this.getLatestBackup();
      this.updateState({ rollbackAvailable: !!latestBackup });
      
      if (latestBackup) {
        this.log(`Rollback available to version ${latestBackup.version}`);
      }
    } catch (error) {
      this.log(`Failed to check rollback capability: ${error.message}`, true);
    }
  }
  
  /**
   * Save update metadata
   */
  async saveUpdateMetadata(metadata) {
    const metadataPath = path.join(this.config.updatePath, 'update-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }
  
  /**
   * Load update metadata
   */
  async loadUpdateMetadata() {
    const metadataPath = path.join(this.config.updatePath, 'update-metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      return null;
    }
    
    try {
      const data = fs.readFileSync(metadataPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      this.log(`Failed to load update metadata: ${error.message}`, true);
      return null;
    }
  }
  
  /**
   * Clear update directory
   */
  async clearUpdateDirectory() {
    try {
      if (fs.existsSync(this.config.updatePath)) {
        const files = fs.readdirSync(this.config.updatePath);
        for (const file of files) {
          const filePath = path.join(this.config.updatePath, file);
          if (fs.statSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      this.log(`Failed to clear update directory: ${error.message}`, true);
    }
  }
  
  /**
   * Verify downloaded files
   */
  async verifyDownloadedFiles(files) {
    for (const file of files) {
      if (!fs.existsSync(file.path)) {
        throw new Error(`Downloaded file not found: ${file.path}`);
      }
      
      if (file.info.hash) {
        const actualHash = this.calculateFileHash(file.path);
        if (actualHash !== file.info.hash) {
          throw new Error(`Hash verification failed for ${path.basename(file.path)}`);
        }
      }
      
      if (file.info.size) {
        const actualSize = fs.statSync(file.path).size;
        if (actualSize !== file.info.size) {
          throw new Error(`Size verification failed for ${path.basename(file.path)}`);
        }
      }
    }
    
    this.log('All downloaded files verified successfully');
  }
  
  /**
   * Verify installation integrity
   */
  async verifyInstallation(update) {
    // Basic verification - check if main executable exists and is accessible
    if (!fs.existsSync(this.config.appPath)) {
      throw new Error('Main application file not found after update');
    }
    
    // Additional verification could include:
    // - Checking file signatures
    // - Validating critical files
    // - Running integrity checks
    
    this.log('Installation verification completed');
  }
  
  /**
   * Update version information
   */
  async updateVersionInfo(newVersion) {
    try {
      // Update package.json if it exists
      const appDir = path.dirname(this.config.appPath);
      const packageJsonPath = path.join(appDir, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        packageJson.version = newVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
      
      // Update internal version
      this.config.currentVersion = newVersion;
      
      this.log(`Version updated to ${newVersion}`);
    } catch (error) {
      this.log(`Failed to update version info: ${error.message}`, true);
    }
  }
  
  /**
   * Clean up update files after installation
   */
  async cleanupUpdateFiles() {
    try {
      await this.clearUpdateDirectory();
      this.log('Update files cleaned up');
    } catch (error) {
      this.log(`Failed to cleanup update files: ${error.message}`, true);
    }
  }
  
  /**
   * Save backup information
   */
  async saveBackupInfo(backupInfo) {
    const backupIndexPath = path.join(this.config.backupPath, 'backup-index.json');
    let backupIndex = [];
    
    if (fs.existsSync(backupIndexPath)) {
      try {
        const data = fs.readFileSync(backupIndexPath, 'utf8');
        backupIndex = JSON.parse(data);
      } catch (error) {
        this.log(`Failed to load backup index: ${error.message}`, true);
      }
    }
    
    backupIndex.push(backupInfo);
    fs.writeFileSync(backupIndexPath, JSON.stringify(backupIndex, null, 2));
  }
  
  /**
   * Get latest backup information
   */
  async getLatestBackup() {
    const backupIndexPath = path.join(this.config.backupPath, 'backup-index.json');
    
    if (!fs.existsSync(backupIndexPath)) {
      return null;
    }
    
    try {
      const data = fs.readFileSync(backupIndexPath, 'utf8');
      const backupIndex = JSON.parse(data);
      
      if (backupIndex.length === 0) {
        return null;
      }
      
      // Return most recent backup
      return backupIndex[backupIndex.length - 1];
    } catch (error) {
      this.log(`Failed to get latest backup: ${error.message}`, true);
      return null;
    }
  }
  
  /**
   * Clean up old backups
   */
  async cleanupOldBackups(keepCount = 3) {
    try {
      const backupIndexPath = path.join(this.config.backupPath, 'backup-index.json');
      
      if (!fs.existsSync(backupIndexPath)) {
        return;
      }
      
      const data = fs.readFileSync(backupIndexPath, 'utf8');
      let backupIndex = JSON.parse(data);
      
      if (backupIndex.length <= keepCount) {
        return;
      }
      
      // Remove old backups
      const toRemove = backupIndex.splice(0, backupIndex.length - keepCount);
      
      for (const backup of toRemove) {
        const backupPath = path.join(this.config.backupPath, backup.filename);
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
          this.log(`Removed old backup: ${backup.filename}`);
        }
      }
      
      // Update backup index
      fs.writeFileSync(backupIndexPath, JSON.stringify(backupIndex, null, 2));
      
    } catch (error) {
      this.log(`Failed to cleanup old backups: ${error.message}`, true);
    }
  }
  
  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }
  
  /**
   * Restart application to apply updates
   */
  async restartApplication() {
    this.log('Restarting application to apply updates...');
    
    // Clean up
    this.stopAutomaticChecking();
    
    // Restart app
    app.relaunch();
    app.exit(0);
  }
  
  /**
   * Get update statistics
   */
  getUpdateStatistics() {
    return {
      currentVersion: this.config.currentVersion,
      lastCheck: this.state.lastCheck,
      updateAvailable: this.state.updateAvailable,
      updateDownloaded: this.state.updateDownloaded,
      rollbackAvailable: this.state.rollbackAvailable,
      automaticChecking: !!this.checkTimer,
      checkInterval: this.config.checkInterval
    };
  }
  
  /**
   * Force check for updates (ignores cache)
   */
  async forceCheckForUpdates() {
    this.manifestCache.clear();
    return await this.checkForUpdates(true);
  }
  
  /**
   * Get download progress
   */
  getDownloadProgress() {
    return {
      downloading: this.state.downloading,
      progress: this.state.downloadProgress,
      installing: this.state.installing
    };
  }
  
  /**
   * Check if update is ready to install
   */
  isUpdateReadyToInstall() {
    return this.state.updateDownloaded && !this.state.installing;
  }
  
  /**
   * Get available updates information
   */
  getAvailableUpdate() {
    return this.state.currentUpdate;
  }
  
  /**
   * Cleanup and destroy updater
   */
  destroy() {
    this.stopAutomaticChecking();
    this.cancelDownload();
    
    // Clear callbacks
    this.callbacks = {};
    
    this.log('Delta updater destroyed');
  }
}

module.exports = DeltaUpdater;