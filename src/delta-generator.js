// delta-generator.js - Generate Delta Patches for GitHub Releases
// Creates delta patches between versions and prepares update packages

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { execSync } = require('child_process');

class DeltaGenerator {
  constructor(options = {}) {
    this.config = {
      // Paths
      oldVersionPath: options.oldVersionPath || null,
      newVersionPath: options.newVersionPath || null,
      outputPath: options.outputPath || './delta-output',
      
      // Version information
      oldVersion: options.oldVersion || null,
      newVersion: options.newVersion || null,
      
      // Generator settings
      compressionLevel: options.compressionLevel || 9,
      maxPatchSize: options.maxPatchSize || 50 * 1024 * 1024, // 50MB
      excludePatterns: options.excludePatterns || [
        'node_modules/**',
        '*.log',
        '*.tmp',
        '.git/**',
        'updates/**',
        'backups/**',
        'temp/**'
      ],
      
      // Patch settings
      forceBinaryDiff: options.forceBinaryDiff || false,
      createFullBackup: options.createFullBackup || true,
      generateManifest: options.generateManifest || true,
      
      // GitHub release settings
      githubOwner: options.githubOwner || null,
      githubRepo: options.githubRepo || null,
      githubToken: options.githubToken || null
    };
    
    // State
    this.results = {
      deltaFiles: [],
      newFiles: [],
      deletedFiles: [],
      modifiedFiles: [],
      totalSizeReduction: 0,
      manifest: null
    };
    
    this.log('Delta generator initialized');
  }
  
