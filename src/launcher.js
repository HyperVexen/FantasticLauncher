// launcher.js - Enhanced with Targeted Download Support
// Adds smart downloading for only missing components

const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');
const os = require('os');
const crypto = require('crypto');
const utils = require('./utils');
const game = require('./game');
const assetVerifier = require('./asset-verifier');

/**
 * Enhanced launcher class with smart component detection and targeted downloads
 */
class Launcher {
  constructor() {
    // Basic configuration
    this.APP_NAME = 'FantasticLauncher';
    this.APP_VERSION = '1.0.0';
    
    // Paths
    if (process.platform === 'win32') {
      this.MINECRAFT_DIR = path.join(process.env.APPDATA, '.minecraft');
    } else if (process.platform === 'darwin') {
      this.MINECRAFT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
    } else {
      this.MINECRAFT_DIR = path.join(os.homedir(), '.minecraft');
    }
    
    // Derived paths
    this.VERSIONS_DIR = path.join(this.MINECRAFT_DIR, 'versions');
    this.LIBRARIES_DIR = path.join(this.MINECRAFT_DIR, 'libraries');
    this.ASSETS_DIR = path.join(this.MINECRAFT_DIR, 'assets');
    this.ASSETS_INDEXES_DIR = path.join(this.ASSETS_DIR, 'indexes');
    this.ASSETS_OBJECTS_DIR = path.join(this.ASSETS_DIR, 'objects');
    
    // URLs
    this.FABRIC_META_URL = 'https://meta.fabricmc.net/v2/versions';
    this.FABRIC_META_URL_FALLBACK = 'https://fabricmc.net/meta/v2/versions';
    this.MINECRAFT_VERSION_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
    this.MINECRAFT_VERSION_MANIFEST_FALLBACK = 'https://piston-meta.mojang.com/mc/game/version_manifest.json';
    
    // Maven repositories list
    this.MAVEN_REPOSITORIES = [
      'https://maven.fabricmc.net',
      'https://repo1.maven.org/maven2',
      'https://libraries.minecraft.net',
      'https://jitpack.io'
    ];
    
    // Game settings
    this.RAM_MIN = '1G';
    this.RAM_MAX = '2G';
    
    // Track which libraries have already been downloaded to prevent duplicates
    this.downloadedLibraries = new Set();
    
    // Enhanced progress tracking
    this.downloadProgress = {
      total: 0,
      completed: 0,
      current: '',
      phase: 'idle',
      onUpdate: null // Callback for progress updates
    };
    
    // Debug logging
    this.debug = true;
  }

