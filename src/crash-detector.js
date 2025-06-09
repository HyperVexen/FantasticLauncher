// crash-detector.js - Comprehensive Minecraft Crash Detection and Auto-Repair System
// Monitors game process, detects crashes, analyzes crash logs, and provides automatic repair

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');

class MinecraftCrashDetector {
  constructor() {
    // Crash detection settings
    this.MINECRAFT_DIR = null;
    this.gameProcess = null;
    this.gameProcessId = null;
    this.gameStartTime = null;
    this.gameEndTime = null;
    this.isMonitoring = false;
    this.crashDetected = false;
    
    // Crash analysis
    this.crashReports = [];
    this.lastCrashReport = null;
    this.crashCategories = new Map();
    
    // Process monitoring
    this.processCheckInterval = null;
    this.logWatcher = null;
    this.crashLogWatcher = null;
    
    // Auto-repair system
    this.autoRepairEnabled = true;
    this.repairInProgress = false;
    this.repairAttempts = 0;
    this.maxRepairAttempts = 3;
    
    // Callbacks
    this.onCrashDetected = null;
    this.onGameExit = null;
    this.onProcessUpdate = null;
    this.onRepairStarted = null;
    this.onRepairCompleted = null;
    
    // Network status
    this.isNetworkConnected = true;
    
    // Debug mode
    this.debug = true;
    
    // Crash patterns for better detection
    this.crashPatterns = [
      /Exception in thread/i,
      /java\.lang\.NullPointerException/i,
      /java\.io\.IOException/i,
      /net\.minecraft\.crash\.CrashReport/i,
      /The game crashed whilst/i,
      /OutOfMemoryError/i,
      /NoClassDefFoundError/i,
      /FileNotFoundException/i,
      /ConnectException/i,
      /SocketTimeoutException/i
    ];
    
    // Common crash solutions
    this.crashSolutions = new Map([
      ['memory', 'Increase allocated RAM in launcher settings'],
      ['missing_file', 'Re-download game files to fix missing components'],
      ['network', 'Check internet connection and firewall settings'],
      ['java', 'Update Java or check Java installation'],
      ['mod', 'Remove conflicting mods or update mod versions'],
      ['corrupted', 'Verify and repair game installation'],
      ['permission', 'Run launcher as administrator or check file permissions']
    ]);
  }
  
  // Log with timestamp
  log(message, isError = false) {
    const timestamp = new Date().toISOString();
    const logMessage = `[CrashDetector] [${timestamp}] ${message}`;
    
    if (isError) {
      console.error(logMessage);
    } else if (this.debug) {
      console.log(logMessage);
    }
  }
  
  // Initialize crash detector with launcher paths
  async initialize(launcherInstance) {
    try {
      this.MINECRAFT_DIR = launcherInstance.MINECRAFT_DIR;
      this.log("Crash detector initialized successfully");
      
      // Check network status
      await this.checkNetworkStatus();
      
      // Set up crash log directory monitoring
      this.setupCrashLogMonitoring();
      
      return { status: 'initialized' };
    } catch (err) {
      this.log(`Failed to initialize crash detector: ${err.message}`, true);
      return { status: 'failed', error: err.message };
    }
  }
  
  // Check network connectivity
  async checkNetworkStatus() {
    try {
      const https = require('https');
      await new Promise((resolve, reject) => {
        const req = https.get('https://minecraft.net', { timeout: 5000 }, (res) => {
          this.isNetworkConnected = true;
          resolve();
        });
        
        req.on('error', () => {
          this.isNetworkConnected = false;
          resolve(); // Don't reject, just mark as offline
        });
        
        req.on('timeout', () => {
          this.isNetworkConnected = false;
          req.destroy();
          resolve();
        });
      });
      
      this.log(`Network status: ${this.isNetworkConnected ? 'Connected' : 'Disconnected'}`);
    } catch (err) {
      this.isNetworkConnected = false;
      this.log(`Network check failed: ${err.message}`, true);
    }
  }
  
