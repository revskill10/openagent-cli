# OpenAgent CLI

> Intelligent agentic coder with GraphRAG engine, MCP integration, and multi-LLM support

## Features

🤖 **Multi-LLM Support**: OpenAI, Anthropic, local LLM Studio integration  
📊 **GraphRAG Engine**: Intelligent codebase understanding and memory  
🔧 **MCP Integration**: Model Context Protocol for tool execution  
⚡ **Streaming Responses**: Real-time AI responses  
🎯 **Multi-format Tool Parsing**: Custom, XML, JSON tool call formats  
🧠 **Dynamic System Prompts**: Auto-discovery of available tools  
📁 **Filesystem Tools**: Read, write, search files and directories  

## Installation

```bash
npm install -g openagent-cli
```

## Quick Start

1. **Initialize configuration**:
```bash
openagent config --init
```

2. **Start the interactive UI**:
```bash
openagent
# or
openagent ui
```

3. **Configure your LLM provider** in `config.json`:
```json
{
  "providers": [
    {
      "name": "local",
      "type": "openai", 
      "baseURL": "http://localhost:1234/v1",
      "apiKey": "lm-studio",
      "defaultModel": "your-model-name"
    }
  ]
}
```

## Configuration

### Example `config.json`

```json
{
  "providers": [
    {
      "name": "openai",
      "type": "openai",
      "apiKey": "your-openai-key",
      "defaultModel": "gpt-4"
    },
    {
      "name": "local",
      "type": "openai",
      "baseURL": "http://localhost:1234/v1", 
      "apiKey": "lm-studio",
      "defaultModel": "deepseek/deepseek-r1-0528-qwen3-8b"
    }
  ],
  "mcpServers": [
    {
      "name": "fs",
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "."]
    }
  ],
  "agents": [
    {
      "id": "assistant",
      "provider": "local",
      "mcpTools": ["fs"],
      "system": "You are an intelligent AI assistant..."
    }
  ]
}
```

## Commands

### Interactive UI (Default)
```bash
openagent            # Start interactive UI
openagent ui         # Same as above
openagent ui -c /path/to/config.json
```

### Codebase Indexing (Coming Soon)
```bash
openagent index /path/to/codebase
openagent index . --languages typescript,python --parallel 4
```

### Query Codebase (Coming Soon)  
```bash
openagent query "how does authentication work?"
openagent query "find all API endpoints" --limit 20
```

### HTTP Server (Coming Soon)
```bash
openagent server --port 3001 --websocket
```

### Configuration Management
```bash
openagent config --init        # Create default config
openagent config --validate    # Validate config file  
openagent config --show        # Show current config
```

## Tool Usage

OpenAgent supports multiple tool call formats:

### Primary Format (Recommended)
```
[TOOL_REQUEST]
{"name": "write_file", "arguments": {"path": "hello.txt", "contents": "Hello World"}}
[END_TOOL_REQUEST]
```

### Alternative Formats
```xml
<tool_call name="read_file" args='{"path": "hello.txt"}'></tool_call>
```

```json
{"tool": "list_directory", "args": {"path": "."}}
```

## Available Tools

### Filesystem Tools
- `write_file` - Create or overwrite files
- `read_file` - Read file contents  
- `list_directory` - List files and folders
- `create_directory` - Create directories
- `move_file` - Move/rename files
- `search_files` - Search for files matching patterns

### Built-in Tools
- `echo` - Echo a message
- `timestamp` - Get current timestamp
- `random` - Generate random numbers
- `math` - Perform calculations

## Development

### Local Development

```bash
# Clone repository  
git clone https://github.com/yourusername/openagent.git
cd openagent

# Install dependencies
npm install

# Start development UI
npm run dev

# Build
npm run build

# Run tests
npm test
```

### Project Structure

```
src/
├── cli.ts              # Command line interface
├── ui.tsx              # Interactive UI component  
├── main.ts             # Core application logic
├── config.ts           # Configuration management
├── providers.ts        # LLM provider integrations
├── mcp.ts              # MCP server management
├── tools/              # Tool system
│   ├── tool-parser.ts  # Multi-format tool parsing
│   ├── tool-executor.ts # Tool execution engine
│   └── system-prompt-builder.ts # Dynamic prompt generation
└── ...
```

## Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Multi-LLM provider support
- [x] MCP server integration  
- [x] Streaming responses
- [x] Multi-format tool parsing
- [x] Dynamic system prompts

### Phase 2: GraphRAG Engine (In Progress)
- [ ] PostgreSQL vector database
- [ ] Codebase indexing system
- [ ] Semantic search capabilities
- [ ] Knowledge graph construction

### Phase 3: Advanced Features (Planned)
- [ ] HTTP streaming MCP server
- [ ] Code pattern learning
- [ ] Automated refactoring suggestions
- [ ] Multi-repository support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 🐛 [Report Issues](https://github.com/yourusername/openagent/issues)
- 💬 [Discussions](https://github.com/yourusername/openagent/discussions)
- 📖 [Documentation](https://github.com/yourusername/openagent#readme)

---

**Made with ❤️ by the OpenAgent community**