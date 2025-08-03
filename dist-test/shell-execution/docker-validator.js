export class DockerValidator {
    // Dangerous Docker operations that require extra caution
    static DANGEROUS_OPERATIONS = [
        'docker system prune',
        'docker container prune',
        'docker image prune',
        'docker volume prune',
        'docker network prune',
        'docker rm -f',
        'docker rmi -f',
        '--privileged',
        '--cap-add=ALL',
        '--security-opt seccomp=unconfined',
        '--pid=host',
        '--network=host',
        '--ipc=host',
        '--uts=host'
    ];
    // Potentially risky volume mounts
    static RISKY_MOUNTS = [
        '/var/run/docker.sock',
        '/proc',
        '/sys',
        '/dev',
        '/etc',
        '/root',
        '/home',
        '/',
        '/usr',
        '/var'
    ];
    // Commands that require network access
    static NETWORK_COMMANDS = [
        'docker pull',
        'docker push',
        'docker login',
        'docker search'
    ];
    static validateDockerCommand(command) {
        const result = {
            safe: true,
            riskLevel: 'low',
            issues: [],
            suggestions: []
        };
        const lowerCommand = command.toLowerCase().trim();
        // Check for dangerous operations
        for (const dangerous of this.DANGEROUS_OPERATIONS) {
            if (lowerCommand.includes(dangerous.toLowerCase())) {
                result.issues.push({
                    type: 'security',
                    message: `Potentially dangerous operation detected: ${dangerous}`,
                    severity: dangerous.includes('prune') || dangerous.includes('-f') ? 'critical' : 'warning'
                });
                result.riskLevel = 'high';
                result.suggestions.push(`Consider using safer alternatives or add confirmation for: ${dangerous}`);
            }
        }
        // Check for risky volume mounts
        if (lowerCommand.includes('-v ') || lowerCommand.includes('--volume')) {
            for (const riskyMount of this.RISKY_MOUNTS) {
                if (lowerCommand.includes(riskyMount)) {
                    result.issues.push({
                        type: 'security',
                        message: `Risky volume mount detected: ${riskyMount}`,
                        severity: riskyMount === '/' || riskyMount === '/var/run/docker.sock' ? 'critical' : 'warning'
                    });
                    result.riskLevel = 'high';
                    result.suggestions.push(`Mounting ${riskyMount} can be dangerous. Consider more specific paths.`);
                }
            }
        }
        // Check for privileged mode
        if (lowerCommand.includes('--privileged')) {
            result.issues.push({
                type: 'security',
                message: 'Privileged mode detected - container will have full access to host',
                severity: 'critical'
            });
            result.riskLevel = 'critical';
            result.suggestions.push('Avoid privileged mode unless absolutely necessary. Use specific capabilities instead.');
        }
        // Check for host network mode
        if (lowerCommand.includes('--network=host') || lowerCommand.includes('--net=host')) {
            result.issues.push({
                type: 'security',
                message: 'Host network mode detected - container will share host network stack',
                severity: 'warning'
            });
            result.riskLevel = 'medium';
            result.suggestions.push('Consider using bridge networking with specific port mappings instead.');
        }
        // Check for network commands
        for (const netCmd of this.NETWORK_COMMANDS) {
            if (lowerCommand.includes(netCmd)) {
                result.issues.push({
                    type: 'performance',
                    message: `Network operation detected: ${netCmd}`,
                    severity: 'info'
                });
                result.suggestions.push('Network operations may take time and require internet connectivity.');
                break;
            }
        }
        // Check for missing image tags
        if (lowerCommand.includes('docker run') || lowerCommand.includes('docker pull')) {
            const imagePattern = /(?:docker\s+(?:run|pull)\s+[^\s]*\s+)([^\s:]+)(?:\s|$)/;
            const match = command.match(imagePattern);
            if (match && !match[1].includes(':')) {
                result.issues.push({
                    type: 'warning',
                    message: 'Image without explicit tag detected - will use "latest" tag',
                    severity: 'warning'
                });
                result.suggestions.push('Consider specifying explicit image tags for reproducibility.');
            }
        }
        // Check for resource limits
        if (lowerCommand.includes('docker run') &&
            !lowerCommand.includes('--memory') &&
            !lowerCommand.includes('-m ')) {
            result.issues.push({
                type: 'performance',
                message: 'No memory limit specified for container',
                severity: 'info'
            });
            result.suggestions.push('Consider adding memory limits to prevent resource exhaustion.');
        }
        // Check for interactive mode without TTY
        if (lowerCommand.includes('-i ') && !lowerCommand.includes('-t')) {
            result.issues.push({
                type: 'syntax',
                message: 'Interactive mode without TTY may cause issues',
                severity: 'warning'
            });
            result.suggestions.push('Consider using -it together for interactive containers.');
        }
        // Determine overall safety
        const criticalIssues = result.issues.filter(i => i.severity === 'critical');
        const errorIssues = result.issues.filter(i => i.severity === 'error');
        if (criticalIssues.length > 0) {
            result.safe = false;
            result.riskLevel = 'critical';
        }
        else if (errorIssues.length > 0) {
            result.safe = false;
            result.riskLevel = 'high';
        }
        else if (result.issues.length > 0) {
            result.riskLevel = 'medium';
        }
        return result;
    }
    // Check if Docker is available on the system
    static async checkDockerAvailability() {
        try {
            const { spawn } = await import('child_process');
            return new Promise((resolve) => {
                const docker = spawn('docker', ['--version']);
                let output = '';
                let error = '';
                docker.stdout?.on('data', (data) => {
                    output += data.toString();
                });
                docker.stderr?.on('data', (data) => {
                    error += data.toString();
                });
                docker.on('close', (code) => {
                    if (code === 0) {
                        const versionMatch = output.match(/Docker version ([^\s,]+)/);
                        resolve({
                            available: true,
                            version: versionMatch ? versionMatch[1] : 'unknown'
                        });
                    }
                    else {
                        resolve({
                            available: false,
                            error: error || 'Docker command failed'
                        });
                    }
                });
                docker.on('error', (err) => {
                    resolve({
                        available: false,
                        error: err.message
                    });
                });
            });
        }
        catch (error) {
            return {
                available: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    // Generate safe Docker command suggestions
    static generateSafeAlternatives(command) {
        const alternatives = [];
        const lowerCommand = command.toLowerCase();
        // Suggest safer alternatives for dangerous operations
        if (lowerCommand.includes('docker system prune')) {
            alternatives.push('docker container prune # Remove only stopped containers');
            alternatives.push('docker image prune -f --filter "dangling=true" # Remove only dangling images');
        }
        if (lowerCommand.includes('--privileged')) {
            alternatives.push('# Instead of --privileged, use specific capabilities:');
            alternatives.push('docker run --cap-add=NET_ADMIN --cap-add=SYS_ADMIN ...');
        }
        if (lowerCommand.includes('--network=host')) {
            alternatives.push('# Instead of host networking, use port mapping:');
            alternatives.push('docker run -p 8080:80 ...');
        }
        if (lowerCommand.includes('-v /')) {
            alternatives.push('# Instead of mounting root, use specific directories:');
            alternatives.push('docker run -v /path/to/specific/dir:/container/dir ...');
        }
        return alternatives;
    }
}
export const dockerValidator = new DockerValidator();