  /**
   * Generate complete delta package
   */
  async generateDeltaPackage() {
    try {
      this.log('Starting delta package generation...');
      
      // Validate inputs
      this.validateInputs();
      
      // Prepare output directory
      await this.prepareOutputDirectory();
      
      // Analyze differences
      const differences = await this.analyzeDifferences();
      
      // Generate delta patches
      await this.generatePatches(differences);
      
      // Create new files archive
      await this.createNewFilesArchive(differences.newFiles);
      
      // Generate manifest
      if (this.config.generateManifest) {
        await this.generateManifest();
      }
      
      // Create full backup if requested
      if (this.config.createFullBackup) {
        await this.createFullVersionBackup();
      }
      
      // Generate statistics
      const stats = this.generateStatistics();
      
      this.log('Delta package generation completed successfully');
      return {
        success: true,
        outputPath: this.config.outputPath,
        statistics: stats,
        manifest: this.results.manifest
      };
      
    } catch (error) {
      this.log(`Delta package generation failed: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Validate input parameters
   */
  validateInputs() {
    if (!this.config.oldVersionPath || !fs.existsSync(this.config.oldVersionPath)) {
      throw new Error('Old version path is required and must exist');
    }
    
    if (!this.config.newVersionPath || !fs.existsSync(this.config.newVersionPath)) {
      throw new Error('New version path is required and must exist');
    }
    
    if (!this.config.oldVersion || !this.config.newVersion) {
      throw new Error('Old and new version numbers are required');
    }
    
    this.log(`Validating delta generation: ${this.config.oldVersion} → ${this.config.newVersion}`);
  }
  
  /**
   * Prepare output directory
   */
  async prepareOutputDirectory() {
    // Create output directory
    if (!fs.existsSync(this.config.outputPath)) {
      fs.mkdirSync(this.config.outputPath, { recursive: true });
    } else {
      // Clear existing contents
      const files = fs.readdirSync(this.config.outputPath);
      for (const file of files) {
        const filePath = path.join(this.config.outputPath, file);
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }
    
    this.log(`Output directory prepared: ${this.config.outputPath}`);
  }
  
  /**
   * Analyze differences between versions
   */
  async analyzeDifferences() {
    this.log('Analyzing differences between versions...');
    
    const oldFiles = await this.scanDirectory(this.config.oldVersionPath);
    const newFiles = await this.scanDirectory(this.config.newVersionPath);
    
    const differences = {
      modified: [],
      added: [],
      deleted: [],
      unchanged: []
    };
    
    // Create maps for faster lookup
    const oldFileMap = new Map();
    const newFileMap = new Map();
    
    for (const file of oldFiles) {
      oldFileMap.set(file.relativePath, file);
    }
    
    for (const file of newFiles) {
      newFileMap.set(file.relativePath, file);
    }
    
    // Find modified and deleted files
    for (const [relativePath, oldFile] of oldFileMap) {
      const newFile = newFileMap.get(relativePath);
      
      if (!newFile) {
        // File was deleted
        differences.deleted.push(oldFile);
      } else if (oldFile.hash !== newFile.hash) {
        // File was modified
        differences.modified.push({
          old: oldFile,
          new: newFile,
          relativePath: relativePath
        });
      } else {
        // File unchanged
        differences.unchanged.push(newFile);
      }
    }
    
    // Find new files
    for (const [relativePath, newFile] of newFileMap) {
      if (!oldFileMap.has(relativePath)) {
        differences.added.push(newFile);
      }
    }
    
    this.log(`Analysis complete: ${differences.modified.length} modified, ${differences.added.length} added, ${differences.deleted.length} deleted`);
    
    return differences;
  }
  
  /**
   * Scan directory and get file information
   */
  async scanDirectory(dirPath) {
    const files = [];
    
    const scanRecursive = (currentPath, relativePath = '') => {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const itemRelativePath = path.join(relativePath, item);
        
        // Skip excluded patterns
        if (this.shouldExcludeFile(itemRelativePath)) {
          continue;
        }
        
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          scanRecursive(itemPath, itemRelativePath);
        } else {
          files.push({
            absolutePath: itemPath,
            relativePath: itemRelativePath,
            size: stats.size,
            mtime: stats.mtime,
            hash: this.calculateFileHash(itemPath)
          });
        }
      }
    };
    
    scanRecursive(dirPath);
    return files;
  }
  
  /**
   * Check if file should be excluded
   */
  shouldExcludeFile(relativePath) {
    const normalizedPath = relativePath.replace(/\\/g, '/');
    
    for (const pattern of this.config.excludePatterns) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Simple pattern matching for exclusions
   */
  matchPattern(filePath, pattern) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }
  
  /**
   * Generate delta patches for modified files
   */
  async generatePatches(differences) {
    this.log(`Generating patches for ${differences.modified.length} modified files...`);
    
    for (const modifiedFile of differences.modified) {
      try {
        const patchResult = await this.createDeltaPatch(modifiedFile);
        
        if (patchResult.success) {
          this.results.deltaFiles.push(patchResult);
          this.results.modifiedFiles.push(modifiedFile.relativePath);
        } else {
          this.log(`Failed to create patch for ${modifiedFile.relativePath}: ${patchResult.error}`, true);
        }
        
      } catch (error) {
        this.log(`Error creating patch for ${modifiedFile.relativePath}: ${error.message}`, true);
      }
    }
    
    this.log(`Generated ${this.results.deltaFiles.length} delta patches`);
  }
  
  /**
   * Create delta patch for a single file
   */
  async createDeltaPatch(modifiedFile) {
    const oldFilePath = modifiedFile.old.absolutePath;
    const newFilePath = modifiedFile.new.absolutePath;
    const relativePath = modifiedFile.relativePath;
    
    try {
      // Read both files
      const oldData = fs.readFileSync(oldFilePath);
      const newData = fs.readFileSync(newFilePath);
      
      // Calculate size reduction potential
      const originalSize = newData.length;
      
      // Generate binary diff
      const patchData = await this.createBinaryDiff(oldData, newData);
      const patchSize = patchData.length;
      
      // Check if patch is worth it (should be smaller than new file)
      const sizeReduction = originalSize - patchSize;
      const reductionPercentage = (sizeReduction / originalSize) * 100;
      
      if (patchSize >= originalSize * 0.8) {
        // Patch is too large, treat as new file
        this.log(`Patch for ${relativePath} is too large (${reductionPercentage.toFixed(1)}% reduction), treating as new file`);
        return {
          success: false,
          reason: 'patch_too_large',
          treatAsNewFile: true
        };
      }
      
      // Save patch file
      const patchFileName = this.generatePatchFileName(relativePath);
      const patchFilePath = path.join(this.config.outputPath, patchFileName);
      
      // Ensure patch directory exists
      const patchDir = path.dirname(patchFilePath);
      if (!fs.existsSync(patchDir)) {
        fs.mkdirSync(patchDir, { recursive: true });
      }
      
      fs.writeFileSync(patchFilePath, patchData);
      
      this.log(`Created patch: ${patchFileName} (${reductionPercentage.toFixed(1)}% reduction)`);
      
      return {
        success: true,
        name: patchFileName,
        path: patchFilePath,
        targetFile: relativePath,
        originalSize: originalSize,
        patchSize: patchSize,
        sizeReduction: sizeReduction,
        reductionPercentage: reductionPercentage,
        hash: this.calculateFileHash(patchFilePath),
        expectedHash: modifiedFile.new.hash
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Create binary diff between two buffers
   */
  async createBinaryDiff(oldData, newData) {
    // Simple binary diff implementation
    // In production, you'd want to use a more sophisticated algorithm like bsdiff
    
    const operations = [];
    let oldPos = 0;
    let newPos = 0;
    
    while (newPos < newData.length) {
      // Find matching sequences
      const matchLength = this.findLongestMatch(oldData, newData, oldPos, newPos);
      
      if (matchLength >= 4) {
        // Copy from original
        if (newPos > 0) {
          // First, insert any unmatched new data
          const insertData = newData.slice(newPos - (newPos - oldPos), newPos);
          if (insertData.length > 0) {
            operations.push({
              type: 1, // Insert
              length: insertData.length,
              data: insertData
            });
          }
        }
        
        // Then copy matching data
        operations.push({
          type: 0, // Copy
          length: matchLength,
          oldOffset: oldPos,
          newOffset: newPos
        });
        
        oldPos += matchLength;
        newPos += matchLength;
      } else {
        // Insert new data
        const insertLength = Math.min(64, newData.length - newPos);
        const insertData = newData.slice(newPos, newPos + insertLength);
        
        operations.push({
          type: 1, // Insert
          length: insertLength,
          data: insertData
        });
        
        newPos += insertLength;
        oldPos = Math.min(oldPos + 1, oldData.length);
      }
    }
    
    // Encode operations to binary format
    return this.encodeOperations(operations);
  }
  
  /**
   * Find longest matching sequence
   */
  findLongestMatch(oldData, newData, oldPos, newPos) {
    let maxLength = 0;
    const maxSearch = Math.min(1024, oldData.length - oldPos, newData.length - newPos);
    
    for (let len = 1; len <= maxSearch; len++) {
      if (oldData[oldPos + len - 1] === newData[newPos + len - 1]) {
        maxLength = len;
      } else {
        break;
      }
    }
    
    return maxLength;
  }
  
  /**
   * Encode operations to binary format
   */
  encodeOperations(operations) {
    const buffers = [];
    
    for (const op of operations) {
      // Operation type (1 byte)
      buffers.push(Buffer.from([op.type]));
      
      // Length (4 bytes, little endian)
      const lengthBuffer = Buffer.allocUnsafe(4);
      lengthBuffer.writeUInt32LE(op.length, 0);
      buffers.push(lengthBuffer);
      
      // Data (for insert operations)
      if (op.type === 1 && op.data) {
        buffers.push(op.data);
      }
    }
    
    return Buffer.concat(buffers);
  }
  
  /**
   * Generate patch file name
   */
  generatePatchFileName(relativePath) {
    const normalizedPath = relativePath.replace(/[\\\/]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    return `${normalizedPath}.patch`;
  }
  
  /**
   * Create archive of new files
   */
  async createNewFilesArchive(newFiles) {
    if (newFiles.length === 0) {
      this.log('No new files to archive');
      return;
    }
    
    this.log(`Creating archive for ${newFiles.length} new files...`);
    
    const zip = new AdmZip();
    let totalSize = 0;
    
    for (const file of newFiles) {
      const fileData = fs.readFileSync(file.absolutePath);
      zip.addFile(file.relativePath, fileData);
      totalSize += file.size;
      this.results.newFiles.push(file.relativePath);
    }
    
    const archivePath = path.join(this.config.outputPath, 'new-files.zip');
    zip.writeZip(archivePath);
    
    const archiveSize = fs.statSync(archivePath).size;
    const compressionRatio = ((totalSize - archiveSize) / totalSize) * 100;
    
    this.log(`New files archive created: ${archivePath} (${compressionRatio.toFixed(1)}% compression)`);
    
    return {
      path: archivePath,
      originalSize: totalSize,
      compressedSize: archiveSize,
      compressionRatio: compressionRatio,
      hash: this.calculateFileHash(archivePath)
    };
  }
  
  /**
   * Generate update manifest
   */
  async generateManifest() {
    this.log('Generating update manifest...');
    
    const manifest = {
      version: this.config.newVersion,
      fromVersion: this.config.oldVersion,
      generatedAt: new Date().toISOString(),
      generator: 'FantasticLauncher Delta Generator',
      generatorVersion: '1.0.0',
      
      // Delta files information
      deltaFiles: this.results.deltaFiles.map(delta => ({
        name: delta.name,
        targetFile: delta.targetFile,
        size: delta.patchSize,
        hash: delta.hash,
        originalSize: delta.originalSize,
        sizeReduction: delta.sizeReduction,
        reductionPercentage: delta.reductionPercentage,
        expectedHash: delta.expectedHash
      })),
      
      // New files information
      newFiles: this.results.newFiles.length > 0 ? {
        name: 'new-files.zip',
        files: this.results.newFiles,
        count: this.results.newFiles.length
      } : null,
      
      // Deleted files (for information only)
      deletedFiles: this.results.deletedFiles,
      
      // Update requirements
      requiresFullRestart: true,
      minimumVersion: this.config.oldVersion,
      
      // Statistics
      statistics: this.generateStatistics()
    };
    
    const manifestPath = path.join(this.config.outputPath, 'update-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    
    this.results.manifest = manifest;
    this.log(`Update manifest generated: ${manifestPath}`);
    
    return manifest;
  }
  
  /**
   * Create full version backup
   */
  async createFullVersionBackup() {
    this.log('Creating full version backup...');
    
    const zip = new AdmZip();
    const backupPath = path.join(this.config.outputPath, `full-backup-${this.config.newVersion}.zip`);
    
    // Add all files from new version
    this.addDirectoryToZip(zip, this.config.newVersionPath, '');
    
    zip.writeZip(backupPath);
    
    const backupSize = fs.statSync(backupPath).size;
    this.log(`Full backup created: ${backupPath} (${(backupSize / 1024 / 1024).toFixed(1)} MB)`);
    
    return {
      path: backupPath,
      size: backupSize,
      hash: this.calculateFileHash(backupPath)
    };
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
      
      // Skip excluded files/directories
      if (this.shouldExcludeFile(itemZipPath)) {
        continue;
      }
      
      if (stats.isDirectory()) {
        this.addDirectoryToZip(zip, itemPath, itemZipPath);
      } else {
        zip.addLocalFile(itemPath, zipPath);
      }
    }
  }
  
  /**
   * Generate statistics
   */
  generateStatistics() {
    const deltaFiles = this.results.deltaFiles;
    const newFiles = this.results.newFiles;
    
    let totalOriginalSize = 0;
    let totalPatchSize = 0;
    let totalSizeReduction = 0;
    
    for (const delta of deltaFiles) {
      totalOriginalSize += delta.originalSize;
      totalPatchSize += delta.patchSize;
      totalSizeReduction += delta.sizeReduction;
    }
    
    const overallReductionPercentage = totalOriginalSize > 0 ? 
      (totalSizeReduction / totalOriginalSize) * 100 : 0;
    
    return {
      modifiedFilesCount: deltaFiles.length,
      newFilesCount: newFiles.length,
      deletedFilesCount: this.results.deletedFiles.length,
      totalOriginalSize: totalOriginalSize,
      totalPatchSize: totalPatchSize,
      totalSizeReduction: totalSizeReduction,
      overallReductionPercentage: overallReductionPercentage,
      estimatedDownloadSize: totalPatchSize,
      estimatedBandwidthSaving: totalSizeReduction
    };
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
   * Upload to GitHub release (if configured)
   */
  async uploadToGitHub(releaseTag, releaseNotes = '') {
    if (!this.config.githubOwner || !this.config.githubRepo || !this.config.githubToken) {
      this.log('GitHub configuration not provided, skipping upload');
      return null;
    }
    
    try {
      this.log(`Uploading delta package to GitHub release: ${releaseTag}`);
      
      // Create or get release
      const release = await this.createGitHubRelease(releaseTag, releaseNotes);
      
      // Upload files
      const uploadResults = await this.uploadFilesToRelease(release.id);
      
      this.log(`Successfully uploaded ${uploadResults.length} files to GitHub release`);
      return {
        success: true,
        releaseId: release.id,
        releaseUrl: release.html_url,
        uploadedFiles: uploadResults
      };
      
    } catch (error) {
      this.log(`Failed to upload to GitHub: ${error.message}`, true);
      throw error;
    }
  }
  
  /**
   * Create GitHub release
   */
  async createGitHubRelease(tagName, releaseNotes) {
    const url = `https://api.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases`;
    
    const releaseData = {
      tag_name: tagName,
      name: `${this.config.appName} ${tagName}`,
      body: releaseNotes || `Automatic delta update from ${this.config.oldVersion} to ${this.config.newVersion}`,
      draft: false,
      prerelease: false
    };
    
    const response = await this.githubRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(releaseData)
    });
    
    return JSON.parse(response);
  }
  
