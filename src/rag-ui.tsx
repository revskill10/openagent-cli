#!/usr/bin/env node
import React, { useEffect, useState } from "react";
import { render, Text, Box, Static, Newline, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { run } from "@bluelibs/runner";
import { sharedLogs, logEmitter, Log } from "./shared.js";
import { createRAGTool } from "./tools/rag-tool-adapter.js";

const RAG_UI: React.FC = () => {
  const [logs, setLogs] = React.useState<Log[]>(sharedLogs);
  const [question, setQuestion] = useState("");
  const [url, setUrl] = useState("https://react.dev");
  const [isWaiting, setIsWaiting] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [mode, setMode] = useState<'chat' | 'rag'>('chat');

  const predefinedUrls = [
    { label: "React Documentation", value: "https://react.dev" },
    { label: "TypeScript Handbook", value: "https://www.typescriptlang.org/docs/" },
    { label: "Node.js Docs", value: "https://nodejs.org/docs/latest/api/" },
    { label: "Python Docs", value: "https://docs.python.org/3/" },
    { label: "Custom URL", value: "custom" }
  ];

  useEffect(() => {
    const handleNewLog = (log: Log) => {
      setLogs((prev) => [...prev, log]);
      if (log.type === "done") {
        setIsWaiting(false);
      }
    };

    logEmitter.on("newLog", handleNewLog);

    return () => {
      logEmitter.off("newLog", handleNewLog);
    };
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === 'r') {
      setMode('rag');
      setShowUrlInput(true);
    }
    if (key.ctrl && input === 'c') {
      setMode('chat');
      setShowUrlInput(false);
    }
  });

  const handleRAGQuery = async (selectedUrl: string, query: string) => {
    if (!query.trim() || isWaiting) return;
    
    setIsWaiting(true);
    
    // Add user question to logs
    const userLog: Log = {
      agentId: "user",
      text: `Query: "${query}" from ${selectedUrl}`,
      type: "question",
    };
    setLogs((prev) => [...prev, userLog]);
    
    try {
      const ragTool = createRAGTool(selectedUrl);
      const result = await ragTool.execute({ url: selectedUrl, query });
      
      const responseLog: Log = {
        agentId: "rag-assistant",
        text: result,
        type: "done",
      };
      setLogs((prev) => [...prev, responseLog]);
    } catch (error) {
      const errorLog: Log = {
        agentId: "rag-assistant",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        type: "done",
      };
      setLogs((prev) => [...prev, errorLog]);
    }
    
    setIsWaiting(false);
  };

  const handleSubmit = async (value: string) => {
    if (mode === 'rag') {
      await handleRAGQuery(url, value);
    } else {
      // Regular chat mode - would integrate with existing agent system
      const userLog: Log = {
        agentId: "user",
        text: value,
        type: "question",
      };
      setLogs((prev) => [...prev, userLog]);
      
      const mockResponse: Log = {
        agentId: "assistant",
        text: `This is a mock response for: "${value}". Press Ctrl+R to switch to RAG mode!`,
        type: "done",
      };
      setLogs((prev) => [...prev, mockResponse]);
    }
    
    setQuestion("");
  };

  const handleUrlSelect = (item: { label: string; value: string }) => {
    if (item.value === "custom") {
      setShowUrlInput(true);
    } else {
      setUrl(item.value);
      setShowUrlInput(false);
    }
  };

  return (
    <>
      <Box flexDirection="column">
        <Box>
          <Text color="cyan">🤖 OpenAgent RAG Interface</Text>
        </Box>
        <Box>
          <Text color="gray">Mode: {mode === 'rag' ? 'RAG' : 'Chat'} </Text>
          <Text color="gray">| Ctrl+R: RAG Mode | Ctrl+C: Chat Mode</Text>
        </Box>
        {mode === 'rag' && (
          <Box>
            <Text color="yellow">URL: {url}</Text>
          </Box>
        )}
        <Newline />
      </Box>

      <Static items={logs}>
        {(log) => (
          <Text key={`${log.agentId}-${log.text.slice(0, 20)}-${Date.now()}`}>
            <Text color={log.agentId === "user" ? "green" : "cyan"}>
              [{log.agentId}]
            </Text>{" "}
            {log.text}
            <Newline />
          </Text>
        )}
      </Static>

      <Box marginTop={1} flexDirection="column">
        {isWaiting ? (
          <Text>
            <Spinner type="dots" /> AI is thinking...
          </Text>
        ) : (
          <>
            {mode === 'rag' && showUrlInput && (
              <Box flexDirection="column">
                <Text>Select documentation source:</Text>
                <SelectInput
                  items={predefinedUrls}
                  onSelect={handleUrlSelect}
                />
                {url === "custom" && (
                  <Box>
                    <Text>Enter URL: </Text>
                    <TextInput
                      value={url}
                      onChange={setUrl}
                      onSubmit={() => setShowUrlInput(false)}
                      placeholder="https://example.com/docs"
                    />
                  </Box>
                )}
              </Box>
            )}
            
            {!showUrlInput && (
              <Box>
                <Text>
                  {mode === 'rag' ? 'Ask about docs: ' : 'Ask a question: '}
                </Text>
                <TextInput
                  value={question}
                  onChange={setQuestion}
                  onSubmit={handleSubmit}
                  placeholder={
                    mode === 'rag' 
                      ? "What is React?" 
                      : "Type your question and press Enter..."
                  }
                />
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
};

// Export for direct execution
export default RAG_UI;

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  render(<RAG_UI />);
}