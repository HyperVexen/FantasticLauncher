// modrinth-api.js - Complete Modrinth API integration for FantasticLauncher
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const utils = require('./utils');

class ModrinthAPI {
  constructor() {
    this.BASE_URL = 'https://api.modrinth.com/v2';
    this.CDN_URL = 'https://cdn.modrinth.com';
    this.USER_AGENT = 'FantasticLauncher/1.0.0 (contact@fantasticlauncher.com)';
    
    // Cache for API responses
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
    this.minRequestInterval = 100; // 100ms between requests
    
    // Download tracking
    this.activeDownloads = new Map();
    
    // Debug mode
    this.debug = true;
  }
  
  // Log with timestamp
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ModrinthAPI: ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else if (this.debug) {
      console.log(logMessage);
    }
  }
  
  // Rate-limited HTTP request
  async makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, params, resolve, reject });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const { endpoint, params, resolve, reject } = this.requestQueue.shift();
      
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      if (timeSinceLastRequest < this.minRequestInterval) {
        await new Promise(r => setTimeout(r, this.minRequestInterval - timeSinceLastRequest));
      }
      
      try {
        const result = await this.executeRequest(endpoint, params);
        resolve(result);
      } catch (error) {
        reject(error);
      }
      
      this.lastRequestTime = Date.now();
    }
    
    this.isProcessingQueue = false;
  }
  
  async executeRequest(endpoint, params = {}) {
    const cacheKey = `${endpoint}?${new URLSearchParams(params).toString()}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        this.log(`Cache hit for ${endpoint}`);
        return cached.data;
      } else {
        this.cache.delete(cacheKey);
      }
    }
    
    const queryString = Object.keys(params).length > 0 ? 
      '?' + new URLSearchParams(params).toString() : '';
    const url = `${this.BASE_URL}${endpoint}${queryString}`;
    
    this.log(`Making request to ${url}`);
    
    return new Promise((resolve, reject) => {
      const request = https.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/json'
        }
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            
            // Cache the response
            this.cache.set(cacheKey, {
              data: jsonData,
              timestamp: Date.now()
            });
            
            resolve(jsonData);
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err.message}`));
          }
        });
      });
      
      request.on('error', reject);
      request.setTimeout(30000, () => {
        request.abort();
        reject(new Error('Request timeout'));
      });
    });
  }
  
  // Search for projects
  async searchProjects(query, options = {}) {
    try {
      const params = {
        query: query || '',
        limit: options.limit || 20,
        offset: options.offset || 0,
        index: options.sortBy || 'relevance',
        ...options.filters && { facets: this.buildFacets(options.filters) }
      };
      
      this.log(`Searching for projects: "${query}" with options:`, JSON.stringify(options));
      
      const result = await this.makeRequest('/search', params);
      
      return {
        hits: result.hits,
        total_hits: result.total_hits,
        offset: result.offset,
        limit: result.limit
      };
    } catch (error) {
      this.log(`Search failed: ${error.message}`, true);
      throw error;
    }
  }
  
  // Build facets for filtering
  buildFacets(filters) {
    const facets = [];
    
    if (filters.categories && filters.categories.length > 0) {
      facets.push(`["categories:${filters.categories.join('","categories:')}"]`);
    }
    
    if (filters.versions && filters.versions.length > 0) {
      facets.push(`["versions:${filters.versions.join('","versions:')}"]`);
    }
    
    if (filters.loaders && filters.loaders.length > 0) {
      facets.push(`["categories:${filters.loaders.join('","categories:')}"]`);
    }
    
    if (filters.projectType) {
      facets.push(`["project_type:${filters.projectType}"]`);
    }
    
    if (filters.license && filters.license.length > 0) {
      facets.push(`["license:${filters.license.join('","license:')}"]`);
    }
    
    return `[${facets.join(',')}]`;
  }
  
  // Get project details
  async getProject(projectId) {
    try {
      this.log(`Getting project details for: ${projectId}`);
      return await this.makeRequest(`/project/${projectId}`);
    } catch (error) {
      this.log(`Failed to get project ${projectId}: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get project versions
  async getProjectVersions(projectId, options = {}) {
    try {
      const params = {};
      
      if (options.loaders && options.loaders.length > 0) {
        params.loaders = JSON.stringify(options.loaders);
      }
      
      if (options.gameVersions && options.gameVersions.length > 0) {
        params.game_versions = JSON.stringify(options.gameVersions);
      }
      
      if (options.featured !== undefined) {
        params.featured = options.featured;
      }
      
      this.log(`Getting versions for project: ${projectId}`);
      return await this.makeRequest(`/project/${projectId}/version`, params);
    } catch (error) {
      this.log(`Failed to get project versions ${projectId}: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get specific version details
  async getVersion(versionId) {
    try {
      this.log(`Getting version details for: ${versionId}`);
      return await this.makeRequest(`/version/${versionId}`);
    } catch (error) {
      this.log(`Failed to get version ${versionId}: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get categories
  async getCategories() {
    try {
      this.log('Getting categories');
      return await this.makeRequest('/tag/category');
    } catch (error) {
      this.log(`Failed to get categories: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get game versions
  async getGameVersions() {
    try {
      this.log('Getting game versions');
      return await this.makeRequest('/tag/game_version');
    } catch (error) {
      this.log(`Failed to get game versions: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get loaders
  async getLoaders() {
    try {
      this.log('Getting loaders');
      return await this.makeRequest('/tag/loader');
    } catch (error) {
      this.log(`Failed to get loaders: ${error.message}`, true);
      throw error;
    }
  }
  
  // Download a file
  async downloadFile(url, destination, options = {}) {
    const downloadId = crypto.randomUUID();
    
    try {
      this.log(`Starting download ${downloadId}: ${url} -> ${destination}`);
      
      // Track active download
      this.activeDownloads.set(downloadId, {
        url,
        destination,
        startTime: Date.now(),
        progress: 0,
        status: 'downloading'
      });
      
      // Create destination directory
      const destDir = path.dirname(destination);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Use utils.downloadFile for consistency
      const result = await utils.downloadFile(url, destination, 3, options.expectedHash);
      
      // Update download status
      const download = this.activeDownloads.get(downloadId);
      if (download) {
        download.status = 'completed';
        download.progress = 100;
        download.endTime = Date.now();
      }
      
      this.log(`Download ${downloadId} completed successfully`);
      
      // Verify file integrity if hash provided
      if (options.expectedHash) {
        const isValid = await utils.verifyHash(destination, options.expectedHash);
        if (!isValid) {
          throw new Error('File integrity check failed');
        }
        this.log(`Download ${downloadId} integrity verified`);
      }
      
      return {
        success: true,
        downloadId,
        path: destination,
        size: fs.statSync(destination).size
      };
    } catch (error) {
      this.log(`Download ${downloadId} failed: ${error.message}`, true);
      
      // Update download status
      const download = this.activeDownloads.get(downloadId);
      if (download) {
        download.status = 'failed';
        download.error = error.message;
        download.endTime = Date.now();
      }
      
      throw error;
    }
  }
  
  // Get download progress
  getDownloadProgress(downloadId) {
    return this.activeDownloads.get(downloadId) || null;
  }
  
  // Get all active downloads
  getActiveDownloads() {
    return Array.from(this.activeDownloads.entries()).map(([id, download]) => ({
      id,
      ...download
    }));
  }
  
  // Cancel download
  cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (download) {
      download.status = 'cancelled';
      download.endTime = Date.now();
      this.log(`Download ${downloadId} cancelled`);
      return true;
    }
    return false;
  }
  
  // Clean up completed downloads from tracking
  cleanupDownloads(olderThanMs = 60000) { // 1 minute
    const now = Date.now();
    const toDelete = [];
    
    for (const [id, download] of this.activeDownloads.entries()) {
      if (download.endTime && (now - download.endTime) > olderThanMs) {
        toDelete.push(id);
      }
    }
    
    toDelete.forEach(id => this.activeDownloads.delete(id));
    
    if (toDelete.length > 0) {
      this.log(`Cleaned up ${toDelete.length} old download records`);
    }
  }
  
  // Get popular projects by category
  async getPopularProjects(category, limit = 20) {
    try {
      const filters = category ? { categories: [category] } : {};
      
      return await this.searchProjects('', {
        limit,
        sortBy: 'downloads',
        filters
      });
    } catch (error) {
      this.log(`Failed to get popular projects: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get featured projects
  async getFeaturedProjects(limit = 20) {
    try {
      return await this.searchProjects('', {
        limit,
        sortBy: 'featured'
      });
    } catch (error) {
      this.log(`Failed to get featured projects: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get recently updated projects
  async getRecentlyUpdated(limit = 20) {
    try {
      return await this.searchProjects('', {
        limit,
        sortBy: 'updated'
      });
    } catch (error) {
      this.log(`Failed to get recently updated projects: ${error.message}`, true);
      throw error;
    }
  }
  
  // Helper method to format project data for UI
  formatProjectForUI(project) {
    return {
      id: project.project_id,
      slug: project.slug,
      title: project.title,
      description: project.description,
      categories: project.categories,
      displayCategories: project.display_categories || project.categories,
      clientSide: project.client_side,
      serverSide: project.server_side,
      projectType: project.project_type,
      downloads: project.downloads,
      followers: project.followers,
      dateCreated: project.date_created,
      dateModified: project.date_modified,
      latestVersion: project.latest_version,
      license: project.license,
      iconUrl: project.icon_url,
      gallery: project.gallery || [],
      featuredGallery: project.featured_gallery,
      author: project.author,
      versions: project.versions || [],
      gameVersions: project.game_versions || [],
      loaders: project.loaders || []
    };
  }
  
  // Helper method to format version data for UI
  formatVersionForUI(version) {
    return {
      id: version.id,
      projectId: version.project_id,
      authorId: version.author_id,
      featured: version.featured,
      name: version.name,
      versionNumber: version.version_number,
      changelog: version.changelog,
      dependencies: version.dependencies || [],
      gameVersions: version.game_versions || [],
      versionType: version.version_type,
      loaders: version.loaders || [],
      datePublished: version.date_published,
      downloads: version.downloads,
      files: (version.files || []).map(file => ({
        hashes: file.hashes || {},
        url: file.url,
        filename: file.filename,
        primary: file.primary || false,
        size: file.size || 0
      }))
    };
  }
  
  // Install a mod/resource pack/etc
  async installProject(projectId, versionId, installPath, options = {}) {
    try {
      this.log(`Installing project ${projectId}, version ${versionId} to ${installPath}`);
      
      // Get version details
      const version = await this.getVersion(versionId);
      
      if (!version.files || version.files.length === 0) {
        throw new Error('No files available for this version');
      }
      
      // Find the primary file or use the first one
      const file = version.files.find(f => f.primary) || version.files[0];
      
      // Determine destination path
      const fileName = file.filename;
      const destination = path.join(installPath, fileName);
      
      // Download the file
      const downloadResult = await this.downloadFile(file.url, destination, {
        expectedHash: file.hashes?.sha1
      });
      
      // Create installation metadata
      const metadata = {
        projectId: projectId,
        versionId: versionId,
        projectTitle: version.name,
        fileName: fileName,
        filePath: destination,
        installedAt: new Date().toISOString(),
        fileSize: downloadResult.size,
        hash: file.hashes?.sha1,
        dependencies: version.dependencies || []
      };
      
      // Save metadata
      const metadataPath = path.join(installPath, '.fantastic-launcher', `${projectId}.json`);
      const metadataDir = path.dirname(metadataPath);
      
      if (!fs.existsSync(metadataDir)) {
        fs.mkdirSync(metadataDir, { recursive: true });
      }
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      this.log(`Project ${projectId} installed successfully`);
      
      return {
        success: true,
        metadata,
        downloadResult
      };
    } catch (error) {
      this.log(`Failed to install project ${projectId}: ${error.message}`, true);
      throw error;
    }
  }
  
  // Get installed projects metadata
  getInstalledProjects(installPath) {
    try {
      const metadataDir = path.join(installPath, '.fantastic-launcher');
      
      if (!fs.existsSync(metadataDir)) {
        return [];
      }
      
      const metadataFiles = fs.readdirSync(metadataDir)
        .filter(file => file.endsWith('.json'));
      
      const installed = [];
      
      for (const file of metadataFiles) {
        try {
          const metadataPath = path.join(metadataDir, file);
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          
          // Verify file still exists
          if (fs.existsSync(metadata.filePath)) {
            installed.push(metadata);
          } else {
            // Clean up orphaned metadata
            fs.unlinkSync(metadataPath);
          }
        } catch (err) {
          this.log(`Failed to read metadata ${file}: ${err.message}`, true);
        }
      }
      
      return installed;
    } catch (error) {
      this.log(`Failed to get installed projects: ${error.message}`, true);
      return [];
    }
  }
  
  // Uninstall a project
  uninstallProject(projectId, installPath) {
    try {
      const metadataPath = path.join(installPath, '.fantastic-launcher', `${projectId}.json`);
      
      if (!fs.existsSync(metadataPath)) {
        throw new Error('Project not found or not installed via FantasticLauncher');
      }
      
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      
      // Remove the project file
      if (fs.existsSync(metadata.filePath)) {
        fs.unlinkSync(metadata.filePath);
      }
      
      // Remove metadata
      fs.unlinkSync(metadataPath);
      
      this.log(`Project ${projectId} uninstalled successfully`);
      
      return { success: true, metadata };
    } catch (error) {
      this.log(`Failed to uninstall project ${projectId}: ${error.message}`, true);
      throw error;
    }
  }
}

module.exports = new ModrinthAPI();