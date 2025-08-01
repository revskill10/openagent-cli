#!/usr/bin/env node
/**
 * Durable Codebase Analysis Pipeline
 * 
 * Real-world example: Analyze a large codebase for:
 * - Security vulnerabilities
 * - Code quality issues  
 * - Dependency analysis
 * - Performance bottlenecks
 * - Generate comprehensive report
 * 
 * This pipeline is fault-tolerant and can resume from any step if interrupted.
 */

import { createDistributedTask, DistributedPipelineBuilder } from '../src/distributed_integration.js';
import { GraphRAGEngine } from '../src/graphrag/core.js';
import { createCodeRAGTool } from '../src/rag/enhanced-rag-tool.js';
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';

interface CodebaseAnalysisConfig {
  rootPath: string;
  outputDir: string;
  includeExtensions: string[];
  excludePaths: string[];
  maxFileSize: number;
}

interface SecurityVulnerability {
  type: 'sql_injection' | 'xss' | 'path_traversal' | 'insecure_crypto' | 'hardcoded_secret';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  description: string;
  recommendation: string;
}

interface QualityIssue {
  type: 'complexity' | 'duplication' | 'naming' | 'maintainability' | 'documentation';
  severity: 'high' | 'medium' | 'low';
  file: string;
  line?: number;
  description: string;
  suggestion: string;
}

interface DependencyRisk {
  package: string;
  version: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  issues: string[];
  recommendation: string;
}

interface AnalysisResult {
  summary: {
    filesAnalyzed: number;
    linesOfCode: number;
    securityIssues: number;
    qualityIssues: number;
    dependencyRisks: number;
  };
  security: SecurityVulnerability[];
  quality: QualityIssue[];
  dependencies: DependencyRisk[];
  performance: {
    heavyFunctions: Array<{file: string, function: string, complexity: number}>;
    memoryLeaks: Array<{file: string, line: number, issue: string}>;
  };
}

