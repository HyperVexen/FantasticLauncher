// github-release-manager.js - Complete GitHub Release Management for Delta Updates
// Handles creating releases, uploading assets, and managing update deployments

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');
const DeltaGenerator = require('./delta-generator');

class GitHubReleaseManager {
  constructor(options = {}) {
    this.config = {
      // GitHub configuration
      githubOwner: options.githubOwner || null,
      githubRepo: options.githubRepo || null,
      githubToken: options.githubToken || process.env.GITHUB_TOKEN || null,
      
      // Repository paths
      repoPath: options.repoPath || process.cwd(),
      buildPath: options.buildPath || './dist',
      deltaOutputPath: options.deltaOutputPath || './delta-releases',
      
      // Release settings
      appName: options.appName || 'FantasticLauncher',
      createDeltaUpdates: options.createDeltaUpdates !== false,
      createFullRelease: options.createFullRelease !== false,
      generateChangelog: options.generateChangelog !== false,
      notifyUsers: options.notifyUsers || false,
      
      // Versioning
      versionFile: options.versionFile || './package.json',
      versionPattern: options.versionPattern || /^\d+\.\d+\.\d+$/,
      
      // Delta generation
      deltaGenerator: options.deltaGenerator || {},
      
      // Advanced options
      maxConcurrentUploads: options.maxConcurrentUploads || 3,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 2000,
      
      // Validation
      requireTests: options.requireTests || false,
      requireBuild: options.requireBuild || false,
      signReleases: options.signReleases || false
    };
    
    // State management
    this.state = {
      currentVersion: null,
      previousVersion: null,
      releaseInProgress: false,
      uploadProgress: new Map(),
      createdReleases: [],
      errors: []
    };
    
    // Event callbacks
    this.callbacks = {
      onReleaseStarted: null,
      onReleaseCompleted: null,
      onUploadProgress: null,
      onError: null,
      onVersionDetected: null
    };
    
    this.log('GitHub Release Manager initialized');
  }
  
  /**
   * Create a complete release with delta updates
   */
  async createRelease(version, options = {}) {
    if (this.state.releaseInProgress) {
      throw new Error('Release already in progress');
    }
    
    this.state.releaseInProgress = true;
    this.state.errors = [];
    
    try {
      this.log(`Starting release process for version ${version}`);
      
      // Validate inputs
      await this.validateRelease(version, options);
      
      // Detect previous version
      const previousVersion = await this.detectPreviousVersion(version);
      this.state.previousVersion = previousVersion;
      
      if (this.callbacks.onVersionDetected) {
        this.callbacks.onVersionDetected({ current: version, previous: previousVersion });
      }
      
      // Build application if required
      if (this.config.requireBuild) {
        await this.buildApplication();
      }
      
      // Run tests if required
      if (this.config.requireTests) {
        await this.runTests();
      }
      
      // Generate delta package if enabled and previous version exists
      let deltaPackage = null;
      if (this.config.createDeltaUpdates && previousVersion) {
        deltaPackage = await this.generateDeltaPackage(previousVersion, version);
      }
      
      // Create GitHub release
      const release = await this.createGitHubRelease(version, options);
      this.state.createdReleases.push(release);
      
      // Upload release assets
      const uploadResults = await this.uploadReleaseAssets(release, deltaPackage, options);
      
      // Generate and update changelog if enabled
      if (this.config.generateChangelog) {
        await this.updateChangelog(version, previousVersion, release);
      }
      
      // Update version tracking
      await this.updateVersionTracking(version);
      
      // Notify users if enabled
      if (this.config.notifyUsers) {
        await this.notifyUsers(release, deltaPackage);
      }
      
      const result = {
        success: true,
        version: version,
        previousVersion: previousVersion,
        release: release,
        deltaPackage: deltaPackage,
        uploadResults: uploadResults,
        releaseUrl: release.html_url
      };
      
      this.log(`Release ${version} completed successfully`);
      
      if (this.callbacks.onReleaseCompleted) {
        this.callbacks.onReleaseCompleted(result);
      }
      
      return result;
      
    } catch (error) {
      this.log(`Release failed: ${error.message}`, true);
      this.state.errors.push(error);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      
      throw error;
      
    } finally {
      this.state.releaseInProgress = false;
    }
  }
  