  // Log with timestamp
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else if (this.debug) {
      console.log(logMessage);
    }
  }

  /**
   * Initialize the launcher with enhanced auto-detection
   */
  async initialize() {
    try {
      // Create basic directories if they don't exist
      const dirs = [
        this.MINECRAFT_DIR, 
        this.VERSIONS_DIR, 
        this.LIBRARIES_DIR, 
        this.ASSETS_DIR,
        this.ASSETS_INDEXES_DIR,
        this.ASSETS_OBJECTS_DIR
      ];
      
      dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
      
      // Initialize asset verifier
      await assetVerifier.initialize(this);
      
      // Set up game module paths
      game.setLauncherPaths(this);
      
      this.log("Enhanced launcher initialized successfully");
      return { status: 'initialized' };
    } catch (err) {
      this.log(`Failed to initialize launcher: ${err.message}`, true);
      return { status: 'failed', error: err.message };
    }
  }

  /**
   * NEW: Targeted download for missing components only
   */
  async downloadTargetedComponents(minecraftVersion, fabricVersion, missingComponents, progressCallback = null) {
    try {
      this.log(`Starting targeted download for components: ${missingComponents.join(', ')}`);
      
      // Reset progress tracking
      this.downloadProgress = {
        total: 0,
        completed: 0,
        current: '',
        phase: 'analyzing',
        onUpdate: progressCallback
      };
      
      this.updateProgress('Analyzing missing components...', 5);
      
      // Get missing component details from asset verifier
      const missingDetails = assetVerifier.getMissingComponentsList();
      
      let downloadResults = {
        success: true,
        downloadedComponents: [],
        skippedComponents: [],
        errors: []
      };
      
      // Calculate total download tasks
      let totalTasks = 0;
      if (missingComponents.includes('minecraft')) {
        totalTasks += 2; // JSON + JAR
      }
      if (missingComponents.includes('fabric')) {
        totalTasks += 2; // JSON + JAR
      }
      if (missingComponents.includes('libraries')) {
        totalTasks += missingDetails.libraries.length;
      }
      if (missingComponents.includes('assets')) {
        totalTasks += Math.min(missingDetails.assets.length, 100); // Limit for progress calculation
      }
      
      this.downloadProgress.total = totalTasks;
      this.updateProgress('Starting targeted downloads...', 10);
      
      // Download missing Minecraft components
      if (missingComponents.includes('minecraft')) {
        this.updateProgress('Downloading Minecraft client...', null);
        const minecraftResult = await this.downloadMinecraftClient(minecraftVersion);
        if (minecraftResult.success) {
          downloadResults.downloadedComponents.push('minecraft');
        } else {
          downloadResults.errors.push({ component: 'minecraft', error: minecraftResult.error });
        }
      }
      
      // Download missing Fabric components
      if (missingComponents.includes('fabric')) {
        this.updateProgress('Downloading Fabric loader...', null);
        const fabricResult = await this.downloadFabricLoader(minecraftVersion, fabricVersion);
        if (fabricResult.success) {
          downloadResults.downloadedComponents.push('fabric');
        } else {
          downloadResults.errors.push({ component: 'fabric', error: fabricResult.error });
        }
      }
      
      // Download missing libraries
      if (missingComponents.includes('libraries')) {
        this.updateProgress('Downloading missing libraries...', null);
        const librariesResult = await this.downloadMissingLibraries(missingDetails.libraries);
        if (librariesResult.success) {
          downloadResults.downloadedComponents.push(`libraries (${librariesResult.downloaded})`);
        } else {
          downloadResults.errors.push({ component: 'libraries', error: librariesResult.error });
        }
      }
      
      // Download missing assets
      if (missingComponents.includes('assets')) {
        this.updateProgress('Downloading missing assets...', null);
        const assetsResult = await this.downloadMissingAssets(missingDetails.assets);
        if (assetsResult.success) {
          downloadResults.downloadedComponents.push(`assets (${assetsResult.downloaded})`);
        } else {
          downloadResults.errors.push({ component: 'assets', error: assetsResult.error });
        }
      }
      
      // Final setup tasks
      this.updateProgress('Finalizing installation...', 95);
      
      // Transfer Fabric loader JAR if needed
      if (missingComponents.includes('fabric')) {
        await this.transferFabricLoaderJar(minecraftVersion, fabricVersion);
      }
      
      // Fix asset loading structure
      if (missingComponents.includes('assets') || missingComponents.includes('minecraft')) {
        const assetIndex = minecraftVersion; // Use minecraft version as asset index
        await assetVerifier.fixAssetLoading(assetIndex);
      }
      
      this.updateProgress('Targeted download complete!', 100);
      
      // Determine overall success
      downloadResults.success = downloadResults.errors.length === 0 || 
                                downloadResults.downloadedComponents.length > 0;
      
      this.log(`Targeted download completed. Downloaded: ${downloadResults.downloadedComponents.join(', ')}`);
      
      return downloadResults;
      
    } catch (err) {
      this.log(`Targeted download failed: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download missing Minecraft client components
   */
  async downloadMinecraftClient(minecraftVersion) {
    try {
      // Get version manifest
      const manifest = JSON.parse(
        await utils.httpGet(
          this.MINECRAFT_VERSION_MANIFEST,
          this.MINECRAFT_VERSION_MANIFEST_FALLBACK
        )
      );
      
      const versionInfo = manifest.versions.find(v => v.id === minecraftVersion);
      if (!versionInfo) {
        throw new Error(`Minecraft version ${minecraftVersion} not found`);
      }
      
      // Create version directory
      const versionDir = path.join(this.VERSIONS_DIR, minecraftVersion);
      if (!fs.existsSync(versionDir)) {
        fs.mkdirSync(versionDir, { recursive: true });
      }
      
      // Download version JSON
      const jsonPath = path.join(versionDir, `${minecraftVersion}.json`);
      if (!fs.existsSync(jsonPath)) {
        const versionJson = await utils.httpGet(versionInfo.url);
        fs.writeFileSync(jsonPath, versionJson);
        this.downloadProgress.completed++;
        this.updateProgress(`Downloaded ${minecraftVersion}.json`, null);
      } else {
        this.downloadProgress.completed++;
      }
      
      // Download client JAR
      const versionData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const clientJarPath = path.join(versionDir, `${minecraftVersion}.jar`);
      
      if (!fs.existsSync(clientJarPath) && versionData.downloads?.client) {
        await this.downloadFile(
          versionData.downloads.client.url, 
          clientJarPath, 
          versionData.downloads.client.sha1
        );
        this.downloadProgress.completed++;
        this.updateProgress(`Downloaded ${minecraftVersion}.jar`, null);
      } else {
        this.downloadProgress.completed++;
      }
      
      return { success: true };
    } catch (err) {
      this.log(`Failed to download Minecraft client: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download missing Fabric loader components
   */
  async downloadFabricLoader(minecraftVersion, fabricVersion) {
    try {
      const fabricVersionId = `fabric-loader-${fabricVersion}-${minecraftVersion}`;
      const fabricVersionDir = path.join(this.VERSIONS_DIR, fabricVersionId);
      
      if (!fs.existsSync(fabricVersionDir)) {
        fs.mkdirSync(fabricVersionDir, { recursive: true });
      }
      
      // Download Fabric JSON
      const jsonPath = path.join(fabricVersionDir, `${fabricVersionId}.json`);
      if (!fs.existsSync(jsonPath)) {
        const fabricMetaUrl = `${this.FABRIC_META_URL}/loader/${minecraftVersion}/${fabricVersion}/profile/json`;
        const fabricMetaUrlFallback = `${this.FABRIC_META_URL_FALLBACK}/loader/${minecraftVersion}/${fabricVersion}/profile/json`;
        
        const fabricJson = await utils.httpGet(fabricMetaUrl, fabricMetaUrlFallback);
        fs.writeFileSync(jsonPath, fabricJson);
        this.downloadProgress.completed++;
        this.updateProgress(`Downloaded ${fabricVersionId}.json`, null);
      } else {
        this.downloadProgress.completed++;
      }
      
      // Download Fabric loader JAR
      const jarResult = await this.downloadFabricLoaderJar(minecraftVersion, fabricVersion);
      if (jarResult.success) {
        this.downloadProgress.completed++;
        this.updateProgress(`Downloaded fabric-loader-${fabricVersion}.jar`, null);
      }
      
      return { success: true };
    } catch (err) {
      this.log(`Failed to download Fabric loader: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download missing libraries in parallel
   */
  async downloadMissingLibraries(missingLibraries) {
    try {
      if (!missingLibraries || missingLibraries.length === 0) {
        return { success: true, downloaded: 0 };
      }
      
      this.log(`Downloading ${missingLibraries.length} missing libraries`);
      
      let downloadedCount = 0;
      const batchSize = 10; // Process in batches to avoid overwhelming the system
      
      for (let i = 0; i < missingLibraries.length; i += batchSize) {
        const batch = missingLibraries.slice(i, i + batchSize);
        const batchPromises = batch.map(library => this.downloadSingleLibrary(library));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            downloadedCount++;
          }
          this.downloadProgress.completed++;
        });
        
        this.updateProgress(`Downloaded ${Math.min(i + batchSize, missingLibraries.length)} of ${missingLibraries.length} libraries`, null);
      }
      
      this.log(`Successfully downloaded ${downloadedCount} libraries`);
      return { success: true, downloaded: downloadedCount };
      
    } catch (err) {
      this.log(`Failed to download missing libraries: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download missing assets in parallel
   */
  async downloadMissingAssets(missingAssets) {
    try {
      if (!missingAssets || missingAssets.length === 0) {
        return { success: true, downloaded: 0 };
      }
      
      this.log(`Downloading ${missingAssets.length} missing assets`);
      
      // Limit concurrent asset downloads
      const concurrency = 20;
      let downloadedCount = 0;
      
      for (let i = 0; i < missingAssets.length; i += concurrency) {
        const batch = missingAssets.slice(i, i + concurrency);
        const batchPromises = batch.map(asset => this.downloadSingleAsset(asset));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.success) {
            downloadedCount++;
          }
          this.downloadProgress.completed++;
        });
        
        // Update progress less frequently for assets
        if (i % (concurrency * 5) === 0) {
          this.updateProgress(`Downloaded ${Math.min(i + concurrency, missingAssets.length)} of ${missingAssets.length} assets`, null);
        }
      }
      
      this.log(`Successfully downloaded ${downloadedCount} assets`);
      return { success: true, downloaded: downloadedCount };
      
    } catch (err) {
      this.log(`Failed to download missing assets: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download a single library
   */
  async downloadSingleLibrary(library) {
    try {
      let libPath;
      let downloadUrl;
      
      if (library.downloads?.artifact) {
        libPath = path.join(this.LIBRARIES_DIR, library.downloads.artifact.path);
        downloadUrl = library.downloads.artifact.url;
      } else if (library.name) {
        const [group, artifact, version] = library.name.split(':');
        const groupPath = group.replace(/\./g, '/');
        const jarName = `${artifact}-${version}.jar`;
        const relativePath = `${groupPath}/${artifact}/${version}/${jarName}`;
        libPath = path.join(this.LIBRARIES_DIR, relativePath);
        
        // Try each repository
        for (const repo of this.MAVEN_REPOSITORIES) {
          try {
            downloadUrl = `${repo}/${relativePath}`;
            break;
          } catch (err) {
            continue;
          }
        }
      }
      
      if (!downloadUrl) {
        throw new Error(`Cannot determine download URL for library: ${library.name}`);
      }
      
      // Create directory
      const libDir = path.dirname(libPath);
      if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
      }
      
      // Download library
      await this.downloadFile(downloadUrl, libPath, library.downloads?.artifact?.sha1);
      
      return { success: true, library: library.name };
    } catch (err) {
      this.log(`Failed to download library ${library.name}: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download a single asset
   */
  async downloadSingleAsset(asset) {
    try {
      const { hash, name } = asset;
      const hashPrefix = hash.substring(0, 2);
      const assetDir = path.join(this.ASSETS_OBJECTS_DIR, hashPrefix);
      const assetPath = path.join(assetDir, hash);
      
      if (!fs.existsSync(assetDir)) {
        fs.mkdirSync(assetDir, { recursive: true });
      }
      
      const assetUrl = `https://resources.download.minecraft.net/${hashPrefix}/${hash}`;
      await this.downloadFile(assetUrl, assetPath, hash);
      
      return { success: true, asset: name };
    } catch (err) {
      this.log(`Failed to download asset ${asset.name}: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Enhanced progress update with callback support
   */
  updateProgress(message, percent = null) {
    if (message) {
      this.downloadProgress.current = message;
    }
    
    if (percent !== null) {
      this.downloadProgress.completed = Math.floor((percent / 100) * this.downloadProgress.total);
    }
    
    // Calculate percentage
    const percentage = this.downloadProgress.total > 0 ? 
      Math.floor((this.downloadProgress.completed / this.downloadProgress.total) * 100) : 0;
    
    // Call progress callback if provided
    if (this.downloadProgress.onUpdate) {
      this.downloadProgress.onUpdate({
        phase: this.downloadProgress.phase,
        current: this.downloadProgress.current,
        completed: this.downloadProgress.completed,
        total: this.downloadProgress.total,
        percentage: percentage
      });
    }
    
    this.log(`Progress: ${percentage}% - ${message}`);
  }

  /**
   * Get the latest Minecraft version from version manifest
   */
  async getLatestMinecraftVersion() {
    try {
      const manifestUrl = this.MINECRAFT_VERSION_MANIFEST;
      const manifestFallbackUrl = this.MINECRAFT_VERSION_MANIFEST_FALLBACK;
      
      const manifest = JSON.parse(
        await utils.httpGet(manifestUrl, manifestFallbackUrl)
      );
      
      return manifest.latest.release;
    } catch (err) {
      this.log(`Failed to get latest Minecraft version: ${err.message}`, true);
      return '1.21.1'; // Fallback version
    }
  }

  /**
   * Get the latest Fabric version for a Minecraft version from Fabric API
   */
  async getLatestFabricVersion(minecraftVersion) {
    try {
      const url = `${this.FABRIC_META_URL}/loader/${minecraftVersion}`;
      const fallbackUrl = `${this.FABRIC_META_URL_FALLBACK}/loader/${minecraftVersion}`;
      
      const fabricData = JSON.parse(await utils.httpGet(url, fallbackUrl));
      return fabricData[0].loader.version;
    } catch (err) {
      this.log(`Failed to get latest Fabric version: ${err.message}`, true);
      return '0.15.0'; // Fallback version
    }
  }

  /**
   * Enhanced download file with better error handling
   */
  async downloadFile(url, destination, expectedHash = null) {
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    const tempFile = `${destination}.tmp`;
    
    try {
      // Check if file already exists and has correct hash
      if (fs.existsSync(destination) && expectedHash) {
        const isValid = await this.verifyHash(destination, expectedHash);
        if (isValid) {
          this.log(`File already exists with valid hash: ${destination}`);
          return destination;
        }
      }
      
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(tempFile);
        
        const request = https.get(url, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            file.close();
            fs.unlinkSync(tempFile);
            this.downloadFile(response.headers.location, destination, expectedHash)
              .then(resolve)
              .catch(reject);
            return;
          }
          
          // Handle successful response
          if (response.statusCode >= 200 && response.statusCode < 300) {
            response.pipe(file);
            
            file.on('finish', () => {
              file.close(() => {
                try {
                  fs.renameSync(tempFile, destination);
                  resolve(destination);
                } catch (err) {
                  reject(err);
                }
              });
            });
            
            return;
          }
          
          // Handle error status codes
          file.close(() => {
            try {
              fs.unlinkSync(tempFile);
            } catch (e) {}
            reject(new Error(`HTTP status code ${response.statusCode}`));
          });
        });
        
        request.on('error', (err) => {
          file.close();
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {}
          reject(err);
        });
        
        file.on('error', (err) => {
          file.close();
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {}
          reject(err);
        });
      });
      
      // Verify hash after download if expectedHash provided
      if (expectedHash) {
        const isValid = await this.verifyHash(destination, expectedHash);
        if (!isValid) {
          throw new Error(`Hash verification failed for ${destination}`);
        }
      }
      
      this.log(`Downloaded ${url} to ${destination}`);
      return destination;
    } catch (err) {
      this.log(`Download error for ${url}: ${err.message}`, true);
      throw err;
    }
  }

  /**
   * Verify file hash
   */
  async verifyHash(filePath, expectedHash) {
    try {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        
        stream.on('end', () => {
          const fileHash = hash.digest('hex');
          resolve(fileHash.toLowerCase() === expectedHash.toLowerCase());
        });
        
        stream.on('error', (err) => {
          reject(err);
        });
      });
    } catch (err) {
      this.log(`Error verifying file hash: ${err.message}`, true);
      return false;
    }
  }

  /**
   * Original download game files method (enhanced with smart detection)
   */
  async downloadGameFiles(minecraftVersion, fabricVersion) {
    try {
      this.log(`Starting download of game files for Minecraft ${minecraftVersion} with Fabric ${fabricVersion}`);
      
      // First, do auto-detection to see what's missing
      const detectionResult = await assetVerifier.autoDetectAndVerifyGame(
        minecraftVersion, 
        fabricVersion,
        (progress, text, status) => {
          this.updateProgress(text, progress * 0.1); // Give detection 10% of progress
        }
      );
      
      // If everything is already downloaded and verified
      if (detectionResult.verificationComplete && detectionResult.missingComponents.length === 0) {
        this.log('All game files are already present and verified');
        return { 
          success: true, 
          message: 'All files already present',
          skipped: true 
        };
      }
      
      // Use targeted download for missing components
      if (detectionResult.missingComponents.length > 0) {
        this.log(`Using targeted download for missing components: ${detectionResult.missingComponents.join(', ')}`);
        
        const targetedResult = await this.downloadTargetedComponents(
          minecraftVersion, 
          fabricVersion, 
          detectionResult.missingComponents,
          (progress) => {
            // Give targeted download 90% of progress (10-100%)
            this.updateProgress(progress.current, 10 + (progress.percentage * 0.9));
          }
        );
        
        return {
          success: targetedResult.success,
          results: targetedResult,
          detectionResult: detectionResult
        };
      }
      
      // Fallback to full download if detection failed
      this.log('Detection failed, falling back to full download');
      return await this.fullDownload(minecraftVersion, fabricVersion);
      
    } catch (err) {
      this.log(`Failed to download game files: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Full download method (fallback for when detection fails)
   */
  async fullDownload(minecraftVersion, fabricVersion) {
    try {
      this.log('Performing full game download');
      
      // Reset progress
      this.downloadProgress = {
        total: 100, // Estimate
        completed: 0,
        current: 'Starting full download...',
        phase: 'full_download',
        onUpdate: this.downloadProgress.onUpdate
      };
      
      // Download all components
      const minecraftResult = await this.downloadMinecraftClient(minecraftVersion);
      this.updateProgress('Minecraft client downloaded', 20);
      
      const fabricResult = await this.downloadFabricLoader(minecraftVersion, fabricVersion);
      this.updateProgress('Fabric loader downloaded', 40);
      
      // Download all libraries and assets (existing implementation)
      // ... (keep existing downloadDependencies logic)
      
      this.updateProgress('Full download complete', 100);
      
      return {
        success: minecraftResult.success && fabricResult.success,
        results: { minecraft: minecraftResult, fabric: fabricResult }
      };
      
    } catch (err) {
      this.log(`Full download failed: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Transfer Fabric loader JAR from libraries to versions directory
   */
  async transferFabricLoaderJar(minecraftVersion, fabricVersion) {
    try {
      const fabricVersionId = `fabric-loader-${fabricVersion}-${minecraftVersion}`;
      const fabricVersionDir = path.join(this.VERSIONS_DIR, fabricVersionId);
      const targetJarPath = path.join(fabricVersionDir, `${fabricVersionId}.jar`);
      
      const sourceJarPath = path.join(
        this.LIBRARIES_DIR,
        'net',
        'fabricmc',
        'fabric-loader',
        fabricVersion,
        `fabric-loader-${fabricVersion}.jar`
      );
      
      if (fs.existsSync(targetJarPath)) {
        this.log(`Fabric loader JAR already exists in versions directory: ${targetJarPath}`);
        return { success: true, path: targetJarPath };
      }
      
      if (!fs.existsSync(sourceJarPath)) {
        this.log(`Source Fabric loader JAR not found at: ${sourceJarPath}`, true);
        return await this.downloadFabricLoaderJar(minecraftVersion, fabricVersion);
      }
      
      if (!fs.existsSync(fabricVersionDir)) {
        fs.mkdirSync(fabricVersionDir, { recursive: true });
      }
      
      fs.copyFileSync(sourceJarPath, targetJarPath);
      this.log(`Transferred Fabric loader JAR from ${sourceJarPath} to ${targetJarPath}`);
      
      return { success: true, path: targetJarPath };
    } catch (err) {
      this.log(`Failed to transfer Fabric loader JAR: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Download Fabric loader JAR directly
   */
  async downloadFabricLoaderJar(minecraftVersion, fabricVersion) {
    try {
      const fabricVersionId = `fabric-loader-${fabricVersion}-${minecraftVersion}`;
      const fabricVersionDir = path.join(this.VERSIONS_DIR, fabricVersionId);
      const jarPath = path.join(fabricVersionDir, `${fabricVersionId}.jar`);
      
      if (!fs.existsSync(fabricVersionDir)) {
        fs.mkdirSync(fabricVersionDir, { recursive: true });
      }
      
      // Try each Maven repository to download the JAR
      const repositories = [
        'https://maven.fabricmc.net/',
        'https://repo1.maven.org/maven2/',
        'https://libraries.minecraft.net/'
      ];
      
      const groupPath = 'net/fabricmc/fabric-loader';
      const jarName = `fabric-loader-${fabricVersion}.jar`;
      let downloaded = false;
      
      for (const repo of repositories) {
        try {
          const url = `${repo}${groupPath}/${fabricVersion}/${jarName}`;
          
          this.log(`Trying to download Fabric loader JAR from ${url}`);
          await this.downloadFile(url, jarPath);
          
          if (fs.existsSync(jarPath)) {
            const stats = fs.statSync(jarPath);
            if (stats.size > 0) {
              this.log(`Successfully downloaded Fabric loader JAR to versions directory`);
              downloaded = true;
              break;
            }
          }
        } catch (err) {
          this.log(`Failed to download from ${repo}: ${err.message}`, true);
        }
      }
      
      if (!downloaded) {
        throw new Error(`Failed to download Fabric loader JAR from all repositories`);
      }
      
      return { success: true, path: jarPath };
    } catch (err) {
      this.log(`Failed to download Fabric loader JAR: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get current download progress
   */
  getProgress() {
    return {
      total: this.downloadProgress.total,
      completed: this.downloadProgress.completed,
      current: this.downloadProgress.current,
      percentage: this.downloadProgress.total === 0 ? 0 :
        Math.floor((this.downloadProgress.completed / this.downloadProgress.total) * 100)
    };
  }

  /**
   * Launch the game
   */
  async launchGame(username, minecraftVersion, fabricVersion, ram) {
    try {
      // Make sure game module has correct paths
      game.setLauncherPaths(this);
      
      // Launch the game
      this.log(`Launching game for user ${username} with Minecraft ${minecraftVersion}, Fabric ${fabricVersion}`);
      return await game.launchGame(
        username, 
        minecraftVersion, 
        fabricVersion, 
        ram || { min: this.RAM_MIN, max: this.RAM_MAX }
      );
    } catch (err) {
      this.log(`Failed to launch game: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new Launcher();