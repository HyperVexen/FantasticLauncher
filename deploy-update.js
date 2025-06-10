// deploy-update.js - Complete Electron Update Deployment Script
// Updated with proper file management and cleanup

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const DeltaGenerator = require('./src/delta-generator');
const GitHubReleaseManager = require('./src/github-release-manager');

class ElectronUpdateDeployer {
  constructor(options = {}) {
    // Environment detection
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isCI = process.env.CI === 'true';
    
    this.config = {
      // Version information
      oldVersion: options.oldVersion || null,
      newVersion: options.newVersion || null,
      
      // Paths - use appropriate directories based on environment
      buildOutputDir: options.buildOutputDir || './dist',
      previousVersionDir: options.previousVersionDir || this.getTempDir('previous-version'),
      deltaOutputDir: options.deltaOutputDir || this.getTempDir('delta-releases'),
      manifestOutputDir: options.manifestOutputDir || './update-manifests',
      
      // Electron specific
      appName: options.appName || 'FantasticLauncher',
      platforms: options.platforms || ['win32', 'darwin', 'linux'],
      
      // GitHub configuration
      githubOwner: options.githubOwner || 'HyperVexen',
      githubRepo: options.githubRepo || 'FantasticLauncher',
      githubToken: options.githubToken || process.env.GITHUB_TOKEN,
      
      // Deployment options
      createDeltaUpdates: options.createDeltaUpdates !== false,
      createFullInstallers: options.createFullInstallers !== false,
      uploadToGitHub: options.uploadToGitHub !== false,
      isDraft: options.isDraft || false,
      isPrerelease: options.isPrerelease || false,
      
      // File management
      autoCleanup: options.autoCleanup !== false,
      keepManifestsOnly: options.keepManifestsOnly !== false,
      maxLocalFileSize: options.maxLocalFileSize || 10 * 1024 * 1024, // 10MB
    };
    
    // Ensure manifest directory exists
    if (!fs.existsSync(this.config.manifestOutputDir)) {
      fs.mkdirSync(this.config.manifestOutputDir, { recursive: true });
    }
    
    this.deploymentResults = {
      deltaPackages: [],
      fullInstallers: [],
      githubRelease: null,
      uploadedAssets: [],
      manifestFiles: []
    };
  }
  