// Step 1: Discover and categorize files
const discoverFilesTask = createDistributedTask(
  'analysis.discoverFiles',
  async (input: { rootPath: string; config: CodebaseAnalysisConfig }, context: any) => {
    console.log(`🔍 Discovering files in ${input.rootPath}...`);
    
    const files: Array<{path: string, size: number, type: string}> = [];
    
    async function scanDirectory(dirPath: string): Promise<void> {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry.name);
          
          // Skip excluded paths
          if (input.config.excludePaths.some(exclude => fullPath.includes(exclude))) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = extname(entry.name);
            if (input.config.includeExtensions.includes(ext)) {
              const stats = await stat(fullPath);
              if (stats.size <= input.config.maxFileSize) {
                files.push({
                  path: fullPath,
                  size: stats.size,
                  type: ext
                });
              }
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to scan directory ${dirPath}:`, error);
      }
    }
    
    await scanDirectory(input.rootPath);
    
    // Save checkpoint
    await writeFile(
      join(input.config.outputDir, 'files-checkpoint.json'),
      JSON.stringify(files, null, 2)
    );
    
    console.log(`✅ Discovered ${files.length} files`);
    return { files };
  },
  { migratable: true, checkpoint: true }
);

// Step 2: Security Analysis
const securityAnalysisTask = createDistributedTask(
  'analysis.security',
  async (input: { files: Array<{path: string, size: number, type: string}> }, context: any) => {
    console.log(`🔒 Analyzing security vulnerabilities...`);
    
    const vulnerabilities: SecurityVulnerability[] = [];
    let processed = 0;
    
    for (const file of input.files) {
      try {
        const content = await readFile(file.path, 'utf-8');
        const lines = content.split('\n');
        
        // Real security pattern detection
        lines.forEach((line, index) => {
          const lineNum = index + 1;
          
          // SQL Injection patterns
          if (/query\s*\+\s*['"]|exec\s*\(.*\+.*\)|SELECT.*\+/.test(line)) {
            vulnerabilities.push({
              type: 'sql_injection',
              severity: 'critical',
              file: file.path,
              line: lineNum,
              description: 'Potential SQL injection via string concatenation',
              recommendation: 'Use parameterized queries or prepared statements'
            });
          }
          
          // XSS patterns
          if (/innerHTML\s*=.*\+|document\.write\s*\(.*\+/.test(line)) {
            vulnerabilities.push({
              type: 'xss',
              severity: 'high',
              file: file.path,
              line: lineNum,
              description: 'Potential XSS vulnerability in DOM manipulation',
              recommendation: 'Use textContent, sanitize input, or use safe templating'
            });
          }
          
          // Path traversal
          if (/readFile\s*\(.*\+|path\.join\s*\(.*req\./.test(line)) {
            vulnerabilities.push({
              type: 'path_traversal',
              severity: 'high',
              file: file.path,
              line: lineNum,
              description: 'Potential path traversal vulnerability',
              recommendation: 'Validate and sanitize file paths, use path.resolve()'
            });
          }
          
          // Hardcoded secrets
          if (/api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]|password['"]?\s*[:=]\s*['"][^'"]{6,}['"]/.test(line)) {
            vulnerabilities.push({
              type: 'hardcoded_secret',
              severity: 'critical',
              file: file.path,
              line: lineNum,
              description: 'Hardcoded API key or password detected',
              recommendation: 'Move secrets to environment variables or secure vault'
            });
          }
          
          // Insecure crypto
          if (/md5|sha1|DES|RC4/.test(line)) {
            vulnerabilities.push({
              type: 'insecure_crypto',
              severity: 'medium',
              file: file.path,
              line: lineNum,
              description: 'Use of insecure cryptographic algorithm',
              recommendation: 'Use SHA-256 or stronger, AES encryption'
            });
          }
        });
        
        processed++;
        if (processed % 50 === 0) {
          console.log(`  Progress: ${processed}/${input.files.length} files analyzed`);
        }
        
      } catch (error) {
        console.warn(`Failed to analyze ${file.path}:`, error);
      }
    }
    
    console.log(`✅ Found ${vulnerabilities.length} security issues`);
    return { vulnerabilities };
  },
  { migratable: true, checkpoint: true }
);

// Step 3: Code Quality Analysis
const qualityAnalysisTask = createDistributedTask(
  'analysis.quality',
  async (input: { files: Array<{path: string, size: number, type: string}> }, context: any) => {
    console.log(`📊 Analyzing code quality...`);
    
    const qualityIssues: QualityIssue[] = [];
    let processed = 0;
    
    for (const file of input.files) {
      try {
        const content = await readFile(file.path, 'utf-8');
        const lines = content.split('\n');
        
        // Complexity analysis
        let cyclomaticComplexity = 1;
        let functionLength = 0;
        let inFunction = false;
        let currentFunction = '';
        
        lines.forEach((line, index) => {
          const lineNum = index + 1;
          const trimmed = line.trim();
          
          // Function detection
          const funcMatch = trimmed.match(/function\s+(\w+)|(\w+)\s*[:=]\s*\([^)]*\)\s*=>|class\s+(\w+)/);
          if (funcMatch) {
            inFunction = true;
            currentFunction = funcMatch[1] || funcMatch[2] || funcMatch[3] || 'anonymous';
            functionLength = 0;
            cyclomaticComplexity = 1;
          }
          
          if (inFunction) {
            functionLength++;
            
            // Complexity indicators
            if (/\b(if|while|for|switch|catch)\b/.test(trimmed)) {
              cyclomaticComplexity++;
            }
            
            // End of function
            if (trimmed === '}' && functionLength > 1) {
              if (cyclomaticComplexity > 10) {
                qualityIssues.push({
                  type: 'complexity',
                  severity: 'high',
                  file: file.path,
                  line: lineNum - functionLength,
                  description: `Function '${currentFunction}' has high cyclomatic complexity (${cyclomaticComplexity})`,
                  suggestion: 'Break down into smaller functions, reduce nesting'
                });
              }
              
              if (functionLength > 50) {
                qualityIssues.push({
                  type: 'maintainability',
                  severity: 'medium',
                  file: file.path,
                  line: lineNum - functionLength,
                  description: `Function '${currentFunction}' is too long (${functionLength} lines)`,
                  suggestion: 'Split into smaller, focused functions'
                });
              }
              
              inFunction = false;
            }
          }
          
          // Naming conventions
          if (/var\s+[A-Z]|let\s+[A-Z]|const\s+[A-Z][a-z]/.test(trimmed)) {
            qualityIssues.push({
              type: 'naming',
              severity: 'low',
              file: file.path,
              line: lineNum,
              description: 'Variable should use camelCase naming',
              suggestion: 'Follow consistent naming conventions'
            });
          }
          
          // Missing documentation
          if (funcMatch && !lines[Math.max(0, index - 1)].includes('/**')) {
            qualityIssues.push({
              type: 'documentation',
              severity: 'low',
              file: file.path,
              line: lineNum,
              description: `Function '${currentFunction}' lacks documentation`,
              suggestion: 'Add JSDoc comments for public functions'
            });
          }
        });
        
        processed++;
        if (processed % 50 === 0) {
          console.log(`  Progress: ${processed}/${input.files.length} files analyzed`);
        }
        
      } catch (error) {
        console.warn(`Failed to analyze quality for ${file.path}:`, error);
      }
    }
    
    console.log(`✅ Found ${qualityIssues.length} quality issues`);
    return { qualityIssues };
  },
  { migratable: true, checkpoint: true }
);

// Step 4: Dependency Analysis
const dependencyAnalysisTask = createDistributedTask(
  'analysis.dependencies',
  async (input: { rootPath: string }, context: any) => {
    console.log(`📦 Analyzing dependencies...`);
    
    const dependencyRisks: DependencyRisk[] = [];
    
    try {
      // Analyze package.json if it exists
      const packageJsonPath = join(input.rootPath, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      
      const allDeps = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };
      
      // Known vulnerable patterns (in real implementation, use vulnerability database)
      const riskPatterns = {
        'lodash': { maxSafeVersion: '4.17.21', issues: ['Prototype pollution'] },
        'axios': { maxSafeVersion: '0.28.0', issues: ['SSRF vulnerabilities'] },
        'express': { maxSafeVersion: '4.18.0', issues: ['DoS vulnerabilities'] },
        'moment': { maxSafeVersion: null, issues: ['Deprecated, use date-fns'] }
      };
      
      for (const [pkg, version] of Object.entries(allDeps)) {
        const versionStr = version as string;
        
        if (riskPatterns[pkg as keyof typeof riskPatterns]) {
          const risk = riskPatterns[pkg as keyof typeof riskPatterns];
          let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
          
          if (!risk.maxSafeVersion) {
            riskLevel = 'high';
          } else {
            // Simplified version comparison
            const currentVersion = versionStr.replace(/[^0-9.]/g, '');
            if (currentVersion < risk.maxSafeVersion) {
              riskLevel = 'medium';
            }
          }
          
          dependencyRisks.push({
            package: pkg,
            version: versionStr,
            riskLevel,
            issues: risk.issues,
            recommendation: risk.maxSafeVersion 
              ? `Update to ${risk.maxSafeVersion} or later`
              : 'Consider migration to alternative package'
          });
        }
      }
      
    } catch (error) {
      console.warn('No package.json found or failed to parse');
    }
    
    console.log(`✅ Found ${dependencyRisks.length} dependency risks`);
    return { dependencyRisks };
  },
  { migratable: true, checkpoint: true }
);

// Step 5: Generate comprehensive report
const generateReportTask = createDistributedTask(
  'analysis.generateReport',
  async (input: {
    files: Array<{path: string, size: number, type: string}>;
    vulnerabilities: SecurityVulnerability[];
    qualityIssues: QualityIssue[];
    dependencyRisks: DependencyRisk[];
    config: CodebaseAnalysisConfig;
  }, context: any) => {
    console.log(`📝 Generating comprehensive report...`);
    
    // Calculate summary metrics
    const totalFiles = input.files.length;
    const totalLoc = input.files.reduce((sum, f) => sum + Math.floor(f.size / 50), 0); // Rough estimate
    
    const result: AnalysisResult = {
      summary: {
        filesAnalyzed: totalFiles,
        linesOfCode: totalLoc,
        securityIssues: input.vulnerabilities.length,
        qualityIssues: input.qualityIssues.length,
        dependencyRisks: input.dependencyRisks.length
      },
      security: input.vulnerabilities,
      quality: input.qualityIssues,
      dependencies: input.dependencyRisks,
      performance: {
        heavyFunctions: [], // Would be populated by actual performance analysis
        memoryLeaks: []
      }
    };
    
    // Generate detailed HTML report
    const htmlReport = generateHtmlReport(result);
    await writeFile(join(input.config.outputDir, 'analysis-report.html'), htmlReport);
    
    // Generate JSON report for programmatic access
    await writeFile(
      join(input.config.outputDir, 'analysis-report.json'),
      JSON.stringify(result, null, 2)
    );
    
    // Generate executive summary
    const summary = generateExecutiveSummary(result);
    await writeFile(join(input.config.outputDir, 'executive-summary.md'), summary);
    
    console.log(`✅ Report generated in ${input.config.outputDir}`);
    return result;
  },
  { migratable: true }
);

// Main pipeline orchestration
export async function runCodebaseAnalysis(config: CodebaseAnalysisConfig): Promise<AnalysisResult> {
  console.log(`🚀 Starting durable codebase analysis for ${config.rootPath}`);
  
  const pipeline = new DistributedPipelineBuilder()
    .addTask('discover', discoverFilesTask, { rootPath: config.rootPath, config })
    .addTask('security', securityAnalysisTask, (ctx) => ({ files: ctx.discover.files }))
    .addTask('quality', qualityAnalysisTask, (ctx) => ({ files: ctx.discover.files }))
    .addTask('dependencies', dependencyAnalysisTask, { rootPath: config.rootPath })
    .addTask('report', generateReportTask, (ctx) => ({
      files: ctx.discover.files,
      vulnerabilities: ctx.security.vulnerabilities,
      qualityIssues: ctx.quality.qualityIssues,
      dependencyRisks: ctx.dependencies.dependencyRisks,
      config
    }))
    .build();
  
  // Execute with fault tolerance - pipeline can resume from any step
  const result = await pipeline.execute({
    maxRetries: 3,
    retryDelay: 5000,
    checkpointInterval: 60000 // Save state every minute
  });
  
  return result.report;
}

function generateHtmlReport(result: AnalysisResult): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>Codebase Analysis Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px 20px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .metric-label { color: #666; }
        .section { margin-bottom: 40px; }
        .issue { border-left: 4px solid #ff6b6b; padding: 10px; margin: 10px 0; background: #fff5f5; }
        .issue.high { border-color: #ff6b6b; }
        .issue.medium { border-color: #ffa726; background: #fff8e1; }
        .issue.low { border-color: #66bb6a; background: #f1f8e9; }
        .critical { border-color: #d32f2f; background: #ffebee; }
        h1, h2 { color: #2c3e50; }
    </style>
</head>
<body>
    <h1>🔍 Codebase Analysis Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">
            <div class="metric-value">${result.summary.filesAnalyzed}</div>
            <div class="metric-label">Files Analyzed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.summary.linesOfCode.toLocaleString()}</div>
            <div class="metric-label">Lines of Code</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.summary.securityIssues}</div>
            <div class="metric-label">Security Issues</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.summary.qualityIssues}</div>
            <div class="metric-label">Quality Issues</div>
        </div>
        <div class="metric">
            <div class="metric-value">${result.summary.dependencyRisks}</div>
            <div class="metric-label">Dependency Risks</div>
        </div>
    </div>
    
    <div class="section">
        <h2>🔒 Security Issues</h2>
        ${result.security.map(issue => `
            <div class="issue ${issue.severity}">
                <strong>${issue.type.replace('_', ' ').toUpperCase()}</strong> - ${issue.severity.toUpperCase()}<br>
                <code>${issue.file}:${issue.line}</code><br>
                ${issue.description}<br>
                <em>Recommendation: ${issue.recommendation}</em>
            </div>
        `).join('')}
    </div>
    
    <div class="section">
        <h2>📊 Quality Issues</h2>
        ${result.quality.map(issue => `
            <div class="issue ${issue.severity}">
                <strong>${issue.type.replace('_', ' ').toUpperCase()}</strong> - ${issue.severity.toUpperCase()}<br>
                <code>${issue.file}${issue.line ? ':' + issue.line : ''}</code><br>
                ${issue.description}<br>
                <em>Suggestion: ${issue.suggestion}</em>
            </div>
        `).join('')}
    </div>
    
    <div class="section">
        <h2>📦 Dependency Risks</h2>
        ${result.dependencies.map(dep => `
            <div class="issue ${dep.riskLevel}">
                <strong>${dep.package}</strong> v${dep.version} - ${dep.riskLevel.toUpperCase()} RISK<br>
                Issues: ${dep.issues.join(', ')}<br>
                <em>Recommendation: ${dep.recommendation}</em>
            </div>
        `).join('')}
    </div>
    
    <footer style="margin-top: 60px; text-align: center; color: #666;">
        Generated by OpenAgent Codebase Analysis Pipeline - ${new Date().toISOString()}
    </footer>
</body>
</html>`;
}

function generateExecutiveSummary(result: AnalysisResult): string {
  const criticalSecurity = result.security.filter(s => s.severity === 'critical').length;
  const highSecurity = result.security.filter(s => s.severity === 'high').length;
  const criticalDeps = result.dependencies.filter(d => d.riskLevel === 'critical').length;
  
  return `# Executive Summary - Codebase Analysis

**Date:** ${new Date().toISOString().split('T')[0]}
**Files Analyzed:** ${result.summary.filesAnalyzed.toLocaleString()}
**Lines of Code:** ${result.summary.linesOfCode.toLocaleString()}

## Key Findings

### 🚨 Critical Issues
- **${criticalSecurity}** critical security vulnerabilities
- **${criticalDeps}** critical dependency risks
- **${highSecurity}** high-severity security issues

### 📊 Code Quality
- **${result.summary.qualityIssues}** quality issues identified
- Focus areas: complexity reduction, documentation, maintainability

### 📦 Dependencies  
- **${result.summary.dependencyRisks}** dependency risks
- Immediate attention needed for critical packages

## Recommendations

### Immediate Action Required
${criticalSecurity > 0 ? `- Address ${criticalSecurity} critical security vulnerabilities` : ''}
${criticalDeps > 0 ? `- Update ${criticalDeps} critical dependencies` : ''}
${highSecurity > 0 ? `- Review ${highSecurity} high-severity security issues` : ''}

### Medium-term Improvements
- Implement automated security scanning in CI/CD
- Establish code review standards for quality
- Set up dependency monitoring alerts

### Long-term Goals
- Reduce technical debt through refactoring
- Improve test coverage and documentation
- Establish security-first development practices

## Next Steps
1. Prioritize critical and high-severity issues
2. Create remediation timeline with owners
3. Implement automated monitoring
4. Schedule regular security reviews

---
*This analysis was generated by OpenAgent's durable pipeline system and can be automatically updated as code changes.*
`;
}

// CLI interface for running the analysis
if (process.argv[2] === 'run') {
  const config: CodebaseAnalysisConfig = {
    rootPath: process.argv[3] || process.cwd(),
    outputDir: process.argv[4] || './analysis-results',
    includeExtensions: ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'],
    excludePaths: ['node_modules', '.git', 'dist', 'build', '.next'],
    maxFileSize: 1024 * 1024 // 1MB
  };
  
  runCodebaseAnalysis(config).then(result => {
    console.log('\n🎉 Analysis completed successfully!');
    console.log(`📊 Summary: ${result.summary.securityIssues} security issues, ${result.summary.qualityIssues} quality issues`);
    console.log(`📁 Reports saved to: ${config.outputDir}`);
  }).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
}