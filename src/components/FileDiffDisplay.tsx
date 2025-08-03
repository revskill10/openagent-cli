// FileDiffDisplay.tsx - Component for displaying file diffs like Claude Code
import React from 'react';
import { Text, Box, Newline } from 'ink';

interface FileDiffProps {
  filePath: string;
  oldContent?: string;
  newContent: string;
  operation: 'create' | 'modify' | 'delete';
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed' | 'context';
  content: string;
  lineNumber?: number;
  oldLineNumber?: number;
  newLineNumber?: number;
}

const generateDiff = (oldContent: string = '', newContent: string): DiffLine[] => {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: DiffLine[] = [];
  
  // Simple diff algorithm - for production, consider using a proper diff library
  let oldIndex = 0;
  let newIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex];
    const newLine = newLines[newIndex];
    
    if (oldIndex >= oldLines.length) {
      // Only new lines remaining
      diff.push({
        type: 'added',
        content: newLine,
        newLineNumber: newIndex + 1
      });
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // Only old lines remaining
      diff.push({
        type: 'removed',
        content: oldLine,
        oldLineNumber: oldIndex + 1
      });
      oldIndex++;
    } else if (oldLine === newLine) {
      // Lines are the same
      diff.push({
        type: 'unchanged',
        content: oldLine,
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1
      });
      oldIndex++;
      newIndex++;
    } else {
      // Lines are different - mark as removed and added
      diff.push({
        type: 'removed',
        content: oldLine,
        oldLineNumber: oldIndex + 1
      });
      diff.push({
        type: 'added',
        content: newLine,
        newLineNumber: newIndex + 1
      });
      oldIndex++;
      newIndex++;
    }
  }
  
  return diff;
};

const FileDiffDisplay: React.FC<FileDiffProps> = ({ 
  filePath, 
  oldContent, 
  newContent, 
  operation 
}) => {
  const diff = operation === 'create' ? 
    newContent.split('\n').map((line, index) => ({
      type: 'added' as const,
      content: line,
      newLineNumber: index + 1
    })) :
    generateDiff(oldContent || '', newContent);

  const getLinePrefix = (line: DiffLine) => {
    switch (line.type) {
      case 'added':
        return '+ ';
      case 'removed':
        return '- ';
      case 'unchanged':
        return '  ';
      default:
        return '  ';
    }
  };

  const getLineColor = (line: DiffLine) => {
    switch (line.type) {
      case 'added':
        return 'green';
      case 'removed':
        return 'red';
      case 'unchanged':
        return 'gray';
      default:
        return 'white';
    }
  };

  const getOperationIcon = () => {
    switch (operation) {
      case 'create':
        return '📄';
      case 'modify':
        return '✏️';
      case 'delete':
        return '🗑️';
      default:
        return '📝';
    }
  };

  const getOperationText = () => {
    switch (operation) {
      case 'create':
        return 'Create file';
      case 'modify':
        return 'Edit file';
      case 'delete':
        return 'Delete file';
      default:
        return 'Modify file';
    }
  };

  // Show only a subset of lines for large diffs
  const maxLines = 20;
  const displayDiff = diff.length > maxLines ? 
    [...diff.slice(0, maxLines), { type: 'context' as const, content: `... (${diff.length - maxLines} more lines)` }] : 
    diff;

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text color="cyan" bold>{getOperationIcon()} {getOperationText()}</Text>
      </Box>
      
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="white" bold>{filePath}</Text>
        <Newline />
        
        {displayDiff.map((line, index) => (
          <Box key={index} flexDirection="row">
            {line.type !== 'context' && (
              <>
                <Text color="gray" dimColor>
                  {String(('oldLineNumber' in line ? line.oldLineNumber : undefined) || ('newLineNumber' in line ? line.newLineNumber : undefined) || '').padStart(3, ' ')}
                </Text>
                <Text color={getLineColor(line)}>
                  {getLinePrefix(line)}
                </Text>
              </>
            )}
            <Text color={getLineColor(line)}>
              {line.content}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default FileDiffDisplay;