  /**
   * Get appropriate temp directory based on environment
   */
  getTempDir(subDir) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      return `./temp/${subDir}`;
    } else {
      return path.join(os.tmpdir(), 'fantastic-launcher', subDir);
    }
  }
  
  /**
   * Complete deployment process
   */
  async deployUpdate() {
    try {
      console.log(`🚀 Starting deployment for ${this.config.appName} ${this.config.newVersion}`);
      
      // Step 1: Validate inputs
      await this.validateDeployment();
      
      // Step 2: Prepare previous version for comparison
      await this.preparePreviousVersion();
      
      // Step 3: Extract current build for delta generation
      const currentVersionPaths = await this.extractCurrentBuild();
      
      // Step 4: Generate delta packages for each platform
      if (this.config.createDeltaUpdates) {
        await this.generateDeltaPackages(currentVersionPaths);
      }
      
      // Step 5: Prepare full installers
      if (this.config.createFullInstallers) {
        await this.prepareFullInstallers();
      }
      
      // Step 6: Upload to GitHub
      if (this.config.uploadToGitHub) {
        await this.uploadToGitHub();
      }
      
      // Step 7: Save manifests to trackable location
      await this.saveManifestsToRepo();
      
      // Step 8: Cleanup large files
      if (this.config.autoCleanup) {
        await this.cleanupLargeFiles();
      }
      
      // Step 9: Generate deployment report
      const report = this.generateDeploymentReport();
      
      console.log('✅ Deployment completed successfully!');
      console.log(report);
      
      return {
        success: true,
        results: this.deploymentResults,
        report: report
      };
      
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      throw error;
    } finally {
      // Always cleanup temp files
      await this.cleanupTempFiles();
    }
  }
  
  /**
   * Validate deployment configuration
   */
  async validateDeployment() {
    console.log('📋 Validating deployment configuration...');
    
    if (!this.config.newVersion) {
      throw new Error('New version is required');
    }
    
    if (!fs.existsSync(this.config.buildOutputDir)) {
      throw new Error(`Build output directory not found: ${this.config.buildOutputDir}`);
    }
    
    // Check if GitHub token is available for upload
    if (this.config.uploadToGitHub && !this.config.githubToken) {
      throw new Error('GitHub token is required for upload. Set GITHUB_TOKEN environment variable.');
    }
    
    console.log(`✓ Deploying version: ${this.config.newVersion}`);
    console.log(`✓ Build directory: ${this.config.buildOutputDir}`);
    console.log(`✓ Manifest directory: ${this.config.manifestOutputDir}`);
  }
  
  /**
   * Prepare previous version for delta comparison
   */
  async preparePreviousVersion() {
    if (!this.config.createDeltaUpdates) {
      console.log('⏭️  Skipping delta updates, no previous version needed');
      return;
    }
    
    console.log('📦 Preparing previous version for delta generation...');
    
    // Try to detect previous version automatically
    if (!this.config.oldVersion) {
      this.config.oldVersion = await this.detectPreviousVersion();
    }
    
    if (!this.config.oldVersion) {
      console.log('⚠️  No previous version found, creating full installers only');
      this.config.createDeltaUpdates = false;
      return;
    }
    
    console.log(`📂 Previous version: ${this.config.oldVersion}`);
    
    // Download or extract previous version
    await this.downloadPreviousVersion(this.config.oldVersion);
  }
  
  /**
   * Extract current build files for delta generation
   */
  async extractCurrentBuild() {
    console.log('📂 Extracting current build files...');
    
    const extractedPaths = {};
    
    for (const platform of this.config.platforms) {
      const platformPath = await this.extractPlatformBuild(platform);
      if (platformPath) {
        extractedPaths[platform] = platformPath;
        console.log(`✓ Extracted ${platform}: ${platformPath}`);
      }
    }
    
    return extractedPaths;
  }
  
  /**
   * Extract build for specific platform
   */
  async extractPlatformBuild(platform) {
    const extractDir = path.join(this.config.deltaOutputDir, 'extracted', platform);
    
    // Clean and create extraction directory
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true });
    }
    fs.mkdirSync(extractDir, { recursive: true });
    
    let sourceDir = null;
    
    switch (platform) {
      case 'win32':
        // Look for win-unpacked directory (electron-builder output)
        sourceDir = path.join(this.config.buildOutputDir, 'win-unpacked');
        if (!fs.existsSync(sourceDir)) {
          // Alternative: look for Windows executable and extract it
          const winInstaller = this.findFile(this.config.buildOutputDir, /.*-win.*\.(exe|zip)$/);
          if (winInstaller) {
            await this.extractInstaller(winInstaller, extractDir);
            return extractDir;
          }
        }
        break;
        
      case 'darwin':
        // Look for mac directory or extract from DMG
        sourceDir = path.join(this.config.buildOutputDir, 'mac');
        if (!fs.existsSync(sourceDir)) {
          const macInstaller = this.findFile(this.config.buildOutputDir, /.*-mac.*\.(dmg|zip)$/);
          if (macInstaller) {
            await this.extractInstaller(macInstaller, extractDir);
            return extractDir;
          }
        }
        break;
        
      case 'linux':
        // Look for linux-unpacked or extract AppImage
        sourceDir = path.join(this.config.buildOutputDir, 'linux-unpacked');
        if (!fs.existsSync(sourceDir)) {
          const linuxInstaller = this.findFile(this.config.buildOutputDir, /.*-linux.*\.(AppImage|tar\.gz|zip)$/);
          if (linuxInstaller) {
            await this.extractInstaller(linuxInstaller, extractDir);
            return extractDir;
          }
        }
        break;
    }
    
    if (sourceDir && fs.existsSync(sourceDir)) {
      // Copy unpacked directory
      this.copyDirectory(sourceDir, extractDir);
      return extractDir;
    }
    
    console.log(`⚠️  No build found for platform: ${platform}`);
    return null;
  }
  
  /**
   * Generate delta packages for all platforms
   */
  async generateDeltaPackages(currentVersionPaths) {
    console.log('🔄 Generating delta packages...');
    
    for (const [platform, currentPath] of Object.entries(currentVersionPaths)) {
      try {
        const previousPath = path.join(this.config.previousVersionDir, platform);
        
        if (!fs.existsSync(previousPath)) {
          console.log(`⚠️  No previous version for ${platform}, skipping delta`);
          continue;
        }
        
        console.log(`🔧 Generating delta for ${platform}...`);
        
        const deltaGenerator = new DeltaGenerator({
          oldVersionPath: previousPath,
          newVersionPath: currentPath,
          oldVersion: this.config.oldVersion,
          newVersion: this.config.newVersion,
          outputPath: path.join(this.config.deltaOutputDir, `delta-${platform}-${this.config.oldVersion}-to-${this.config.newVersion}`),
          manifestOutputPath: this.config.manifestOutputDir,
          autoCleanup: this.config.autoCleanup,
          useCloudStorage: this.config.uploadToGitHub
        });
        
        const deltaResult = await deltaGenerator.generateDeltaPackage();
        
        this.deploymentResults.deltaPackages.push({
          platform: platform,
          result: deltaResult,
          outputPath: deltaResult.outputPath,
          manifestPath: deltaResult.manifestPath
        });
        
        // Track manifest file
        if (deltaResult.manifestPath) {
          this.deploymentResults.manifestFiles.push({
            platform: platform,
            path: deltaResult.manifestPath,
            size: fs.statSync(deltaResult.manifestPath).size
          });
        }
        
        console.log(`✅ Delta for ${platform}: ${deltaResult.statistics.overallReductionPercentage.toFixed(1)}% size reduction`);
        
      } catch (error) {
        console.error(`❌ Failed to generate delta for ${platform}:`, error.message);
      }
    }
  }
  
  /**
   * Prepare full installers for upload
   */
  async prepareFullInstallers() {
    console.log('📦 Preparing full installers...');
    
    const installerPatterns = [
      /.*-win.*\.exe$/,          // Windows installer
      /.*-mac.*\.dmg$/,          // macOS installer
      /.*-linux.*\.AppImage$/,   // Linux AppImage
      /.*-linux.*\.tar\.gz$/,    // Linux tar.gz
      /.*-win.*\.zip$/,          // Windows zip
      /.*-mac.*\.zip$/           // macOS zip
    ];
    
    const buildFiles = fs.readdirSync(this.config.buildOutputDir);
    
    for (const pattern of installerPatterns) {
      const matchingFiles = buildFiles.filter(file => pattern.test(file));
      
      for (const file of matchingFiles) {
        const filePath = path.join(this.config.buildOutputDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isFile()) {
          const installer = {
            name: file,
            path: filePath,
            size: stats.size,
            platform: this.detectPlatformFromFilename(file),
            isLarge: stats.size > this.config.maxLocalFileSize
          };
          
          this.deploymentResults.fullInstallers.push(installer);
          
          if (installer.isLarge) {
            console.log(`⚠️  Large installer: ${file} (${this.formatFileSize(stats.size)}) - will be uploaded only`);
          } else {
            console.log(`✓ Found installer: ${file} (${this.formatFileSize(stats.size)})`);
          }
        }
      }
    }
  }
  
  /**
   * Upload everything to GitHub
   */
  async uploadToGitHub() {
    console.log('☁️  Uploading to GitHub...');
    
    const releaseManager = new GitHubReleaseManager({
      githubOwner: this.config.githubOwner,
      githubRepo: this.config.githubRepo,
      githubToken: this.config.githubToken,
      appName: this.config.appName,
      createDeltaUpdates: false, // We handle delta generation ourselves
      createFullRelease: false   // We handle full installers ourselves
    });
    
    // Prepare additional assets for upload
    const additionalAssets = [];
    
    // Add full installers
    for (const installer of this.deploymentResults.fullInstallers) {
      additionalAssets.push({
        name: installer.name,
        path: installer.path
      });
    }
    
    // Add delta packages (large files only)
    for (const deltaPackage of this.deploymentResults.deltaPackages) {
      if (fs.existsSync(deltaPackage.outputPath)) {
        const deltaFiles = fs.readdirSync(deltaPackage.outputPath);
        
        for (const deltaFile of deltaFiles) {
          const deltaFilePath = path.join(deltaPackage.outputPath, deltaFile);
          const stats = fs.statSync(deltaFilePath);
          
          if (stats.isFile() && deltaFile !== 'update-manifest.json') {
            additionalAssets.push({
              name: `${deltaPackage.platform}-${deltaFile}`,
              path: deltaFilePath
            });
          }
        }
      }
    }
    
    // Create release with all assets
    const releaseResult = await releaseManager.createRelease(this.config.newVersion, {
      draft: this.config.isDraft,
      prerelease: this.config.isPrerelease,
      additionalAssets: additionalAssets,
      releaseNotes: await this.generateReleaseNotes()
    });
    
    this.deploymentResults.githubRelease = releaseResult.release;
    this.deploymentResults.uploadedAssets = releaseResult.uploadResults;
    
    console.log(`✅ GitHub release created: ${releaseResult.releaseUrl}`);
    
    // Update manifests with download URLs
    await this.updateManifestsWithDownloadUrls(releaseResult.release);
  }
  
  /**
   * Update manifests with actual download URLs from GitHub release
   */
  async updateManifestsWithDownloadUrls(release) {
    console.log('🔗 Updating manifests with download URLs...');
    
    for (const manifestFile of this.deploymentResults.manifestFiles) {
      try {
        const manifestPath = manifestFile.path;
        const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // Update delta file URLs
        for (const deltaFile of manifestData.deltaFiles || []) {
          const assetName = `${manifestFile.platform}-${deltaFile.name}`;
          const asset = release.assets.find(a => a.name === assetName);
          if (asset) {
            deltaFile.downloadUrl = asset.browser_download_url;
          }
        }
        
        // Update new files URL
        if (manifestData.newFiles) {
          const assetName = `${manifestFile.platform}-${manifestData.newFiles.name}`;
          const asset = release.assets.find(a => a.name === assetName);
          if (asset) {
            manifestData.newFiles.downloadUrl = asset.browser_download_url;
          }
        }
        
        // Add release information
        manifestData.releaseInfo = {
          releaseId: release.id,
          releaseUrl: release.html_url,
          tagName: release.tag_name,
          publishedAt: release.published_at
        };
        
        // Save updated manifest
        fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
        console.log(`✓ Updated manifest: ${path.basename(manifestPath)}`);
        
      } catch (error) {
        console.error(`❌ Failed to update manifest ${manifestFile.path}: ${error.message}`);
      }
    }
  }
  
  /**
   * Save manifests to repository (trackable location)
   */
  async saveManifestsToRepo() {
    console.log('💾 Saving manifests to repository...');
    
    // Copy manifests to the trackable directory
    for (const manifestFile of this.deploymentResults.manifestFiles) {
      const sourceManifest = manifestFile.path;
      const targetManifest = path.join(
        this.config.manifestOutputDir, 
        `${manifestFile.platform}-${this.config.newVersion}.json`
      );
      
      if (fs.existsSync(sourceManifest)) {
        fs.copyFileSync(sourceManifest, targetManifest);
        console.log(`✓ Saved manifest: ${path.basename(targetManifest)}`);
      }
    }
    
    // Create a summary manifest
    const summaryManifest = {
      version: this.config.newVersion,
      previousVersion: this.config.oldVersion,
      deployedAt: new Date().toISOString(),
      platforms: this.deploymentResults.deltaPackages.map(pkg => ({
        platform: pkg.platform,
        manifestFile: `${pkg.platform}-${this.config.newVersion}.json`,
        sizeReduction: pkg.result.statistics.overallReductionPercentage
      })),
      release: this.deploymentResults.githubRelease ? {
        id: this.deploymentResults.githubRelease.id,
        url: this.deploymentResults.githubRelease.html_url,
        tag: this.deploymentResults.githubRelease.tag_name
      } : null
    };
    
    const summaryPath = path.join(this.config.manifestOutputDir, `release-${this.config.newVersion}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summaryManifest, null, 2));
    console.log(`✓ Created release summary: ${path.basename(summaryPath)}`);
  }
  
  /**
   * Clean up large files but keep manifests and small files
   */
  async cleanupLargeFiles() {
    if (!this.config.autoCleanup) {
      return;
    }
    
    console.log('🧹 Cleaning up large files...');
    
    const cleanupPaths = [
      this.config.deltaOutputDir,
      this.config.previousVersionDir
    ];
    
    for (const cleanupPath of cleanupPaths) {
      if (fs.existsSync(cleanupPath)) {
        try {
          // Only clean up if it's a temp directory
          if (cleanupPath.includes(os.tmpdir()) || cleanupPath.includes('./temp/')) {
            fs.rmSync(cleanupPath, { recursive: true, force: true });
            console.log(`✓ Cleaned up: ${cleanupPath}`);
          }
        } catch (error) {
          console.warn(`⚠️  Failed to cleanup ${cleanupPath}: ${error.message}`);
        }
      }
    }
  }
  
  /**
   * Clean up temporary files
   */
  async cleanupTempFiles() {
    const tempPatterns = [
      path.join(os.tmpdir(), 'fantastic-launcher*'),
      './temp/delta-*',
      './temp/previous-*'
    ];
    
    for (const pattern of tempPatterns) {
      try {
        const basePath = path.dirname(pattern);
        const filename = path.basename(pattern);
        
        if (fs.existsSync(basePath)) {
          const files = fs.readdirSync(basePath);
          const regex = new RegExp('^' + filename.replace(/\*/g, '.*') + '$');
          
          for (const file of files) {
            if (regex.test(file)) {
              const fullPath = path.join(basePath, file);
              if (fs.existsSync(fullPath)) {
                fs.rmSync(fullPath, { recursive: true, force: true });
              }
            }
          }
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
  
  /**
   * Generate release notes
   */
  async generateReleaseNotes() {
    let notes = `# ${this.config.appName} ${this.config.newVersion}\n\n`;
    
    // Add delta update information
    if (this.deploymentResults.deltaPackages.length > 0) {
      notes += `## 🚀 Delta Updates Available\n\n`;
      notes += `This release includes delta updates for faster downloads:\n\n`;
      
      for (const deltaPackage of this.deploymentResults.deltaPackages) {
        const stats = deltaPackage.result.statistics;
        notes += `- **${deltaPackage.platform}**: ${stats.overallReductionPercentage.toFixed(1)}% size reduction\n`;
      }
      
      notes += `\nUsers updating from ${this.config.oldVersion} will only need to download the changes.\n\n`;
    }
    
    // Add platform support
    notes += `## 📦 Platform Support\n\n`;
    const platforms = this.deploymentResults.fullInstallers.map(installer => installer.platform);
    const uniquePlatforms = [...new Set(platforms)];
    
    for (const platform of uniquePlatforms) {
      const installers = this.deploymentResults.fullInstallers.filter(i => i.platform === platform);
      notes += `### ${this.formatPlatformName(platform)}\n`;
      for (const installer of installers) {
        const sizeInfo = installer.isLarge ? '(Large file - download from release)' : `(${this.formatFileSize(installer.size)})`;
        notes += `- ${installer.name} ${sizeInfo}\n`;
      }
      notes += '\n';
    }
    
    // Add manifest information
    if (this.deploymentResults.manifestFiles.length > 0) {
      notes += `## 📋 Update Manifests\n\n`;
      notes += `The following update manifests are available in the repository:\n\n`;
      for (const manifest of this.deploymentResults.manifestFiles) {
        notes += `- \`${path.basename(manifest.path)}\` (${this.formatFileSize(manifest.size)})\n`;
      }
      notes += '\n';
    }
    
    // Add installation instructions
    notes += `## 🔧 Installation\n\n`;
    notes += `### New Installation\n`;
    notes += `Download the appropriate installer for your platform and run it.\n\n`;
    
    if (this.config.oldVersion) {
      notes += `### Update from ${this.config.oldVersion}\n`;
      notes += `The launcher will automatically detect and download only the necessary updates.\n\n`;
    }
    
    return notes;
  }
  
  /**
   * Generate deployment report
   */
  generateDeploymentReport() {
    const totalDeltaReduction = this.deploymentResults.deltaPackages.reduce((sum, pkg) => {
      return sum + (pkg.result.statistics?.estimatedBandwidthSaving || 0);
    }, 0);
    
    const manifestSizeTotal = this.deploymentResults.manifestFiles.reduce((sum, manifest) => {
      return sum + manifest.size;
    }, 0);
    
    return `
🎉 Deployment Report for ${this.config.appName} ${this.config.newVersion}

📊 Statistics:
- Delta Packages: ${this.deploymentResults.deltaPackages.length}
- Full Installers: ${this.deploymentResults.fullInstallers.length}
- Manifest Files: ${this.deploymentResults.manifestFiles.length} (${this.formatFileSize(manifestSizeTotal)})
- Total Bandwidth Saved: ${this.formatFileSize(totalDeltaReduction)}
- GitHub Assets Uploaded: ${this.deploymentResults.uploadedAssets?.successful?.length || 0}

🌍 Platforms:
${this.deploymentResults.deltaPackages.map(pkg => 
  `- ${pkg.platform}: ${pkg.result.statistics.overallReductionPercentage.toFixed(1)}% reduction`
).join('\n')}

📁 File Management:
- Large files uploaded to GitHub releases
- Small manifests saved to repository: ${this.config.manifestOutputDir}
- Temporary files cleaned up: ${this.config.autoCleanup ? 'Yes' : 'No'}

🔗 Release URL: ${this.deploymentResults.githubRelease?.html_url || 'Not uploaded'}
`;
  }
  
  /**
   * Helper methods
   */
  async detectPreviousVersion() {
    try {
      // Try to get from package.json and git tags
      const packagePath = path.join(process.cwd(), 'package.json');
      if (fs.existsSync(packagePath)) {
        // Look for version in git tags
        const gitTags = execSync('git tag --sort=-version:refname', { encoding: 'utf8' }).trim().split('\n');
        const versionTags = gitTags.filter(tag => tag.startsWith('v')).map(tag => tag.substring(1));
        
        // Exclude current version if it exists
        const filteredTags = versionTags.filter(tag => tag !== this.config.newVersion);
        
        if (filteredTags.length > 0) {
          return filteredTags[0];
        }
      }
    } catch (error) {
      console.log('Could not detect previous version automatically');
    }
    
    return null;
  }
  
  async downloadPreviousVersion(version) {
    // Implementation would download previous version from GitHub releases
    // For now, assume it's already available in previousVersionDir
    console.log(`📥 Previous version ${version} should be available in ${this.config.previousVersionDir}`);
  }
  
  findFile(directory, pattern) {
    const files = fs.readdirSync(directory);
    return files.find(file => pattern.test(file));
  }
  
  async extractInstaller(installerPath, extractDir) {
    const ext = path.extname(installerPath).toLowerCase();
    
    try {
      switch (ext) {
        case '.zip':
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(installerPath);
          zip.extractAllTo(extractDir, true);
          break;
          
        case '.exe':
          // For NSIS installers, try 7zip extraction
          execSync(`7z x "${installerPath}" -o"${extractDir}"`, { stdio: 'inherit' });
          break;
          
        case '.dmg':
          // macOS DMG extraction (requires macOS)
          execSync(`hdiutil attach "${installerPath}" -mountpoint "${extractDir}"`, { stdio: 'inherit' });
          break;
          
        default:
          throw new Error(`Unsupported installer format: ${ext}`);
      }
    } catch (error) {
      console.warn(`Failed to extract ${installerPath}: ${error.message}`);
    }
  }
  
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
  
  detectPlatformFromFilename(filename) {
    if (/win/i.test(filename)) return 'Windows';
    if (/mac|darwin/i.test(filename)) return 'macOS';
    if (/linux/i.test(filename)) return 'Linux';
    return 'Unknown';
  }
  
  formatPlatformName(platform) {
    const names = {
      'win32': 'Windows',
      'darwin': 'macOS', 
      'linux': 'Linux',
      'Windows': 'Windows',
      'macOS': 'macOS',
      'Linux': 'Linux'
    };
    return names[platform] || platform;
  }
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Command line interface
   */
  static async deployFromCommandLine() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.log('Usage: node deploy-update.js <new-version> [old-version] [options]');
      console.log('Example: node deploy-update.js 1.0.1 1.0.0 --draft --cleanup');
      console.log('\nOptions:');
      console.log('  --draft         Create as draft release');
      console.log('  --prerelease    Mark as prerelease');
      console.log('  --no-delta      Skip delta updates');
      console.log('  --no-upload     Skip GitHub upload');
      console.log('  --no-cleanup    Keep temporary files');
      console.log('  --manifests-dir Custom manifests directory');
      process.exit(1);
    }
    
    const newVersion = args[0];
    const oldVersion = args[1];
    
    const options = {
      newVersion: newVersion,
      oldVersion: oldVersion,
      isDraft: args.includes('--draft'),
      isPrerelease: args.includes('--prerelease'),
      createDeltaUpdates: !args.includes('--no-delta'),
      uploadToGitHub: !args.includes('--no-upload'),
      autoCleanup: !args.includes('--no-cleanup')
    };
    
    // Custom manifests directory
    const manifestsIndex = args.indexOf('--manifests-dir');
    if (manifestsIndex !== -1 && args[manifestsIndex + 1]) {
      options.manifestOutputDir = args[manifestsIndex + 1];
    }
    
    const deployer = new ElectronUpdateDeployer(options);
    
    try {
      const result = await deployer.deployUpdate();
      console.log('\n🎉 Deployment completed successfully!');
      return result;
    } catch (error) {
      console.error('\n❌ Deployment failed:', error.message);
      process.exit(1);
    }
  }
}

module.exports = ElectronUpdateDeployer;

// Allow running from command line
if (require.main === module) {
  ElectronUpdateDeployer.deployFromCommandLine();
}