  /**
   * Validate release parameters
   */
  async validateRelease(version, options) {
    // Validate GitHub configuration
    if (!this.config.githubOwner || !this.config.githubRepo || !this.config.githubToken) {
      throw new Error('GitHub configuration (owner, repo, token) is required');
    }
    
    // Validate version format
    if (!this.config.versionPattern.test(version)) {
      throw new Error(`Version ${version} does not match required pattern`);
    }
    
    // Check if version already exists
    const existingReleases = await this.listReleases();
    const existingRelease = existingReleases.find(r => r.tag_name === version || r.tag_name === `v${version}`);
    
    if (existingRelease && !options.force) {
      throw new Error(`Release ${version} already exists. Use force: true to overwrite.`);
    }
    
    // Validate build path exists
    if (this.config.createFullRelease && !fs.existsSync(this.config.buildPath)) {
      throw new Error(`Build path does not exist: ${this.config.buildPath}`);
    }
    
    this.log(`Release validation passed for version ${version}`);
  }
  
  /**
   * Detect previous version for delta generation
   */
  async detectPreviousVersion(currentVersion) {
    try {
      // Method 1: Try to get from Git tags
      const gitTags = await this.getGitTags();
      const versionTags = gitTags
        .filter(tag => this.config.versionPattern.test(tag.replace(/^v/, '')))
        .sort((a, b) => this.compareVersions(b.replace(/^v/, ''), a.replace(/^v/, '')));
      
      if (versionTags.length > 0) {
        const previousTag = versionTags[0];
        this.log(`Detected previous version from Git: ${previousTag}`);
        return previousTag.replace(/^v/, '');
      }
      
      // Method 2: Try to get from GitHub releases
      const releases = await this.listReleases();
      const sortedReleases = releases
        .filter(r => !r.prerelease && !r.draft)
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      
      if (sortedReleases.length > 0) {
        const previousVersion = sortedReleases[0].tag_name.replace(/^v/, '');
        this.log(`Detected previous version from GitHub releases: ${previousVersion}`);
        return previousVersion;
      }
      
      // Method 3: Try to detect from version tracking file
      const trackingFile = path.join(this.config.repoPath, '.version-tracking.json');
      if (fs.existsSync(trackingFile)) {
        const tracking = JSON.parse(fs.readFileSync(trackingFile, 'utf8'));
        if (tracking.lastRelease) {
          this.log(`Detected previous version from tracking file: ${tracking.lastRelease}`);
          return tracking.lastRelease;
        }
      }
      
      this.log('No previous version detected - this will be treated as initial release');
      return null;
      
    } catch (error) {
      this.log(`Failed to detect previous version: ${error.message}`, true);
      return null;
    }
  }
  