  /**
   * Upload files to GitHub release
   */
  async uploadFilesToRelease(releaseId) {
    const uploadResults = [];
    const outputFiles = fs.readdirSync(this.config.outputPath);
    
    for (const fileName of outputFiles) {
      const filePath = path.join(this.config.outputPath, fileName);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        try {
          const uploadResult = await this.uploadFileToGitHub(releaseId, fileName, filePath);
          uploadResults.push(uploadResult);
          this.log(`Uploaded: ${fileName}`);
        } catch (error) {
          this.log(`Failed to upload ${fileName}: ${error.message}`, true);
        }
      }
    }
    
    return uploadResults;
  }
  
  /**
   * Upload single file to GitHub release
   */
  async uploadFileToGitHub(releaseId, fileName, filePath) {
    const url = `https://uploads.github.com/repos/${this.config.githubOwner}/${this.config.githubRepo}/releases/${releaseId}/assets?name=${fileName}`;
    
    const fileData = fs.readFileSync(filePath);
    
    const response = await this.githubRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.config.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileData.length
      },
      body: fileData
    });
    
    return JSON.parse(response);
  }
  
  /**
   * GitHub API request helper
   */
  async githubRequest(url, options) {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const request = https.request(url, options, (response) => {
        if (response.statusCode >= 400) {
          reject(new Error(`GitHub API error: ${response.statusCode} ${response.statusMessage}`));
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
   * Generate delta package from command line arguments
   */
  static async generateFromCommandLine() {
    const args = process.argv.slice(2);
    
    if (args.length < 4) {
      console.log('Usage: node delta-generator.js <old-version-path> <new-version-path> <old-version> <new-version> [output-path]');
      console.log('Example: node delta-generator.js ./v1.0.0 ./v1.0.1 1.0.0 1.0.1 ./delta-output');
      process.exit(1);
    }
    
    const [oldVersionPath, newVersionPath, oldVersion, newVersion, outputPath] = args;
    
    const generator = new DeltaGenerator({
      oldVersionPath,
      newVersionPath,
      oldVersion,
      newVersion,
      outputPath: outputPath || './delta-output'
    });
    
    try {
      const result = await generator.generateDeltaPackage();
      
      console.log('\n=== Delta Package Generation Complete ===');
      console.log(`Output Directory: ${result.outputPath}`);
      console.log(`Modified Files: ${result.statistics.modifiedFilesCount}`);
      console.log(`New Files: ${result.statistics.newFilesCount}`);
      console.log(`Deleted Files: ${result.statistics.deletedFilesCount}`);
      console.log(`Size Reduction: ${result.statistics.overallReductionPercentage.toFixed(1)}%`);
      console.log(`Estimated Download Size: ${(result.statistics.estimatedDownloadSize / 1024 / 1024).toFixed(1)} MB`);
      console.log(`Bandwidth Saving: ${(result.statistics.estimatedBandwidthSaving / 1024 / 1024).toFixed(1)} MB`);
      
      return result;
      
    } catch (error) {
      console.error(`\nDelta generation failed: ${error.message}`);
      process.exit(1);
    }
  }
  
  /**
   * Verify delta package integrity
   */
  async verifyDeltaPackage() {
    this.log('Verifying delta package integrity...');
    
    try {
      // Check if all expected files exist
      const expectedFiles = [
        'update-manifest.json',
        ...this.results.deltaFiles.map(d => d.name)
      ];
      
      if (this.results.newFiles.length > 0) {
        expectedFiles.push('new-files.zip');
      }
      
      for (const fileName of expectedFiles) {
        const filePath = path.join(this.config.outputPath, fileName);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Expected file not found: ${fileName}`);
        }
      }
      
      // Verify manifest
      const manifestPath = path.join(this.config.outputPath, 'update-manifest.json');
      const manifestData = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestData);
      
      if (manifest.version !== this.config.newVersion) {
        throw new Error('Manifest version mismatch');
      }
      
      if (manifest.fromVersion !== this.config.oldVersion) {
        throw new Error('Manifest from-version mismatch');
      }
      
      // Verify file hashes
      for (const deltaFile of manifest.deltaFiles) {
        const filePath = path.join(this.config.outputPath, deltaFile.name);
        const actualHash = this.calculateFileHash(filePath);
        
        if (actualHash !== deltaFile.hash) {
          throw new Error(`Hash verification failed for ${deltaFile.name}`);
        }
      }
      
      this.log('Delta package verification completed successfully');
      return true;
      
    } catch (error) {
      this.log(`Delta package verification failed: ${error.message}`, true);
      return false;
    }
  }
  
  /**
   * Clean up temporary files
   */
  cleanup() {
    // Implementation for cleaning up any temporary files created during generation
    this.log('Cleaning up temporary files...');
  }
  
  /**
   * Get generation results
   */
  getResults() {
    return {
      ...this.results,
      statistics: this.generateStatistics()
    };
  }
  
  /**
   * Logging function
   */
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[DeltaGenerator] [${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }
}

module.exports = DeltaGenerator;

// Allow running from command line
if (require.main === module) {
  DeltaGenerator.generateFromCommandLine();
}