#!/usr/bin/env node
/**
 * CI/CD Integration Example
 * 
 * Real-world usage: Automated code analysis in CI/CD pipelines
 * - GitHub Actions integration
 * - Quality gate decisions
 * - Pull request automation
 * - Build pipeline integration
 */

import { scanDirectory, generateReport } from './security-scanner.js';
import { CodeAssistant } from './code-chat.js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { spawn } from 'child_process';

interface CIContext {
  commit: string;
  branch: string;
  baseBranch: string;
  pullRequestId?: string;
  triggeredBy: string;
}

interface CIResult {
  commit: string;
  branch: string;
  timestamp: Date;
  qualityGate: 'passed' | 'failed';
  analysis: {
    securityIssues: number;
    qualityScore: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
  recommendations: string[];
}

export class CIIntegration {
  private assistant: CodeAssistant;
  
  constructor(private repoPath: string) {
    this.assistant = new CodeAssistant(repoPath);
  }
  
  async runPipelineAnalysis(context: CIContext): Promise<CIResult> {
    console.log(`🔄 CI Analysis started for ${context.branch}:${context.commit.substring(0, 8)}`);
    
    try {
      // Initialize AI assistant
      await this.assistant.initialize();
      
      // Step 1: Security Analysis
      console.log('🔒 Running security analysis...');
      const securityResult = await scanDirectory(this.repoPath);
      
      // Step 2: Get changed files for focused analysis
      const changedFiles = await this.getChangedFiles(context);
      console.log(`📝 Analyzing ${changedFiles.length} changed files`);
      
      // Step 3: Quality assessment
      const qualityScore = await this.assessCodeQuality(changedFiles);
      
      // Step 4: Risk level calculation
      const riskLevel = this.calculateRiskLevel(securityResult, changedFiles);
      
      // Step 5: Generate recommendations
      const recommendations = await this.generateRecommendations(
        securityResult, 
        changedFiles, 
        riskLevel
      );
      
      // Step 6: Quality gate decision
      const qualityGate = this.evaluateQualityGate(securityResult, qualityScore, riskLevel);
      
      const result: CIResult = {
        commit: context.commit,
        branch: context.branch,
        timestamp: new Date(),
        qualityGate,
        analysis: {
          securityIssues: securityResult.issuesFound.length,
          qualityScore,
          riskLevel
        },
        recommendations
      };
      
      // Generate CI report
      await this.generateCIReport(result);
      
      // Post to PR if available
      if (context.pullRequestId) {
        await this.postToPullRequest(context.pullRequestId, result);
      }
      
      console.log(`✅ CI Analysis completed: ${result.qualityGate}`);
      return result;
      
    } catch (error) {
      console.error('❌ CI Analysis failed:', error);
      throw error;
    }
  }
  
  private async getChangedFiles(context: CIContext): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const git = spawn('git', [
        'diff', 
        '--name-only', 
        `${context.baseBranch}...${context.commit}`
      ], {
        cwd: this.repoPath
      });
      
      let output = '';
      git.stdout.on('data', (data) => output += data.toString());
      git.stderr.on('data', (data) => console.warn('Git warning:', data.toString()));
      
