// docker-tools.ts - Docker-specific tools for OpenAgent
import { ToolFunction } from './function-executor.js';
import { shellTools, ShellToolOptions } from '../shell-execution/shell-tools.js';

export interface DockerToolOptions {
  safetyLevel?: 'strict' | 'moderate' | 'permissive';
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
  enableLearning?: boolean;
}

// Execute Docker command with enhanced safety and validation
export const executeDockerCommand: ToolFunction = async (args: any) => {
  const { command, options = {} } = args;
  
  if (!command || typeof command !== 'string') {
    return {
      success: false,
      error: 'Command parameter is required and must be a string',
      data: null
    };
  }

  // Validate that it's actually a Docker command
  if (!command.trim().startsWith('docker')) {
    return {
      success: false,
      error: 'Command must start with "docker"',
      data: null
    };
  }

  // Enhanced shell options for Docker commands
  const shellOptions: ShellToolOptions = {
    safetyLevel: options.safetyLevel || 'moderate',
    enableLearning: options.enableLearning !== false,
    enableTemplates: true,
    enableOptimization: true,
    confidenceThreshold: 0.7,
    dryRun: options.dryRun || false,
    workingDirectory: options.workingDirectory,
    environment: {
      ...process.env,
      ...options.environment,
      // Ensure Docker environment variables are available
      DOCKER_HOST: process.env.DOCKER_HOST || '',
      DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY || '',
      DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH || ''
    }
  };

  try {
    const result = await shellTools.executeShellCommand(command, shellOptions);
    
    return {
      success: result.success,
      data: result.data,
      output: result.output,
      error: result.error,
      executionTime: result.executionTime,
      metadata: {
        toolType: 'docker',
        command: command,
        dockerSpecific: true
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Docker command execution failed: ${error instanceof Error ? error.message : String(error)}`,
      data: null
    };
  }
};

// Build Docker image from Dockerfile
export const buildDockerImage: ToolFunction = async (args: any) => {
  const { imageName, dockerfilePath = '.', buildArgs = {}, options = {} } = args;
  
  if (!imageName || typeof imageName !== 'string') {
    return {
      success: false,
      error: 'imageName parameter is required and must be a string',
      data: null
    };
  }

  // Construct Docker build command
  let command = `docker build -t ${imageName}`;
  
  // Add build arguments
  for (const [key, value] of Object.entries(buildArgs)) {
    command += ` --build-arg ${key}=${value}`;
  }
  
  // Add additional options
  if (options.noCache) {
    command += ' --no-cache';
  }
  
  if (options.pull) {
    command += ' --pull';
  }
  
  command += ` ${dockerfilePath}`;

  return executeDockerCommand({ command, options });
};

// Run Docker container
export const runDockerContainer: ToolFunction = async (args: any) => {
  const { 
    imageName, 
    containerName,
    ports = [],
    volumes = [],
    environment = {},
    detached = false,
    interactive = false,
    removeOnExit = false,
    options = {}
  } = args;
  
  if (!imageName || typeof imageName !== 'string') {
    return {
      success: false,
      error: 'imageName parameter is required and must be a string',
      data: null
    };
  }

  // Construct Docker run command
  let command = 'docker run';
  
  if (detached) command += ' -d';
  if (interactive) command += ' -it';
  if (removeOnExit) command += ' --rm';
  if (containerName) command += ` --name ${containerName}`;
  
  // Add port mappings
  for (const port of ports) {
    if (typeof port === 'string') {
      command += ` -p ${port}`;
    } else if (port.host && port.container) {
      command += ` -p ${port.host}:${port.container}`;
    }
  }
  
  // Add volume mounts
  for (const volume of volumes) {
    if (typeof volume === 'string') {
      command += ` -v ${volume}`;
    } else if (volume.host && volume.container) {
      command += ` -v ${volume.host}:${volume.container}`;
      if (volume.readonly) command += ':ro';
    }
  }
  
  // Add environment variables
  for (const [key, value] of Object.entries(environment)) {
    command += ` -e ${key}=${value}`;
  }
  
  command += ` ${imageName}`;
  
  // Add command to run inside container
  if (args.cmd) {
    command += ` ${args.cmd}`;
  }

  return executeDockerCommand({ command, options });
};

// List Docker containers
export const listDockerContainers: ToolFunction = async (args: any) => {
  const { all = false, format, options = {} } = args;
  
  let command = 'docker ps';
  if (all) command += ' -a';
  if (format) command += ` --format "${format}"`;

  return executeDockerCommand({ command, options });
};

// List Docker images
export const listDockerImages: ToolFunction = async (args: any) => {
  const { all = false, format, options = {} } = args;
  
  let command = 'docker images';
  if (all) command += ' -a';
  if (format) command += ` --format "${format}"`;

  return executeDockerCommand({ command, options });
};

// Stop Docker container
export const stopDockerContainer: ToolFunction = async (args: any) => {
  const { containerName, timeout, options = {} } = args;
  
  if (!containerName || typeof containerName !== 'string') {
    return {
      success: false,
      error: 'containerName parameter is required and must be a string',
      data: null
    };
  }

  let command = `docker stop`;
  if (timeout) command += ` -t ${timeout}`;
  command += ` ${containerName}`;

  return executeDockerCommand({ command, options });
};

// Remove Docker container
export const removeDockerContainer: ToolFunction = async (args: any) => {
  const { containerName, force = false, volumes = false, options = {} } = args;
  
  if (!containerName || typeof containerName !== 'string') {
    return {
      success: false,
      error: 'containerName parameter is required and must be a string',
      data: null
    };
  }

  let command = 'docker rm';
  if (force) command += ' -f';
  if (volumes) command += ' -v';
  command += ` ${containerName}`;

  return executeDockerCommand({ command, options });
};

// Docker Compose operations
export const dockerCompose: ToolFunction = async (args: any) => {
  const { action, file, services = [], options = {} } = args;
  
  if (!action || typeof action !== 'string') {
    return {
      success: false,
      error: 'action parameter is required and must be a string',
      data: null
    };
  }

  let command = 'docker-compose';
  if (file) command += ` -f ${file}`;
  command += ` ${action}`;
  
  if (services.length > 0) {
    command += ` ${services.join(' ')}`;
  }
  
  // Add common options
  if (action === 'up' && options.detached) command += ' -d';
  if (action === 'up' && options.build) command += ' --build';
  if (action === 'down' && options.volumes) command += ' -v';

  return executeDockerCommand({ command, options });
};

// Export Docker tools for the unified tool system
export const dockerTools = [
  {
    name: 'execute_docker_command',
    description: 'Execute a Docker command with enhanced safety checks and validation. Supports all Docker CLI commands.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The Docker command to execute (must start with "docker")'
        },
        options: {
          type: 'object',
          properties: {
            safetyLevel: {
              type: 'string',
              enum: ['strict', 'moderate', 'permissive'],
              description: 'Safety level for command execution',
              default: 'moderate'
            },
            workingDirectory: {
              type: 'string',
              description: 'Working directory for command execution'
            },
            environment: {
              type: 'object',
              description: 'Environment variables for command execution'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds',
              default: 60000
            },
            dryRun: {
              type: 'boolean',
              description: 'Perform a dry run without actual execution',
              default: false
            }
          }
        }
      },
      required: ['command']
    },
    fn: executeDockerCommand
  },
  {
    name: 'build_docker_image',
    description: 'Build a Docker image from a Dockerfile with customizable build arguments and options.',
    inputSchema: {
      type: 'object',
      properties: {
        imageName: {
          type: 'string',
          description: 'Name and optionally tag for the Docker image (e.g., "myapp:latest")'
        },
        dockerfilePath: {
          type: 'string',
          description: 'Path to the directory containing Dockerfile',
          default: '.'
        },
        buildArgs: {
          type: 'object',
          description: 'Build arguments to pass to Docker build'
        },
        options: {
          type: 'object',
          properties: {
            noCache: {
              type: 'boolean',
              description: 'Do not use cache when building the image'
            },
            pull: {
              type: 'boolean',
              description: 'Always attempt to pull a newer version of the base image'
            }
          }
        }
      },
      required: ['imageName']
    },
    fn: buildDockerImage
  },
  {
    name: 'run_docker_container',
    description: 'Run a Docker container with comprehensive configuration options including ports, volumes, and environment variables.',
    inputSchema: {
      type: 'object',
      properties: {
        imageName: {
          type: 'string',
          description: 'Docker image name to run'
        },
        containerName: {
          type: 'string',
          description: 'Name for the container'
        },
        ports: {
          type: 'array',
          description: 'Port mappings (e.g., ["8080:80", "3000:3000"])',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  container: { type: 'string' }
                }
              }
            ]
          }
        },
        volumes: {
          type: 'array',
          description: 'Volume mounts',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  container: { type: 'string' },
                  readonly: { type: 'boolean' }
                }
              }
            ]
          }
        },
        environment: {
          type: 'object',
          description: 'Environment variables to set in the container'
        },
        detached: {
          type: 'boolean',
          description: 'Run container in detached mode',
          default: false
        },
        interactive: {
          type: 'boolean',
          description: 'Run container in interactive mode',
          default: false
        },
        removeOnExit: {
          type: 'boolean',
          description: 'Automatically remove container when it exits',
          default: false
        },
        cmd: {
          type: 'string',
          description: 'Command to run inside the container'
        }
      },
      required: ['imageName']
    },
    fn: runDockerContainer
  },
  {
    name: 'list_docker_containers',
    description: 'List Docker containers with optional formatting and filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Show all containers (default shows just running)',
          default: false
        },
        format: {
          type: 'string',
          description: 'Format output using Go template'
        }
      }
    },
    fn: listDockerContainers
  },
  {
    name: 'list_docker_images',
    description: 'List Docker images with optional formatting.',
    inputSchema: {
      type: 'object',
      properties: {
        all: {
          type: 'boolean',
          description: 'Show all images (default hides intermediate images)',
          default: false
        },
        format: {
          type: 'string',
          description: 'Format output using Go template'
        }
      }
    },
    fn: listDockerImages
  },
  {
    name: 'docker_compose',
    description: 'Execute Docker Compose commands for multi-container applications.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Docker Compose action (up, down, build, logs, etc.)',
          enum: ['up', 'down', 'build', 'logs', 'ps', 'pull', 'restart', 'stop', 'start']
        },
        file: {
          type: 'string',
          description: 'Path to docker-compose.yml file'
        },
        services: {
          type: 'array',
          description: 'Specific services to target',
          items: { type: 'string' }
        },
        options: {
          type: 'object',
          properties: {
            detached: {
              type: 'boolean',
              description: 'Run in detached mode (for up command)'
            },
            build: {
              type: 'boolean',
              description: 'Build images before starting (for up command)'
            },
            volumes: {
              type: 'boolean',
              description: 'Remove volumes (for down command)'
            }
          }
        }
      },
      required: ['action']
    },
    fn: dockerCompose
  }
];
