// keyboard-shortcuts.tsx - Global keyboard shortcuts manager
import React, { useEffect, useCallback, useRef } from 'react';
import { useInput } from 'ink';
import { Text, Box } from 'ink';

export interface KeyboardShortcut {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: string;
  action: () => void;
  enabled?: boolean;
  global?: boolean; // Whether shortcut works globally or only when component is focused
}

export interface KeyboardShortcutsManagerProps {
  shortcuts: KeyboardShortcut[];
  onShortcutExecuted?: (shortcut: KeyboardShortcut) => void;
  enabled?: boolean;
}

export const useKeyboardShortcuts = (
  shortcuts: KeyboardShortcut[],
  options: {
    enabled?: boolean;
    onShortcutExecuted?: (shortcut: KeyboardShortcut) => void;
  } = {}
) => {
  const { enabled = true, onShortcutExecuted } = options;
  const shortcutsRef = useRef(shortcuts);

  // Update shortcuts ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useInput((input, key) => {
    if (!enabled) return;

    const activeShortcuts = shortcutsRef.current.filter(s => s.enabled !== false);

    for (const shortcut of activeShortcuts) {
      if (matchesShortcut(input, key, shortcut)) {
        try {
          shortcut.action();
          onShortcutExecuted?.(shortcut);
        } catch (error) {
          console.error(`Error executing shortcut ${shortcut.id}:`, error);
        }
        break; // Only execute first matching shortcut
      }
    }
  });

  const addShortcut = useCallback((shortcut: KeyboardShortcut) => {
    shortcutsRef.current = [...shortcutsRef.current, shortcut];
  }, []);

  const removeShortcut = useCallback((id: string) => {
    shortcutsRef.current = shortcutsRef.current.filter(s => s.id !== id);
  }, []);

  const enableShortcut = useCallback((id: string) => {
    shortcutsRef.current = shortcutsRef.current.map(s =>
      s.id === id ? { ...s, enabled: true } : s
    );
  }, []);

  const disableShortcut = useCallback((id: string) => {
    shortcutsRef.current = shortcutsRef.current.map(s =>
      s.id === id ? { ...s, enabled: false } : s
    );
  }, []);

  return {
    addShortcut,
    removeShortcut,
    enableShortcut,
    disableShortcut,
    shortcuts: shortcutsRef.current
  };
};

const matchesShortcut = (input: string, key: any, shortcut: KeyboardShortcut): boolean => {
  // Check modifier keys
  if (shortcut.ctrl && !key.ctrl) return false;
  if (shortcut.shift && !key.shift) return false;
  if (shortcut.alt && !key.alt) return false;
  if (shortcut.meta && !key.meta) return false;

  // Check main key
  if (shortcut.key.length === 1) {
    // Single character key
    return input.toLowerCase() === shortcut.key.toLowerCase();
  } else {
    // Special key (e.g., 'tab', 'enter', 'escape')
    const keyName = shortcut.key.toLowerCase();
    
    switch (keyName) {
      case 'tab':
        return key.tab;
      case 'enter':
        return key.return;
      case 'escape':
        return key.escape;
      case 'space':
        return input === ' ';
      case 'backspace':
        return key.backspace;
      case 'delete':
        return key.delete;
      case 'up':
      case 'uparrow':
        return key.upArrow;
      case 'down':
      case 'downarrow':
        return key.downArrow;
      case 'left':
      case 'leftarrow':
        return key.leftArrow;
      case 'right':
      case 'rightarrow':
        return key.rightArrow;
      case 'pageup':
        return key.pageUp;
      case 'pagedown':
        return key.pageDown;
      case 'home':
        return key.home;
      case 'end':
        return key.end;
      default:
        return false;
    }
  }
};

export const KeyboardShortcutsHelp: React.FC<{
  shortcuts: KeyboardShortcut[];
  visible: boolean;
  onClose: () => void;
}> = ({ shortcuts, visible, onClose }) => {
  useInput((input, key) => {
    if (visible && (key.escape || (key.ctrl && input === 'h'))) {
      onClose();
    }
  });

  if (!visible) return null;

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((groups, shortcut) => {
    const category = shortcut.category || 'General';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(shortcut);
    return groups;
  }, {} as Record<string, KeyboardShortcut[]>);

  const formatShortcut = (shortcut: KeyboardShortcut): string => {
    const parts: string[] = [];
    
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.meta) parts.push('Meta');
    
    parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
    
    return parts.join('+');
  };

  return (
    <Box
      position="absolute"
      top={2}
      left={2}
      right={2}
      bottom={2}
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      backgroundColor="black"
    >
      <Box flexDirection="column" width="100%">
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color="cyan" bold>⌨️ Keyboard Shortcuts</Text>
          <Text color="gray">Press Esc or Ctrl+H to close</Text>
        </Box>

        <Box flexDirection="column" overflowY="scroll">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <Box key={category} flexDirection="column" marginBottom={1}>
              <Text color="yellow" bold>{category}:</Text>
              
              {categoryShortcuts
                .filter(s => s.enabled !== false)
                .map(shortcut => (
                  <Box key={shortcut.id} justifyContent="space-between" marginLeft={2}>
                    <Text color="white">{shortcut.description}</Text>
                    <Text color="cyan">{formatShortcut(shortcut)}</Text>
                  </Box>
                ))}
            </Box>
          ))}
        </Box>

        <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
          <Text color="gray">
            💡 Tip: Some shortcuts may be context-sensitive and only work in specific panels.
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

