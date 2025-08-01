# OpenAgent Real-World Examples

This directory contains **production-ready examples** demonstrating how to use OpenAgent for real software development challenges. These are not toy examples - they solve actual problems that development teams face daily.

## 🏗️ Examples Overview

### 1. Durable Codebase Analysis Pipeline
**File**: `durable-codebase-analysis.ts`
**Purpose**: Comprehensive codebase analysis with fault tolerance

**What it does**:
- Scans entire codebases for security vulnerabilities
- Identifies code quality issues and complexity hotspots
- Analyzes dependency risks and outdated packages  
- Generates detailed HTML reports and executive summaries
- **Resumes from failures** - true durable execution

**Real-world use cases**:
- CI/CD security scanning
- Technical debt assessment
- Compliance auditing
- Code review automation

**Run it**:
```bash
npx tsx examples/durable-codebase-analysis.ts run /path/to/codebase ./analysis-output
```

### 2. Context-Aware Code Chat System
**File**: `context-aware-code-chat.ts`
**Purpose**: AI assistant that understands your entire codebase

**What it does**:
- Indexes your codebase using GraphRAG
- Answers questions about architecture and code flow
- Provides refactoring suggestions based on existing patterns
- Helps debug issues with contextual understanding
- Generates code following your project's conventions

**Real-world use cases**:
- Onboarding new developers
- Code exploration and understanding
- Debugging complex issues
- Architecture documentation
- Pattern consistency checking

**Run it**:
```bash
npx tsx examples/context-aware-code-chat.ts start /path/to/codebase

# Interactive session:
👤 You: How does user authentication work in this codebase?
🤖 Based on your codebase, here's how authentication works...

👤 You: Refactor the UserService class to be more maintainable
🤖 Here are refactoring suggestions based on your patterns...
```

### 3. Agentic Coding Workflow
**File**: `agentic-coding-workflow.ts`  
**Purpose**: Multiple AI agents collaborating on complex coding tasks

**What it does**:
- **Architect Agent**: Designs system architecture
- **Developer Agent**: Implements features following best practices
- **Reviewer Agent**: Reviews code for quality and security
- **Tester Agent**: Generates comprehensive tests
- **Optimizer Agent**: Improves performance
- **Documenter Agent**: Creates documentation

**Real-world use cases**:
- Feature development automation
- Code modernization projects
- Technical debt reduction
- Best practices enforcement
- Quality assurance automation

**Run it**:
```bash
npx tsx examples/agentic-coding-workflow.ts run /path/to/codebase

# Agents work together to:
# 1. Design architecture for new feature
# 2. Implement following project patterns  
# 3. Review for security and quality
# 4. Generate comprehensive tests
# 5. Optimize performance
# 6. Create documentation
```

### 4. Production Integration Examples
**File**: `production-integration.ts`
**Purpose**: Integration with real development tools and workflows

**What it includes**:

#### CI/CD Pipeline Integration
- GitHub Actions / GitLab CI integration
- Automated code analysis in build pipelines
- Quality gates and deployment decisions
- Pull request automation

#### IDE Integration  
- VSCode / IntelliJ extension capabilities
- Real-time code suggestions
- Context-aware completions
- Inline quality analysis

#### Legacy Code Migration
- Systematic modernization of large codebases
- Risk assessment and prioritization
- Batch processing with checkpoints
- Progress tracking and reporting

#### Team Productivity Dashboard
- Codebase health metrics
- Development velocity tracking
- Quality trend analysis
- Team insights and recommendations

**Run CI/CD integration**:
```bash
export CI_COMMIT_SHA=abc123
export CI_BRANCH=feature/new-api
export CI_PR_ID=42
npx tsx examples/production-integration.ts ci /path/to/repo
```

## 🚀 Getting Started

### Prerequisites
```bash
npm install
npm run build
```

### Run Examples

1. **Analyze your codebase**:
```bash
# Comprehensive security and quality analysis
npx tsx examples/durable-codebase-analysis.ts run . ./results
open results/analysis-report.html
```

2. **Chat with your codebase**:
```bash
# Interactive AI assistant
npx tsx examples/context-aware-code-chat.ts start .
```

3. **Automated feature development**:
```bash
# Multi-agent coding workflow
npx tsx examples/agentic-coding-workflow.ts run .
```

4. **CI/CD integration**:
```bash
# Pipeline analysis
npx tsx examples/production-integration.ts ci .
```

## 📊 Real Results

### Durable Analysis Pipeline
- **Security**: Finds SQL injection, XSS, path traversal, hardcoded secrets
- **Quality**: Detects complexity, naming issues, missing docs
- **Dependencies**: Identifies vulnerable packages and versions
- **Performance**: Generates actionable reports in minutes

### Code Chat System  
- **Understanding**: Explains complex code relationships
- **Suggestions**: Context-aware refactoring recommendations
- **Debugging**: Helps trace issues through call graphs  
- **Generation**: Creates code following project patterns

### Agentic Workflow
- **Architecture**: Designs clean, scalable solutions
- **Implementation**: Generates production-ready code
- **Quality**: Comprehensive testing and optimization
- **Documentation**: Complete API docs and guides

### Production Integration
- **CI/CD**: Catches issues before production
- **IDE**: Real-time development assistance  
- **Migration**: Systematic legacy modernization
- **Metrics**: Data-driven development insights

## 🔧 Customization

### Configuration
Each example supports configuration through:
- Command line arguments
- Environment variables  
- Configuration files
- Runtime parameters

### Extension Points
- Custom analysis rules
- Additional AI models
- Custom output formats
- Integration hooks

### Scaling
- Parallel processing
- Distributed execution
- Cloud deployment
- Multi-repository support

## 🎯 Production Deployment

### Docker
```dockerfile
FROM node:18
COPY . /app
WORKDIR /app
RUN npm install && npm run build
CMD ["npx", "tsx", "examples/production-integration.ts", "ci", "."]
```

### GitHub Actions
```yaml
name: OpenAgent Analysis
on: [push, pull_request]
jobs:
  analysis:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - uses: actions/setup-node@v2
    - run: npm install
    - run: npx tsx examples/production-integration.ts ci .
```

### GitLab CI
```yaml
openagent_analysis:
  script:
    - npm install
    - npx tsx examples/production-integration.ts ci .
  artifacts:
    reports:
      junit: .ci-analysis/analysis-report.xml
```

## 📚 Learn More

- **Architecture**: See `PLAN.md` for system design
- **API Reference**: See `LIBRARY.md` for detailed API docs
- **Contributing**: See `CONTRIBUTING.md` for development guide

## 🤝 Support

- **Issues**: Report bugs and request features
- **Discussions**: Ask questions and share experiences  
- **Examples**: Submit your own real-world examples
- **Documentation**: Help improve guides and tutorials

---

**These examples demonstrate the true power of OpenAgent**: not just toy demos, but real solutions for real development challenges. Each example is designed to be used in production environments and can be customized for your specific needs.