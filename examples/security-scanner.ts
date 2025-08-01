#!/usr/bin/env node
/**
 * Security Scanner Example
 * 
 * Real-world usage: Scan codebase for security vulnerabilities
 * - SQL injection patterns
 * - XSS vulnerabilities  
 * - Hardcoded secrets
 * - Insecure crypto usage
 */

import { readFile, readdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { createDistributedTask } from '../src/distributed_integration.js';

interface SecurityIssue {
  type: 'sql_injection' | 'xss' | 'hardcoded_secret' | 'insecure_crypto';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  recommendation: string;
}

interface ScanResult {
  filesScanned: number;
  issuesFound: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

// Distributed task for scanning individual files
const scanFileTask = createDistributedTask(
  'security.scanFile',
  async (input: { filePath: string }, context: any): Promise<SecurityIssue[]> => {
    const issues: SecurityIssue[] = [];
    
    try {
      const content = await readFile(input.filePath, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const lineNum = index + 1;
        
        // SQL Injection detection
        if (/query\s*\+\s*['"]|exec\s*\(.*\+.*\)|SELECT.*\+/.test(line)) {
          issues.push({
            type: 'sql_injection',
            severity: 'critical',
            file: input.filePath,
            line: lineNum,
            description: 'Potential SQL injection via string concatenation',
            recommendation: 'Use parameterized queries or prepared statements'
          });
        }
        
        // XSS detection
        if (/innerHTML\s*=.*\+|document\.write\s*\(.*\+/.test(line)) {
          issues.push({
            type: 'xss',
            severity: 'high',
            file: input.filePath,
            line: lineNum,
            description: 'Potential XSS vulnerability in DOM manipulation',
            recommendation: 'Use textContent, sanitize input, or use safe templating'
          });
        }
        
        // Hardcoded secrets
        if (/api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]|password['"]?\s*[:=]\s*['"][^'"]{6,}['"]/.test(line)) {
          issues.push({
            type: 'hardcoded_secret',
            severity: 'critical',
            file: input.filePath,
            line: lineNum,
            description: 'Hardcoded API key or password detected',
            recommendation: 'Move secrets to environment variables or secure vault'
          });
        }
        
        // Insecure crypto
        if (/\b(md5|sha1|DES|RC4)\b/i.test(line)) {
          issues.push({
            type: 'insecure_crypto',
            severity: 'medium',
            file: input.filePath,
            line: lineNum,
            description: 'Use of insecure cryptographic algorithm',
            recommendation: 'Use SHA-256 or stronger, AES encryption'
          });
        }
      });
      
    } catch (error) {
      console.warn(`Failed to scan ${input.filePath}:`, error);
    }
    
    return issues;
  },
  { migratable: true }
);

export async function scanDirectory(rootPath: string): Promise<ScanResult> {
  console.log(`🔒 Starting security scan of ${rootPath}`);
  
  // Discover files to scan
  const filesToScan: string[] = [];
  const supportedExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'];
  
  async function findFiles(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory() && !['node_modules', '.git', 'dist'].includes(entry.name)) {
          await findFiles(fullPath);
        } else if (entry.isFile() && supportedExtensions.includes(extname(entry.name))) {
          filesToScan.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${dir}:`, error);
    }
  }
  
  await findFiles(rootPath);
  console.log(`📁 Found ${filesToScan.length} files to scan`);
  
  // Scan files in parallel using distributed tasks
  const allIssues: SecurityIssue[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < filesToScan.length; i += batchSize) {
    const batch = filesToScan.slice(i, i + batchSize);
    
    const batchPromises = batch.map(filePath => 
      scanFileTask.run({ filePath }, {})
    );
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const issues of batchResults) {
      allIssues.push(...issues);
    }
    
    console.log(`⚡ Processed ${Math.min(i + batchSize, filesToScan.length)}/${filesToScan.length} files`);
  }
  
  // Generate summary
  const summary = {
    critical: allIssues.filter(i => i.severity === 'critical').length,
    high: allIssues.filter(i => i.severity === 'high').length,
    medium: allIssues.filter(i => i.severity === 'medium').length,
    low: allIssues.filter(i => i.severity === 'low').length
  };
  
  const result: ScanResult = {
    filesScanned: filesToScan.length,
    issuesFound: allIssues,
    summary
  };
  
  console.log(`✅ Scan complete: ${allIssues.length} issues found`);
  console.log(`   Critical: ${summary.critical}, High: ${summary.high}, Medium: ${summary.medium}, Low: ${summary.low}`);
  
  return result;
}

export async function generateReport(result: ScanResult, outputPath: string): Promise<void> {
  const report = {
    timestamp: new Date().toISOString(),
    summary: result.summary,
    totalIssues: result.issuesFound.length,
    filesScanned: result.filesScanned,
    issues: result.issuesFound.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    })
  };
  
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved to ${outputPath}`);
}

// CLI interface
if (process.argv[2] === 'scan') {
  const scanPath = process.argv[3] || process.cwd();
  const outputPath = process.argv[4] || './security-report.json';
  
  scanDirectory(scanPath)
    .then(result => generateReport(result, outputPath))
    .then(() => {
      console.log('🎉 Security scan completed successfully');
    })
    .catch(error => {
      console.error('❌ Security scan failed:', error);
      process.exit(1);
    });
}