  /**
   * Generate delta package
   */
  async generateDeltaPackage(previousVersion, currentVersion) {
    this.log(`Generating delta package: ${previousVersion} → ${currentVersion}`);
    
    try {
      // Get previous version files
      const previousVersionPath = await this.downloadPreviousVersion(previousVersion);
      
      // Create delta generator
      const deltaGenerator = new DeltaGenerator({
        oldVersionPath: previousVersionPath,
        newVersionPath: this.config.buildPath,
        oldVersion: previousVersion,
        newVersion: currentVersion,
        outputPath: path.join(this.config.deltaOutputPath, `delta-${previousVersion}-to-${currentVersion}`),
        ...this.config.deltaGenerator
      });
      
      // Generate delta package
      const result = await deltaGenerator.generateDeltaPackage();
      
      this.log(`Delta package generated successfully`);
      this.log(`Size reduction: ${result.statistics.overallReductionPercentage.toFixed(1)}%`);
      this.log(`Estimated download size: ${(result.statistics.estimatedDownloadSize / 1024 / 1024).toFixed(1)} MB`);
      
      return {
        ...result,
        previousVersion,
        currentVersion,
        generator: deltaGenerator
      };
      
    } catch (error) {
      this.log(`Delta package generation failed: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Download previous version for delta generation
   */
  async downloadPreviousVersion(version) {
    const previousVersionPath = path.join(this.config.deltaOutputPath, `temp-${version}`);
    
    // Clean up if exists
    if (fs.existsSync(previousVersionPath)) {
      fs.rmSync(previousVersionPath, { recursive: true });
    }
    
    try {
      // Try to get from Git
      this.log(`Downloading previous version ${version} from Git...`);
      
      // Create temporary directory
      fs.mkdirSync(previousVersionPath, { recursive: true });
      
      // Checkout previous version
      const originalBranch = execSync('git branch --show-current', { cwd: this.config.repoPath }).toString().trim();
      
      try {
        execSync(`git checkout v${version}`, { cwd: this.config.repoPath, stdio: 'inherit' });
        
        // Build previous version if build path doesn't exist
        if (this.config.requireBuild) {
          await this.buildApplication();
        }
        
        // Copy built files
        this.copyDirectory(this.config.buildPath, previousVersionPath);
        
      } finally {
        // Return to original branch
        execSync(`git checkout ${originalBranch}`, { cwd: this.config.repoPath, stdio: 'inherit' });
      }
      
      this.log(`Previous version ${version} downloaded successfully`);
      return previousVersionPath;
      
    } catch (error) {
      // Fallback: try to download from GitHub release
      this.log(`Git checkout failed, trying GitHub release download...`);
      return await this.downloadFromGitHubRelease(version, previousVersionPath);
    }
  }
  
  /**
   * Download from GitHub release
   */
  async downloadFromGitHubRelease(version, targetPath) {
    try {
      const releases = await this.listReleases();
      const release = releases.find(r => r.tag_name === version || r.tag_name === `v${version}`);
      
      if (!release) {
        throw new Error(`Release ${version} not found on GitHub`);
      }
      
      // Find full release asset (usually a zip file)
      const fullAsset = release.assets.find(asset => 
        asset.name.includes('full') || 
        asset.name.includes(this.config.appName) ||
        asset.name.endsWith('.zip') ||
        asset.name.endsWith('.tar.gz')
      );
      
      if (!fullAsset) {
        throw new Error(`No suitable release asset found for version ${version}`);
      }
      
      // Download and extract
      const downloadPath = path.join(targetPath, fullAsset.name);
      await this.downloadFile(fullAsset.browser_download_url, downloadPath);
      
      // Extract if it's an archive
      if (fullAsset.name.endsWith('.zip')) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(downloadPath);
        zip.extractAllTo(targetPath, true);
        fs.unlinkSync(downloadPath); // Clean up archive
      }
      
      this.log(`Downloaded and extracted ${version} from GitHub release`);
      return targetPath;
      
    } catch (error) {
      this.log(`Failed to download from GitHub release: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Create GitHub release
   */
  async createGitHubRelease(version, options = {}) {
    this.log(`Creating GitHub release for version ${version}`);
    
    const tagName = options.tagPrefix ? `${options.tagPrefix}${version}` : `v${version}`;
    const releaseName = options.releaseName || `${this.config.appName} ${version}`;
    
    // Generate release notes
    const releaseNotes = await this.generateReleaseNotes(version, this.state.previousVersion, options);
    
    const releaseData = {
      tag_name: tagName,
      name: releaseName,
      body: releaseNotes,
      draft: options.draft || false,
      prerelease: options.prerelease || false,
      generate_release_notes: options.generateReleaseNotes || false
    };
    
    try {
      const response = await this.githubRequest(
        `https://api.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases`,
        {
          method: 'POST',
          body: JSON.stringify(releaseData)
        }
      );
      
      const release = JSON.parse(response);
      this.log(`GitHub release created: ${release.html_url}`);
      
      return release;
      
    } catch (error) {
      if (error.message.includes('already_exists')) {
        // Release already exists, get it instead
        const releases = await this.listReleases();
        const existingRelease = releases.find(r => r.tag_name === tagName);
        
        if (existingRelease && options.force) {
          this.log(`Release ${tagName} already exists, using existing release`);
          return existingRelease;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Upload release assets
   */
  async uploadReleaseAssets(release, deltaPackage, options = {}) {
    this.log(`Uploading assets to release ${release.tag_name}`);
    
    const uploadTasks = [];
    
    // Upload full release if enabled
    if (this.config.createFullRelease) {
      uploadTasks.push({
        type: 'full',
        name: `${this.config.appName}-${release.tag_name.replace(/^v/, '')}-full.zip`,
        path: await this.createFullReleaseArchive(release.tag_name.replace(/^v/, ''))
      });
    }
    
    // Upload delta files if available
    if (deltaPackage) {
      const deltaFiles = fs.readdirSync(deltaPackage.outputPath);
      
      for (const fileName of deltaFiles) {
        const filePath = path.join(deltaPackage.outputPath, fileName);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          uploadTasks.push({
            type: 'delta',
            name: fileName,
            path: filePath
          });
        }
      }
    }
    
    // Upload additional assets if specified
    if (options.additionalAssets) {
      for (const asset of options.additionalAssets) {
        uploadTasks.push({
          type: 'additional',
          name: asset.name,
          path: asset.path
        });
      }
    }
    
    // Execute uploads with concurrency control
    const results = await this.executeUploadsWithConcurrency(release.id, uploadTasks);
    
    this.log(`Uploaded ${results.successful.length} assets successfully`);
    
    if (results.failed.length > 0) {
      this.log(`Failed to upload ${results.failed.length} assets`, true);
      for (const failure of results.failed) {
        this.log(`  - ${failure.name}: ${failure.error}`, true);
      }
    }
    
    return results;
  }
  
  /**
   * Execute uploads with concurrency control
   */
  async executeUploadsWithConcurrency(releaseId, uploadTasks) {
    const results = { successful: [], failed: [] };
    const semaphore = new Array(this.config.maxConcurrentUploads).fill(null);
    
    const executeUpload = async (task) => {
      for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
        try {
          this.log(`Uploading ${task.name} (attempt ${attempt}/${this.config.retryAttempts})`);
          
          const uploadResult = await this.uploadAssetToRelease(releaseId, task.name, task.path);
          
          results.successful.push({
            ...task,
            uploadResult: uploadResult,
            attempts: attempt
          });
          
          if (this.callbacks.onUploadProgress) {
            this.callbacks.onUploadProgress({
              task: task,
              status: 'completed',
              attempts: attempt
            });
          }
          
          return;
          
        } catch (error) {
          this.log(`Upload attempt ${attempt} failed for ${task.name}: ${error.message}`, true);
          
          if (attempt < this.config.retryAttempts) {
            await this.delay(this.config.retryDelay * attempt);
          } else {
            results.failed.push({
              ...task,
              error: error.message,
              attempts: attempt
            });
            
            if (this.callbacks.onUploadProgress) {
              this.callbacks.onUploadProgress({
                task: task,
                status: 'failed',
                error: error.message,
                attempts: attempt
              });
            }
          }
        }
      }
    };
    
    // Execute uploads with concurrency control
    const uploadPromises = uploadTasks.map(async (task, index) => {
      // Wait for available slot
      await this.waitForSlot(semaphore, index % this.config.maxConcurrentUploads);
      
      try {
        await executeUpload(task);
      } finally {
        // Release slot
        semaphore[index % this.config.maxConcurrentUploads] = null;
      }
    });
    
    await Promise.all(uploadPromises);
    return results;
  }
  
  /**
   * Wait for available upload slot
   */
  async waitForSlot(semaphore, slotIndex) {
    while (semaphore[slotIndex] !== null) {
      await this.delay(100);
    }
    semaphore[slotIndex] = true;
  }
  
  /**
   * Upload single asset to GitHub release
   */
  async uploadAssetToRelease(releaseId, fileName, filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const fileData = fs.readFileSync(filePath);
    const fileSize = fileData.length;
    
    const url = `https://uploads.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`;
    
    const response = await this.githubRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize
      },
      body: fileData
    });
    
    return JSON.parse(response);
  }
  
  /**
   * Create full release archive
   */
  async createFullReleaseArchive(version) {
    const archiveName = `${this.config.appName}-${version}-full.zip`;
    const archivePath = path.join(this.config.deltaOutputPath, archiveName);
    
    this.log(`Creating full release archive: ${archiveName}`);
    
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Add all files from build directory
    this.addDirectoryToZip(zip, this.config.buildPath, '');
    
    // Add version information
    const versionInfo = {
      version: version,
      buildDate: new Date().toISOString(),
      generator: 'FantasticLauncher Release Manager'
    };
    
    zip.addFile('version.json', Buffer.from(JSON.stringify(versionInfo, null, 2)));
    
    // Write archive
    zip.writeZip(archivePath);
    
    const archiveSize = fs.statSync(archivePath).size;
    this.log(`Full release archive created: ${archivePath} (${(archiveSize / 1024 / 1024).toFixed(1)} MB)`);
    
    return archivePath;
  }
  
  /**
   * Add directory to ZIP recursively
   */
  addDirectoryToZip(zip, dirPath, zipPath) {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const itemZipPath = path.join(zipPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        this.addDirectoryToZip(zip, itemPath, itemZipPath);
      } else {
        zip.addLocalFile(itemPath, zipPath);
      }
    }
  }
  
  /**
   * Generate release notes
   */
  async generateReleaseNotes(version, previousVersion, options = {}) {
    if (options.releaseNotes) {
      return options.releaseNotes;
    }
    
    let notes = `# ${this.config.appName} ${version}\n\n`;
    
    try {
      // Get commits since last version
      if (previousVersion) {
        const commits = await this.getCommitsSince(previousVersion);
        
        if (commits.length > 0) {
          notes += `## Changes since ${previousVersion}\n\n`;
          
          const features = [];
          const fixes = [];
          const other = [];
          
          for (const commit of commits) {
            const message = commit.message.split('\n')[0];
            
            if (message.toLowerCase().includes('feat') || message.toLowerCase().includes('feature')) {
              features.push(message);
            } else if (message.toLowerCase().includes('fix') || message.toLowerCase().includes('bug')) {
              fixes.push(message);
            } else {
              other.push(message);
            }
          }
          
          if (features.length > 0) {
            notes += `### ✨ New Features\n`;
            for (const feature of features) {
              notes += `- ${feature}\n`;
            }
            notes += '\n';
          }
          
          if (fixes.length > 0) {
            notes += `### 🐛 Bug Fixes\n`;
            for (const fix of fixes) {
              notes += `- ${fix}\n`;
            }
            notes += '\n';
          }
          
          if (other.length > 0) {
            notes += `### 📝 Other Changes\n`;
            for (const change of other) {
              notes += `- ${change}\n`;
            }
            notes += '\n';
          }
        }
      }
      
      // Add delta update information
      if (this.config.createDeltaUpdates && previousVersion) {
        notes += `## 🚀 Delta Update Available\n\n`;
        notes += `This release includes delta updates for faster downloads.\n`;
        notes += `Users updating from ${previousVersion} will only need to download the changes.\n\n`;
      }
      
      // Add installation instructions
      notes += `## 📦 Installation\n\n`;
      notes += `### New Installation\n`;
      notes += `Download the full release package and extract it to your desired location.\n\n`;
      
      if (previousVersion) {
        notes += `### Update from ${previousVersion}\n`;
        notes += `The launcher will automatically detect and download only the necessary updates.\n\n`;
      }
      
      // Add footer
      notes += `---\n`;
      notes += `**Full Changelog**: https://github.com/${this.config.githubOwner}/${this.config.githubRepo}/compare/v${previousVersion || '0.0.0'}...v${version}\n`;
      
    } catch (error) {
      this.log(`Failed to generate detailed release notes: ${error.message}`, true);
      notes += `Automatic release for ${this.config.appName} ${version}\n\n`;
      notes += `For detailed changes, see the commit history.\n`;
    }
    
    return notes;
  }
  
  /**
   * Get commits since a specific version
   */
  async getCommitsSince(previousVersion) {
    try {
      const command = `git log v${previousVersion}..HEAD --oneline --no-merges`;
      const output = execSync(command, { cwd: this.config.repoPath, encoding: 'utf8' });
      
      return output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, ...messageParts] = line.split(' ');
          return {
            hash: hash,
            message: messageParts.join(' ')
          };
        });
        
    } catch (error) {
      this.log(`Failed to get commits: ${error.message}`, true);
      return [];
    }
  }
  
  /**
   * Update changelog file
   */
  async updateChangelog(version, previousVersion, release) {
    const changelogPath = path.join(this.config.repoPath, 'CHANGELOG.md');
    
    try {
      let changelog = '';
      
      // Read existing changelog
      if (fs.existsSync(changelogPath)) {
        changelog = fs.readFileSync(changelogPath, 'utf8');
      } else {
        changelog = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n`;
      }
      
      // Generate entry for this version
      const releaseDate = new Date().toISOString().split('T')[0];
      const versionEntry = `## [${version}] - ${releaseDate}\n\n`;
      
      // Add release URL
      const releaseUrl = release.html_url;
      const releaseLink = `[Release Notes](${releaseUrl})\n\n`;
      
      // Insert at the beginning (after header)
      const lines = changelog.split('\n');
      const insertIndex = lines.findIndex(line => line.startsWith('## ')) || lines.length;
      
      lines.splice(insertIndex, 0, versionEntry + releaseLink);
      
      // Write updated changelog
      fs.writeFileSync(changelogPath, lines.join('\n'));
      
      this.log(`Updated changelog: ${changelogPath}`);
      
    } catch (error) {
      this.log(`Failed to update changelog: ${error.message}`, true);
    }
  }
  
  /**
   * Update version tracking
   */
  async updateVersionTracking(version) {
    const trackingFile = path.join(this.config.repoPath, '.version-tracking.json');
    
    let tracking = {
      releases: [],
      lastRelease: null
    };
    
    if (fs.existsSync(trackingFile)) {
      try {
        tracking = JSON.parse(fs.readFileSync(trackingFile, 'utf8'));
      } catch (error) {
        this.log(`Failed to read version tracking: ${error.message}`, true);
      }
    }
    
    // Add this release
    tracking.releases.push({
      version: version,
      date: new Date().toISOString(),
      previousVersion: this.state.previousVersion
    });
    
    tracking.lastRelease = version;
    
    // Keep only last 10 releases
    if (tracking.releases.length > 10) {
      tracking.releases = tracking.releases.slice(-10);
    }
    
    fs.writeFileSync(trackingFile, JSON.stringify(tracking, null, 2));
    this.log(`Updated version tracking: ${version}`);
  }
  
  /**
   * Build application
   */
  async buildApplication() {
    this.log('Building application...');
    
    try {
      // Try npm run build first
      try {
        execSync('npm run build', { cwd: this.config.repoPath, stdio: 'inherit' });
        this.log('Application built successfully with npm run build');
        return;
      } catch (error) {
        // Ignore and try alternatives
      }
      
      // Try electron-builder
      try {
        execSync('npx electron-builder --publish=never', { cwd: this.config.repoPath, stdio: 'inherit' });
        this.log('Application built successfully with electron-builder');
        return;
      } catch (error) {
        // Ignore and try alternatives
      }
      
      // Try yarn build
      try {
        execSync('yarn build', { cwd: this.config.repoPath, stdio: 'inherit' });
        this.log('Application built successfully with yarn build');
        return;
      } catch (error) {
        // Final fallback
        throw new Error('No suitable build command found (tried: npm run build, electron-builder, yarn build)');
      }
      
    } catch (error) {
      this.log(`Build failed: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Run tests
   */
  async runTests() {
    this.log('Running tests...');
    
    try {
      execSync('npm test', { cwd: this.config.repoPath, stdio: 'inherit' });
      this.log('Tests passed successfully');
    } catch (error) {
      this.log(`Tests failed: ${error.message}`, true);
      throw new Error('Tests must pass before release');
    }
  }
  
  /**
   * Notify users about new release
   */
  async notifyUsers(release, deltaPackage) {
    this.log('Notifying users about new release...');
    
    // This could be extended to:
    // - Send webhooks to Discord/Slack
    // - Update website
    // - Send emails to subscribers
    // - Post to social media
    
    const notification = {
      version: release.tag_name,
      releaseUrl: release.html_url,
      hasDeltaUpdate: !!deltaPackage,
      releaseDate: release.published_at
    };
    
    // Example webhook notification
    if (process.env.DISCORD_WEBHOOK_URL) {
      await this.sendDiscordNotification(notification);
    }
    
    this.log('User notification completed');
  }
  
  /**
   * Send Discord webhook notification
   */
  async sendDiscordNotification(notification) {
    try {
      const embed = {
        title: `🚀 ${this.config.appName} ${notification.version} Released!`,
        description: `A new version of ${this.config.appName} is now available.`,
        color: 3447003, // Blue color
        fields: [
          {
            name: 'Version',
            value: notification.version,
            inline: true
          },
          {
            name: 'Delta Update',
            value: notification.hasDeltaUpdate ? '✅ Available' : '❌ Not available',
            inline: true
          }
        ],
        footer: {
          text: 'FantasticLauncher Release Manager'
        },
        timestamp: notification.releaseDate,
        url: notification.releaseUrl
      };
      
      const payload = {
        embeds: [embed]
      };
      
      await this.httpRequest(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      this.log('Discord notification sent successfully');
      
    } catch (error) {
      this.log(`Failed to send Discord notification: ${error.message}`, true);
    }
  }
  
  /**
   * List GitHub releases
   */
  async listReleases() {
    const response = await this.githubRequest(
      `https://api.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases`
    );
    
    return JSON.parse(response);
  }
  
  /**
   * Get Git tags
   */
  async getGitTags() {
    try {
      const output = execSync('git tag --sort=-version:refname', { 
        cwd: this.config.repoPath, 
        encoding: 'utf8' 
      });
      
      return output.trim().split('\n').filter(tag => tag.trim());
    } catch (error) {
      this.log(`Failed to get Git tags: ${error.message}`, true);
      return [];
    }
  }
  
  /**
   * GitHub API request helper
   */
  async githubRequest(url, options = {}) {
    const defaultHeaders = {
      'Authorization': `token ${this.config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': `${this.config.appName}-Release-Manager/1.0.0`
    };
    
    const requestOptions = {
      method: 'GET',
      headers: { ...defaultHeaders, ...options.headers },
      ...options
    };
    
    return await this.httpRequest(url, requestOptions);
  }
  
  /**
   * HTTP request helper
   */
  async httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const request = https.request(url, options, (response) => {
        if (response.statusCode >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      
      request.on('error', reject);
      
      if (options.body) {
        request.write(options.body);
      }
      
      request.end();
    });
  }
  
  /**
   * Download file helper
   */
  async downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);
      
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve(targetPath);
        });
      }).on('error', (error) => {
        fs.unlink(targetPath, () => {}); // Clean up
        reject(error);
      });
      
      file.on('error', (error) => {
        fs.unlink(targetPath, () => {}); // Clean up
        reject(error);
      });
    });
  }
  
  /**
   * Copy directory recursively
   */
  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stats = fs.statSync(srcPath);
      
      if (stats.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
  
  /**
   * Compare version strings
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
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
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks) {
    Object.assign(this.callbacks, callbacks);
  }
  
  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Clean up temporary files
   */
  async cleanup() {
    // Clean up temporary directories
    const tempDirs = [
      path.join(this.config.deltaOutputPath, 'temp-*')
    ];
    
    for (const pattern of tempDirs) {
      try {
        const files = require('glob').sync(pattern);
        for (const file of files) {
          if (fs.existsSync(file)) {
            fs.rmSync(file, { recursive: true });
          }
        }
      } catch (error) {
        this.log(`Failed to clean up ${pattern}: ${error.message}`, true);
      }
    }
    
    this.log('Cleanup completed');
  }
  
  /**
   * Logging function
   */
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[GitHubReleaseManager] [${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }
  
  /**
   * Command line interface
   */
  static async createReleaseFromCommandLine() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.log('Usage: node github-release-manager.js <version> [options]');
      console.log('Example: node github-release-manager.js 1.0.1 --draft --prerelease');
      console.log('\nOptions:');
      console.log('  --draft         Create as draft release');
      console.log('  --prerelease    Mark as prerelease');
      console.log('  --force         Overwrite existing release');
      console.log('  --no-delta      Skip delta update generation');
      console.log('  --no-full       Skip full release archive');
      process.exit(1);
    }
    
    const version = args[0];
    const options = {
      draft: args.includes('--draft'),
      prerelease: args.includes('--prerelease'),
      force: args.includes('--force'),
      createDeltaUpdates: !args.includes('--no-delta'),
      createFullRelease: !args.includes('--no-full')
    };
    
    const manager = new GitHubReleaseManager({
      githubOwner: process.env.GITHUB_OWNER,
      githubRepo: process.env.GITHUB_REPO,
      githubToken: process.env.GITHUB_TOKEN,
      ...options
    });
    
    try {
      console.log(`\n🚀 Starting release process for ${version}...\n`);
      
      const result = await manager.createRelease(version, options);
      
      console.log('\n✅ Release completed successfully!');
      console.log(`📦 Release URL: ${result.releaseUrl}`);
      console.log(`📊 Previous Version: ${result.previousVersion || 'None'}`);
      
      if (result.deltaPackage) {
        console.log(`📈 Delta Package: ${result.deltaPackage.statistics.overallReductionPercentage.toFixed(1)}% size reduction`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`\n❌ Release failed: ${error.message}`);
      process.exit(1);
    }
  }
}

module.exports = GitHubReleaseManager;

// Allow running from command line
if (require.main === module) {
  GitHubReleaseManager.createReleaseFromCommandLine();
}