// Predefined shortcut sets
export const createDefaultShortcuts = (actions: {
  showHelp: () => void;
  toggleResize: () => void;
  cycleLayout: () => void;
  resetLayout: () => void;
  switchPanel: (direction: 'next' | 'prev') => void;
  minimizePanel: () => void;
  scrollUp: () => void;
  scrollDown: () => void;
  jumpToTop: () => void;
  jumpToBottom: () => void;
}): KeyboardShortcut[] => [
  {
    id: 'help',
    key: 'h',
    ctrl: true,
    description: 'Show/hide help',
    category: 'General',
    action: actions.showHelp
  },
  {
    id: 'resize-mode',
    key: 'r',
    ctrl: true,
    description: 'Toggle resize mode',
    category: 'Layout',
    action: actions.toggleResize
  },
  {
    id: 'cycle-layout',
    key: 'l',
    ctrl: true,
    description: 'Cycle layout modes',
    category: 'Layout',
    action: actions.cycleLayout
  },
  {
    id: 'reset-layout',
    key: 'r',
    ctrl: true,
    shift: true,
    description: 'Reset to default layout',
    category: 'Layout',
    action: actions.resetLayout
  },
  {
    id: 'next-panel',
    key: 'tab',
    description: 'Switch to next panel',
    category: 'Navigation',
    action: () => actions.switchPanel('next')
  },
  {
    id: 'prev-panel',
    key: 'tab',
    shift: true,
    description: 'Switch to previous panel',
    category: 'Navigation',
    action: () => actions.switchPanel('prev')
  },
  {
    id: 'minimize-panel',
    key: 'm',
    description: 'Minimize/restore selected panel',
    category: 'Layout',
    action: actions.minimizePanel
  },
  {
    id: 'scroll-up',
    key: 'up',
    description: 'Scroll up',
    category: 'Navigation',
    action: actions.scrollUp
  },
  {
    id: 'scroll-down',
    key: 'down',
    description: 'Scroll down',
    category: 'Navigation',
    action: actions.scrollDown
  },
  {
    id: 'jump-top',
    key: 'home',
    description: 'Jump to top',
    category: 'Navigation',
    action: actions.jumpToTop
  },
  {
    id: 'jump-bottom',
    key: 'end',
    description: 'Jump to bottom',
    category: 'Navigation',
    action: actions.jumpToBottom
  },
  {
    id: 'page-up',
    key: 'pageup',
    description: 'Page up',
    category: 'Navigation',
    action: actions.scrollUp
  },
  {
    id: 'page-down',
    key: 'pagedown',
    description: 'Page down',
    category: 'Navigation',
    action: actions.scrollDown
  }
];

// Context-specific shortcuts
export const createChatShortcuts = (actions: {
  clearChat: () => void;
  toggleTimestamps: () => void;
  exportChat: () => void;
}): KeyboardShortcut[] => [
  {
    id: 'clear-chat',
    key: 'k',
    ctrl: true,
    description: 'Clear chat history',
    category: 'Chat',
    action: actions.clearChat
  },
  {
    id: 'toggle-timestamps',
    key: 't',
    ctrl: true,
    description: 'Toggle timestamps',
    category: 'Chat',
    action: actions.toggleTimestamps
  },
  {
    id: 'export-chat',
    key: 's',
    ctrl: true,
    description: 'Export chat history',
    category: 'Chat',
    action: actions.exportChat
  }
];

export const createAgentShortcuts = (actions: {
  refreshAgents: () => void;
  toggleAgentDetails: () => void;
  killAgent: () => void;
}): KeyboardShortcut[] => [
  {
    id: 'refresh-agents',
    key: 'f5',
    description: 'Refresh agent list',
    category: 'Agents',
    action: actions.refreshAgents
  },
  {
    id: 'toggle-agent-details',
    key: 'd',
    description: 'Toggle agent details',
    category: 'Agents',
    action: actions.toggleAgentDetails
  },
  {
    id: 'kill-agent',
    key: 'delete',
    description: 'Kill selected agent',
    category: 'Agents',
    action: actions.killAgent
  }
];