  // Set up crash log monitoring
  setupCrashLogMonitoring() {
    if (!this.MINECRAFT_DIR) return;
    
    const crashReportsDir = path.join(this.MINECRAFT_DIR, 'crash-reports');
    const logsDir = path.join(this.MINECRAFT_DIR, 'logs');
    
    // Create directories if they don't exist
    [crashReportsDir, logsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          this.log(`Failed to create directory ${dir}: ${err.message}`, true);
        }
      }
    });
    
    // Watch for new crash reports
    try {
      if (fs.existsSync(crashReportsDir)) {
        this.crashLogWatcher = fs.watch(crashReportsDir, (eventType, filename) => {
          if (eventType === 'rename' && filename && filename.endsWith('.txt')) {
            this.handleNewCrashReport(path.join(crashReportsDir, filename));
          }
        });
        this.log("Crash reports monitoring enabled");
      }
    } catch (err) {
      this.log(`Failed to setup crash log monitoring: ${err.message}`, true);
    }
    
    // Watch latest.log for real-time crash detection
    try {
      const latestLogPath = path.join(logsDir, 'latest.log');
      if (fs.existsSync(latestLogPath)) {
        this.logWatcher = fs.watch(latestLogPath, () => {
          this.scanLatestLogForCrashes(latestLogPath);
        });
        this.log("Latest log monitoring enabled");
      }
    } catch (err) {
      this.log(`Failed to setup log monitoring: ${err.message}`, true);
    }
  }
  
  // Start monitoring a game process
  startMonitoring(gameProcess, username, minecraftVersion, fabricVersion) {
    this.gameProcess = gameProcess;
    this.gameProcessId = gameProcess.pid;
    this.gameStartTime = Date.now();
    this.gameEndTime = null;
    this.isMonitoring = true;
    this.crashDetected = false;
    this.repairAttempts = 0;
    
    this.log(`Started monitoring game process PID: ${this.gameProcessId} for user: ${username}`);
    
    // Monitor process exit
    gameProcess.on('exit', (code, signal) => {
      this.handleGameExit(code, signal, username, minecraftVersion, fabricVersion);
    });
    
    gameProcess.on('error', (error) => {
      this.log(`Game process error: ${error.message}`, true);
      this.handleGameCrash('process_error', error.message, username, minecraftVersion, fabricVersion);
    });
    
    // Start periodic process checking
    this.startProcessHealthCheck();
    
    // Check network status periodically
    this.networkCheckInterval = setInterval(() => {
      this.checkNetworkStatus();
    }, 30000); // Check every 30 seconds
    
    return {
      success: true,
      pid: this.gameProcessId,
      monitoringStarted: new Date().toISOString()
    };
  }
  
  // Handle game process exit
  async handleGameExit(exitCode, signal, username, minecraftVersion, fabricVersion) {
    this.gameEndTime = Date.now();
    this.isMonitoring = false;
    const playTime = Math.floor((this.gameEndTime - this.gameStartTime) / 1000);
    
    this.log(`Game process exited - Code: ${exitCode}, Signal: ${signal}, Play time: ${playTime}s`);
    
    // Clear intervals
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
    
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    
    // Determine if this was a crash
    const isCrash = this.determineCrashStatus(exitCode, signal, playTime);
    
    if (isCrash) {
      this.log("Game crash detected based on exit conditions", true);
      await this.handleGameCrash('exit_crash', `Exit code: ${exitCode}, Signal: ${signal}`, username, minecraftVersion, fabricVersion);
    } else {
      this.log("Game exited normally");
    }
    
    // Callback for game exit
    if (this.onGameExit) {
      this.onGameExit({
        exitCode,
        signal,
        playTime,
        isCrash,
        username,
        minecraftVersion,
        fabricVersion
      });
    }
    
    // Wait a moment then scan for crash reports
    setTimeout(() => {
      this.scanForRecentCrashReports(username, minecraftVersion, fabricVersion);
    }, 2000);
  }
  
  // Determine if the game exit was a crash
  determineCrashStatus(exitCode, signal, playTime) {
    // Immediate crash indicators
    if (exitCode === null && signal === 'SIGKILL') return true;
    if (exitCode === null && signal === 'SIGTERM') return false; // User terminated
    if (exitCode === 0) return false; // Normal exit
    
    // Non-zero exit codes usually indicate crashes
    if (exitCode !== 0) return true;
    
    // Very short play time might indicate crash
    if (playTime < 10) return true;
    
    // Default to not a crash
    return false;
  }
  
  // Handle detected game crash
  async handleGameCrash(crashType, details, username, minecraftVersion, fabricVersion) {
    this.crashDetected = true;
    
    const crashReport = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: crashType,
      details: details,
      username: username,
      minecraftVersion: minecraftVersion,
      fabricVersion: fabricVersion,
      playTime: this.gameEndTime ? Math.floor((this.gameEndTime - this.gameStartTime) / 1000) : 0,
      networkConnected: this.isNetworkConnected,
      repairAttempted: false,
      repairSuccessful: false
    };
    
    this.crashReports.push(crashReport);
    this.lastCrashReport = crashReport;
    
    this.log(`Game crash detected: ${crashType} - ${details}`, true);
    
    // Callback for crash detection
    if (this.onCrashDetected) {
      this.onCrashDetected(crashReport);
    }
    
    // Auto-repair if enabled and network is connected
    if (this.autoRepairEnabled && this.isNetworkConnected && !this.repairInProgress) {
      await this.attemptAutoRepair(crashReport, minecraftVersion, fabricVersion);
    }
    
    return crashReport;
  }
  
  // Attempt automatic repair
  async attemptAutoRepair(crashReport, minecraftVersion, fabricVersion) {
    if (this.repairAttempts >= this.maxRepairAttempts) {
      this.log(`Maximum repair attempts (${this.maxRepairAttempts}) reached, skipping auto-repair`);
      return { success: false, reason: 'max_attempts_reached' };
    }
    
    this.repairInProgress = true;
    this.repairAttempts++;
    
    this.log(`Starting auto-repair attempt ${this.repairAttempts}/${this.maxRepairAttempts}`);
    
    if (this.onRepairStarted) {
      this.onRepairStarted({
        attempt: this.repairAttempts,
        maxAttempts: this.maxRepairAttempts,
        crashReport: crashReport
      });
    }
    
    try {
      // Get launcher instance for repair operations
      const launcher = require('./launcher');
      const assetVerifier = require('./asset-verifier');
      
      const repairResult = {
        success: false,
        steps: [],
        errors: []
      };
      
      // Step 1: Re-download Minecraft JSON files
      this.log("Step 1: Re-downloading Minecraft JSON files...");
      try {
        const minecraftResult = await this.repairMinecraftFiles(launcher, minecraftVersion);
        repairResult.steps.push({
          step: 'minecraft_json',
          success: minecraftResult.success,
          details: minecraftResult.message
        });
        
        if (!minecraftResult.success) {
          repairResult.errors.push(`Minecraft JSON repair failed: ${minecraftResult.error}`);
        }
      } catch (err) {
        repairResult.errors.push(`Minecraft JSON repair error: ${err.message}`);
      }
      
      // Step 2: Re-download Fabric JSON files
      this.log("Step 2: Re-downloading Fabric JSON files...");
      try {
        const fabricResult = await this.repairFabricFiles(launcher, minecraftVersion, fabricVersion);
        repairResult.steps.push({
          step: 'fabric_json',
          success: fabricResult.success,
          details: fabricResult.message
        });
        
        if (!fabricResult.success) {
          repairResult.errors.push(`Fabric JSON repair failed: ${fabricResult.error}`);
        }
      } catch (err) {
        repairResult.errors.push(`Fabric JSON repair error: ${err.message}`);
      }
      
      // Step 3: Verify and fix library conflicts
      this.log("Step 3: Verifying and fixing library conflicts...");
      try {
        const conflictResult = await assetVerifier.performAdvancedRepair(minecraftVersion, fabricVersion);
        repairResult.steps.push({
          step: 'library_conflicts',
          success: conflictResult.success,
          details: conflictResult.repairsApplied ? conflictResult.repairsApplied.join(', ') : 'No repairs needed'
        });
        
        if (!conflictResult.success) {
          repairResult.errors.push(`Library conflict repair failed: ${conflictResult.error}`);
        }
      } catch (err) {
        repairResult.errors.push(`Library conflict repair error: ${err.message}`);
      }
      
      // Step 4: Verify game integrity
      this.log("Step 4: Verifying game integrity...");
      try {
        const verificationResult = await assetVerifier.autoDetectAndVerifyGame(minecraftVersion, fabricVersion);
        const isGameReady = verificationResult.verificationComplete && 
                           verificationResult.missingComponents.length === 0;
        
        repairResult.steps.push({
          step: 'game_verification',
          success: isGameReady,
          details: isGameReady ? 'Game integrity verified' : `Missing: ${verificationResult.missingComponents.join(', ')}`
        });
        
        if (!isGameReady) {
          repairResult.errors.push('Game verification failed - components still missing');
        }
      } catch (err) {
        repairResult.errors.push(`Game verification error: ${err.message}`);
      }
      
      // Determine overall success
      repairResult.success = repairResult.errors.length === 0;
      
      // Update crash report
      crashReport.repairAttempted = true;
      crashReport.repairSuccessful = repairResult.success;
      crashReport.repairDetails = repairResult;
      
      this.log(`Auto-repair completed - Success: ${repairResult.success}`);
      
      if (this.onRepairCompleted) {
        this.onRepairCompleted({
          success: repairResult.success,
          crashReport: crashReport,
          repairResult: repairResult
        });
      }
      
      return repairResult;
      
    } catch (err) {
      this.log(`Auto-repair failed: ${err.message}`, true);
      
      crashReport.repairAttempted = true;
      crashReport.repairSuccessful = false;
      crashReport.repairError = err.message;
      
      if (this.onRepairCompleted) {
        this.onRepairCompleted({
          success: false,
          crashReport: crashReport,
          error: err.message
        });
      }
      
      return { success: false, error: err.message };
    } finally {
      this.repairInProgress = false;
    }
  }
  
  // Repair Minecraft JSON files
  async repairMinecraftFiles(launcher, minecraftVersion) {
    try {
      // Get version manifest
      const manifest = JSON.parse(
        await this.httpGet('https://launchermeta.mojang.com/mc/game/version_manifest.json')
      );
      
      const versionInfo = manifest.versions.find(v => v.id === minecraftVersion);
      if (!versionInfo) {
        throw new Error(`Minecraft version ${minecraftVersion} not found in manifest`);
      }
      
      // Download fresh version JSON
      const versionDir = path.join(launcher.VERSIONS_DIR, minecraftVersion);
      const jsonPath = path.join(versionDir, `${minecraftVersion}.json`);
      
      // Backup existing file if it exists
      if (fs.existsSync(jsonPath)) {
        const backupPath = `${jsonPath}.backup.${Date.now()}`;
        fs.copyFileSync(jsonPath, backupPath);
        this.log(`Backed up existing Minecraft JSON to ${backupPath}`);
      }
      
      // Download fresh JSON
      const versionJson = await this.httpGet(versionInfo.url);
      fs.writeFileSync(jsonPath, versionJson);
      
      this.log(`Successfully repaired Minecraft JSON for version ${minecraftVersion}`);
      return { success: true, message: 'Minecraft JSON files repaired successfully' };
      
    } catch (err) {
      this.log(`Failed to repair Minecraft files: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }
  
  // Repair Fabric JSON files
  async repairFabricFiles(launcher, minecraftVersion, fabricVersion) {
    try {
      const fabricVersionId = `fabric-loader-${fabricVersion}-${minecraftVersion}`;
      const fabricVersionDir = path.join(launcher.VERSIONS_DIR, fabricVersionId);
      const jsonPath = path.join(fabricVersionDir, `${fabricVersionId}.json`);
      
      // Backup existing file if it exists
      if (fs.existsSync(jsonPath)) {
        const backupPath = `${jsonPath}.backup.${Date.now()}`;
        fs.copyFileSync(jsonPath, backupPath);
        this.log(`Backed up existing Fabric JSON to ${backupPath}`);
      }
      
      // Download fresh Fabric JSON
      const fabricMetaUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${fabricVersion}/profile/json`;
      const fabricJson = await this.httpGet(fabricMetaUrl);
      
      if (!fs.existsSync(fabricVersionDir)) {
        fs.mkdirSync(fabricVersionDir, { recursive: true });
      }
      
      fs.writeFileSync(jsonPath, fabricJson);
      
      this.log(`Successfully repaired Fabric JSON for version ${fabricVersionId}`);
      return { success: true, message: 'Fabric JSON files repaired successfully' };
      
    } catch (err) {
      this.log(`Failed to repair Fabric files: ${err.message}`, true);
      return { success: false, error: err.message };
    }
  }
  
  // HTTP GET helper with error handling
  async httpGet(url) {
    const https = require('https');
    
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }
        
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      
      request.on('error', reject);
      request.setTimeout(15000, () => {
        request.abort();
        reject(new Error('Request timeout'));
      });
    });
  }
  
  // Start periodic process health check
  startProcessHealthCheck() {
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
    }
    
    this.processCheckInterval = setInterval(() => {
      if (!this.isMonitoring || !this.gameProcessId) return;
      
      try {
        // Check if process is still running
        process.kill(this.gameProcessId, 0); // Doesn't actually kill, just checks if process exists
        
        // Process is still running
        if (this.onProcessUpdate) {
          this.onProcessUpdate({
            pid: this.gameProcessId,
            status: 'running',
            uptime: Math.floor((Date.now() - this.gameStartTime) / 1000)
          });
        }
      } catch (err) {
        // Process is not running
        this.log(`Process ${this.gameProcessId} is no longer running`);
        this.isMonitoring = false;
        
        if (this.onProcessUpdate) {
          this.onProcessUpdate({
            pid: this.gameProcessId,
            status: 'not_running',
            uptime: this.gameEndTime ? Math.floor((this.gameEndTime - this.gameStartTime) / 1000) : 0
          });
        }
      }
    }, 5000); // Check every 5 seconds
  }
  
  // Handle new crash report file
  async handleNewCrashReport(crashReportPath) {
    try {
      this.log(`New crash report detected: ${crashReportPath}`);
      
      const crashContent = fs.readFileSync(crashReportPath, 'utf8');
      const analysis = this.analyzeCrashReport(crashContent);
      
      // If we're currently monitoring and this crash is recent, handle it
      if (this.isMonitoring && this.gameProcessId) {
        await this.handleGameCrash('crash_report', analysis.summary, 
          analysis.username, analysis.minecraftVersion, analysis.fabricVersion);
      }
      
    } catch (err) {
      this.log(`Failed to process crash report: ${err.message}`, true);
    }
  }
  
  // Scan latest.log for crash indicators
  scanLatestLogForCrashes(logPath) {
    try {
      if (!fs.existsSync(logPath)) return;
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const lines = logContent.split('\n').slice(-50); // Check last 50 lines
      
      for (const line of lines) {
        for (const pattern of this.crashPatterns) {
          if (pattern.test(line)) {
            this.log(`Crash indicator found in log: ${line.substring(0, 100)}...`);
            
            if (this.isMonitoring && !this.crashDetected) {
              this.handleGameCrash('log_crash', line.trim(), 
                'unknown', 'unknown', 'unknown');
            }
            return;
          }
        }
      }
    } catch (err) {
      this.log(`Failed to scan latest log: ${err.message}`, true);
    }
  }
  
  // Analyze crash report content
  analyzeCrashReport(crashContent) {
    const analysis = {
      summary: 'Unknown crash',
      category: 'unknown',
      username: 'unknown',
      minecraftVersion: 'unknown',
      fabricVersion: 'unknown',
      suggestions: []
    };
    
    // Extract basic info
    const timeMatch = crashContent.match(/Time: (.+)/);
    const versionMatch = crashContent.match(/Minecraft Version: (.+)/);
    const javaMatch = crashContent.match(/Java Version: (.+)/);
    
    if (versionMatch) {
      analysis.minecraftVersion = versionMatch[1].trim();
    }
    
    // Categorize crash type
    if (crashContent.includes('OutOfMemoryError')) {
      analysis.category = 'memory';
      analysis.summary = 'Out of memory error';
      analysis.suggestions.push(this.crashSolutions.get('memory'));
    } else if (crashContent.includes('FileNotFoundException') || crashContent.includes('NoSuchFileException')) {
      analysis.category = 'missing_file';
      analysis.summary = 'Missing game files';
      analysis.suggestions.push(this.crashSolutions.get('missing_file'));
    } else if (crashContent.includes('ConnectException') || crashContent.includes('SocketTimeoutException')) {
      analysis.category = 'network';
      analysis.summary = 'Network connection error';
      analysis.suggestions.push(this.crashSolutions.get('network'));
    } else if (crashContent.includes('NoClassDefFoundError') || crashContent.includes('ClassNotFoundException')) {
      analysis.category = 'corrupted';
      analysis.summary = 'Corrupted game files';
      analysis.suggestions.push(this.crashSolutions.get('corrupted'));
    }
    
    return analysis;
  }
  
  // Scan for recent crash reports
  scanForRecentCrashReports(username, minecraftVersion, fabricVersion) {
    try {
      const crashReportsDir = path.join(this.MINECRAFT_DIR, 'crash-reports');
      if (!fs.existsSync(crashReportsDir)) return;
      
      const files = fs.readdirSync(crashReportsDir)
        .filter(file => file.endsWith('.txt'))
        .map(file => ({
          name: file,
          path: path.join(crashReportsDir, file),
          mtime: fs.statSync(path.join(crashReportsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      // Check the most recent crash report
      if (files.length > 0) {
        const recentCrash = files[0];
        const timeDiff = Date.now() - recentCrash.mtime.getTime();
        
        // If crash report is less than 1 minute old, it's likely from our session
        if (timeDiff < 60000) {
          this.log(`Recent crash report found: ${recentCrash.name}`);
          this.handleNewCrashReport(recentCrash.path);
        }
      }
    } catch (err) {
      this.log(`Failed to scan crash reports: ${err.message}`, true);
    }
  }
  
  // Stop monitoring
  stopMonitoring() {
    this.isMonitoring = false;
    
    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
    
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    
    if (this.logWatcher) {
      this.logWatcher.close();
      this.logWatcher = null;
    }
    
    if (this.crashLogWatcher) {
      this.crashLogWatcher.close();
      this.crashLogWatcher = null;
    }
    
    this.log("Stopped monitoring game process");
  }
  
  // Get crash statistics
  getCrashStatistics() {
    const stats = {
      totalCrashes: this.crashReports.length,
      crashesLast24h: 0,
      crashesLastWeek: 0,
      commonCrashTypes: {},
      repairSuccessRate: 0
    };
    
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const week = 7 * day;
    let repairedCrashes = 0;
    
    for (const crash of this.crashReports) {
      const crashTime = new Date(crash.timestamp).getTime();
      const timeDiff = now - crashTime;
      
      if (timeDiff < day) stats.crashesLast24h++;
      if (timeDiff < week) stats.crashesLastWeek++;
      
      // Count crash types
      stats.commonCrashTypes[crash.type] = (stats.commonCrashTypes[crash.type] || 0) + 1;
      
      // Count successful repairs
      if (crash.repairSuccessful) repairedCrashes++;
    }
    
    if (this.crashReports.length > 0) {
      stats.repairSuccessRate = Math.round((repairedCrashes / this.crashReports.length) * 100);
    }
    
    return stats;
  }
  
  // Get last crash report
  getLastCrashReport() {
    return this.lastCrashReport;
  }
  
  // Manual repair trigger
  async triggerManualRepair(minecraftVersion, fabricVersion) {
    if (this.repairInProgress) {
      return { success: false, error: 'Repair already in progress' };
    }
    
    this.log("Manual repair triggered");
    
    const mockCrashReport = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'manual_repair',
      details: 'User-initiated repair',
      networkConnected: this.isNetworkConnected
    };
    
    return await this.attemptAutoRepair(mockCrashReport, minecraftVersion, fabricVersion);
  }
  
  // Check if repair is available
  canRepair() {
    return this.isNetworkConnected && !this.repairInProgress && this.repairAttempts < this.maxRepairAttempts;
  }
  
  // Reset repair attempts
  resetRepairAttempts() {
    this.repairAttempts = 0;
    this.log("Repair attempts counter reset");
  }
  
  // Enable/disable auto-repair
  setAutoRepair(enabled) {
    this.autoRepairEnabled = enabled;
    this.log(`Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  // Cleanup
  cleanup() {
    this.stopMonitoring();
    this.crashReports = [];
    this.lastCrashReport = null;
    this.repairAttempts = 0;
    this.repairInProgress = false;
    this.log("Crash detector cleanup completed");
  }
}

module.exports = new MinecraftCrashDetector();