      git.on('close', (code) => {
        if (code === 0) {
          const files = output.trim().split('\n').filter(Boolean);
          resolve(files);
        } else {
          // Fallback: analyze recent files
          console.warn('Git diff failed, analyzing recent files');
          resolve([]);
        }
      });
    });
  }
  
  private async assessCodeQuality(files: string[]): Promise<number> {
    let totalScore = 0;
    let filesAnalyzed = 0;
    
    for (const file of files.slice(0, 10)) { // Limit for performance
      try {
        const filePath = join(this.repoPath, file);
        const content = await readFile(filePath, 'utf-8');
        
        // Simple quality metrics
        let score = 100;
        const lines = content.split('\n');
        
        // Check for complexity indicators
        const complexityCount = (content.match(/if|while|for|switch/g) || []).length;
        if (complexityCount > lines.length * 0.1) score -= 20;
        
        // Check for documentation
        const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('*')).length;
        if (commentLines < lines.length * 0.05) score -= 10;
        
        // Check for long functions
        const longFunctions = (content.match(/function[\s\S]{500,}?}/g) || []).length;
        if (longFunctions > 0) score -= 15;
        
        // Check for TODO/FIXME
        const todos = (content.match(/TODO|FIXME|XXX/g) || []).length;
        score -= todos * 5;
        
        totalScore += Math.max(0, score);
        filesAnalyzed++;
        
      } catch (error) {
        console.warn(`Failed to analyze ${file}:`, error);
      }
    }
    
    return filesAnalyzed > 0 ? Math.round(totalScore / filesAnalyzed) : 75;
  }
  
  private calculateRiskLevel(securityResult: any, changedFiles: string[]): 'low' | 'medium' | 'high' {
    // High risk indicators
    const criticalSecurity = securityResult.summary.critical > 0;
    const highSecurity = securityResult.summary.high > 2;
    const manyFiles = changedFiles.length > 20;
    const criticalFiles = changedFiles.some(f => 
      f.includes('package.json') || 
      f.includes('Dockerfile') || 
      f.includes('.env') ||
      f.includes('security') ||
      f.includes('auth')
    );
    
    if (criticalSecurity || (highSecurity && criticalFiles)) {
      return 'high';
    } else if (highSecurity || manyFiles || criticalFiles) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  private async generateRecommendations(
    securityResult: any, 
    changedFiles: string[], 
    riskLevel: string
  ): Promise<string[]> {
    const recommendations = [];
    
    // Security recommendations
    if (securityResult.summary.critical > 0) {
      recommendations.push(`Fix ${securityResult.summary.critical} critical security issues before deployment`);
    }
    
    if (securityResult.summary.high > 0) {
      recommendations.push(`Address ${securityResult.summary.high} high-severity security issues`);
    }
    
    // File-based recommendations
    if (changedFiles.length > 15) {
      recommendations.push('Large changeset detected - consider breaking into smaller PRs');
    }
    
    const testFiles = changedFiles.filter(f => f.includes('.test.') || f.includes('.spec.')).length;
    const sourceFiles = changedFiles.filter(f => !f.includes('.test.') && !f.includes('.spec.')).length;
    
    if (sourceFiles > testFiles * 2) {
      recommendations.push('Consider adding more test coverage for modified code');
    }
    
    // Risk-based recommendations
    if (riskLevel === 'high') {
      recommendations.push('High-risk changes detected - require additional review');
      recommendations.push('Run comprehensive integration tests');
    } else if (riskLevel === 'medium') {
      recommendations.push('Medium risk changes - verify functionality in staging environment');
    }
    
    return recommendations;
  }
  
  private evaluateQualityGate(
    securityResult: any, 
    qualityScore: number, 
    riskLevel: string
  ): 'passed' | 'failed' {
    // Fail conditions
    if (securityResult.summary.critical > 0) return 'failed';
    if (qualityScore < 60) return 'failed';
    if (riskLevel === 'high' && securityResult.summary.high > 0) return 'failed';
    
    return 'passed';
  }
  
  private async generateCIReport(result: CIResult): Promise<void> {
    const reportPath = join(this.repoPath, '.ci-report.md');
    
    const report = `# CI/CD Analysis Report

**Commit:** ${result.commit}
**Branch:** ${result.branch}
**Status:** ${result.qualityGate.toUpperCase()}
**Timestamp:** ${result.timestamp.toISOString()}

## Analysis Summary

- **Security Issues:** ${result.analysis.securityIssues}
- **Quality Score:** ${result.analysis.qualityScore}/100
- **Risk Level:** ${result.analysis.riskLevel.toUpperCase()}

## Quality Gate: ${result.qualityGate.toUpperCase()}

${result.qualityGate === 'failed' ? '❌ **BLOCKED** - Issues must be resolved before deployment' : '✅ **APPROVED** - Ready for deployment'}

## Recommendations

${result.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

${result.qualityGate === 'failed' 
  ? '1. Address critical security issues\n2. Improve code quality\n3. Re-run analysis' 
  : '1. Deploy to staging\n2. Run integration tests\n3. Monitor for issues'
}

---
*Generated by OpenAgent CI/CD Integration*
`;
    
    await writeFile(reportPath, report);
    console.log(`📄 CI report saved to ${reportPath}`);
  }
  
  private async postToPullRequest(prId: string, result: CIResult): Promise<void> {
    // In real implementation, this would use GitHub/GitLab API
    console.log(`📝 Posted analysis results to PR #${prId}`);
    
    const comment = `## 🤖 OpenAgent Analysis Results

**Quality Gate:** ${result.qualityGate === 'passed' ? '✅ PASSED' : '❌ FAILED'}

**Summary:**
- Security Issues: ${result.analysis.securityIssues}
- Quality Score: ${result.analysis.qualityScore}/100
- Risk Level: ${result.analysis.riskLevel}

${result.recommendations.length > 0 ? `**Recommendations:**\n${result.recommendations.map(r => `- ${r}`).join('\n')}` : ''}

${result.qualityGate === 'failed' ? '\n⚠️ **Action Required:** Please address the issues above before merging.' : '\n🎉 **Ready to merge!** All quality checks passed.'}
`;
    
    // Save comment to file for external script to post
    await writeFile(join(this.repoPath, '.pr-comment.md'), comment);
  }
}

// GitHub Actions integration
export function setupGitHubAction(): void {
  const actionYml = `name: OpenAgent Analysis
on: [push, pull_request]

jobs:
  analysis:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    - run: npm install
    - name: Run OpenAgent Analysis
      run: |
        npx tsx examples/ci-integration.ts run
        cat .ci-report.md >> $GITHUB_STEP_SUMMARY
    - name: Comment PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          if (fs.existsSync('.pr-comment.md')) {
            const comment = fs.readFileSync('.pr-comment.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
          }`;
  
  console.log('GitHub Action configuration:');
  console.log(actionYml);
}

// CLI interface
if (process.argv[2] === 'run') {
  const repoPath = process.cwd();
  const integration = new CIIntegration(repoPath);
  
  const context: CIContext = {
    commit: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || 'latest', 
    branch: process.env.GITHUB_REF_NAME || process.env.CI_BRANCH || 'main',
    baseBranch: 'main',
    pullRequestId: process.env.GITHUB_PR_NUMBER || process.env.CI_PR_ID,
    triggeredBy: process.env.GITHUB_ACTOR || process.env.CI_TRIGGERED_BY || 'manual'
  };
  
  integration.runPipelineAnalysis(context).then(result => {
    console.log(`\n🎯 Final Result: ${result.qualityGate}`);
    process.exit(result.qualityGate === 'passed' ? 0 : 1);
  }).catch(error => {
    console.error('Pipeline failed:', error);
    process.exit(1);
  });
}

if (process.argv[2] === 'setup-github') {
  setupGitHubAction();
}

export { CIIntegration };