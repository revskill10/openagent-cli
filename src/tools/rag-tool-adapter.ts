import { WebRAGTool } from './web-rag-tool.js';

export interface RAGToolConfig {
  name: string;
  description: string;
  inputSchema: any;
  execute: (args: any) => Promise<string>;
}

export function createRAGTool(url: string): RAGToolConfig {
  const ragTool = new WebRAGTool({ url });
  
  return {
    name: 'web_rag_search',
    description: 'Search and retrieve information from web documentation using RAG (Retrieval Augmented Generation)',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the documentation or web page to search'
        },
        query: {
          type: 'string',
          description: 'The specific question or query to answer using the documentation'
        }
      },
      required: ['url', 'query']
    },
    execute: async (args: { url: string; query: string }) => {
      try {
        // Create a new instance with the provided URL
        const tool = new WebRAGTool({ url: args.url });
        
        // Execute the tool with the query
        const result = await tool._call({ query: args.query });
        
        return result;
      } catch (error) {
        console.error('Error executing RAG tool:', error);
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

// Export a singleton instance for the default RAG tool
export const ragTool = createRAGTool('https://react.dev');

// Function to create RAG tool with custom URL
export function createCustomRAGTool(url: string) {
  return createRAGTool(url);
}