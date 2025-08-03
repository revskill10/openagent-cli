// layout-manager.tsx - Resizable multi-panel layout manager
import React, { useState, useEffect } from 'react';
import { Text, Box, useInput, useStdout } from 'ink';

export interface PanelConfig {
  id: string;
  title: string;
  component: React.ComponentType<PanelProps>;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  maxSize?: { width: number; height: number };
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  resizable: boolean;
  minimizable: boolean;
  isMinimized?: boolean;
}

export interface PanelProps {
  width: number;
  height: number;
  isMinimized: boolean;
  [key: string]: any;
}

export interface LayoutConfig {
  panels: PanelConfig[];
  layout: 'grid' | 'split-horizontal' | 'split-vertical' | 'custom';
  responsive: boolean;
}

interface LayoutManagerProps {
  config: LayoutConfig;
  panelProps?: Record<string, any>;
  onLayoutChange?: (config: LayoutConfig) => void;
}

export const LayoutManager: React.FC<LayoutManagerProps> = ({
  config,
  panelProps = {},
  onLayoutChange
}) => {
  const [currentConfig, setCurrentConfig] = useState<LayoutConfig>(config);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [resizeMode, setResizeMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { stdout } = useStdout();

  const terminalSize = {
    width: stdout.columns || 120,
    height: stdout.rows || 30
  };

  // Keyboard shortcuts
  useInput((input, key) => {
    if (key.ctrl && input === 'h') {
      setShowHelp(!showHelp);
    } else if (key.ctrl && input === 'r') {
      setResizeMode(!resizeMode);
    } else if (key.ctrl && input === 'l') {
      cycleLayout();
    } else if (key.ctrl && key.shift && input === 'r') {
      resetLayout();
    } else if (resizeMode) {
      handleResizeInput(input, key);
    } else {
      handleNavigationInput(input, key);
    }
  });

  const handleNavigationInput = (input: string, key: any) => {
    const panelIds = currentConfig.panels.map(p => p.id);
    const currentIndex = selectedPanel ? panelIds.indexOf(selectedPanel) : -1;

    if (key.tab) {
      const nextIndex = (currentIndex + 1) % panelIds.length;
      setSelectedPanel(panelIds[nextIndex]);
    } else if (key.shift && key.tab) {
      const prevIndex = currentIndex <= 0 ? panelIds.length - 1 : currentIndex - 1;
      setSelectedPanel(panelIds[prevIndex]);
    } else if (input === 'm' && selectedPanel) {
      toggleMinimize(selectedPanel);
    } else if (input >= '1' && input <= '9') {
      const panelIndex = parseInt(input) - 1;
      if (panelIndex < panelIds.length) {
        setSelectedPanel(panelIds[panelIndex]);
      }
    }
  };

  const handleResizeInput = (input: string, key: any) => {
    if (!selectedPanel) return;

    const panel = currentConfig.panels.find(p => p.id === selectedPanel);
    if (!panel || !panel.resizable) return;

    const resizeStep = 2;
    let newWidth = panel.defaultSize.width;
    let newHeight = panel.defaultSize.height;

    if (key.leftArrow) {
      newWidth = Math.max(panel.minSize.width, panel.defaultSize.width - resizeStep);
    } else if (key.rightArrow) {
      newWidth = Math.min(
        panel.maxSize?.width || terminalSize.width,
        panel.defaultSize.width + resizeStep
      );
    } else if (key.upArrow) {
      newHeight = Math.max(panel.minSize.height, panel.defaultSize.height - resizeStep);
    } else if (key.downArrow) {
      newHeight = Math.min(
        panel.maxSize?.height || terminalSize.height,
        panel.defaultSize.height + resizeStep
      );
    }

    if (newWidth !== panel.defaultSize.width || newHeight !== panel.defaultSize.height) {
      updatePanelSize(selectedPanel, newWidth, newHeight);
    }
  };

  const updatePanelSize = (panelId: string, width: number, height: number) => {
    const newConfig = {
      ...currentConfig,
      panels: currentConfig.panels.map(panel =>
        panel.id === panelId
          ? { ...panel, defaultSize: { width, height } }
          : panel
      )
    };
    setCurrentConfig(newConfig);
    onLayoutChange?.(newConfig);
  };

  const toggleMinimize = (panelId: string) => {
    const newConfig = {
      ...currentConfig,
      panels: currentConfig.panels.map(panel =>
        panel.id === panelId
          ? { ...panel, isMinimized: !panel.isMinimized }
          : panel
      )
    };
    setCurrentConfig(newConfig);
    onLayoutChange?.(newConfig);
  };

  const cycleLayout = () => {
    const layouts: LayoutConfig['layout'][] = ['grid', 'split-horizontal', 'split-vertical'];
    const currentIndex = layouts.indexOf(currentConfig.layout);
    const nextIndex = (currentIndex + 1) % layouts.length;
    
    const newConfig = { ...currentConfig, layout: layouts[nextIndex] };
    setCurrentConfig(newConfig);
    onLayoutChange?.(newConfig);
  };

  const resetLayout = () => {
    setCurrentConfig(config);
    onLayoutChange?.(config);
  };

  const calculatePanelDimensions = (): Record<string, { width: number; height: number; x: number; y: number }> => {
    const dimensions: Record<string, { width: number; height: number; x: number; y: number }> = {};
    
    switch (currentConfig.layout) {
      case 'grid':
        return calculateGridLayout();
      case 'split-horizontal':
        return calculateHorizontalSplitLayout();
      case 'split-vertical':
        return calculateVerticalSplitLayout();
      default:
        return calculateCustomLayout();
    }
  };

  const calculateGridLayout = () => {
    const dimensions: Record<string, { width: number; height: number; x: number; y: number }> = {};
    const panels = currentConfig.panels;
    
    // 2x2 grid layout
    const halfWidth = Math.floor(terminalSize.width / 2);
    const halfHeight = Math.floor(terminalSize.height / 2);

    panels.forEach((panel, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      
      dimensions[panel.id] = {
        width: panel.isMinimized ? Math.min(30, halfWidth) : halfWidth,
        height: panel.isMinimized ? 3 : halfHeight,
        x: col * halfWidth,
        y: row * halfHeight
      };
    });

    return dimensions;
  };

  const calculateHorizontalSplitLayout = () => {
    const dimensions: Record<string, { width: number; height: number; x: number; y: number }> = {};
    const panels = currentConfig.panels;
    const panelHeight = Math.floor(terminalSize.height / panels.length);

    panels.forEach((panel, index) => {
      dimensions[panel.id] = {
        width: panel.isMinimized ? Math.min(30, terminalSize.width) : terminalSize.width,
        height: panel.isMinimized ? 3 : panelHeight,
        x: 0,
        y: index * panelHeight
      };
    });

    return dimensions;
  };

  const calculateVerticalSplitLayout = () => {
    const dimensions: Record<string, { width: number; height: number; x: number; y: number }> = {};
    const panels = currentConfig.panels;
    const panelWidth = Math.floor(terminalSize.width / panels.length);

    panels.forEach((panel, index) => {
      dimensions[panel.id] = {
        width: panel.isMinimized ? Math.min(30, panelWidth) : panelWidth,
        height: panel.isMinimized ? 3 : terminalSize.height,
        x: index * panelWidth,
        y: 0
      };
    });

    return dimensions;
  };

  const calculateCustomLayout = () => {
    const dimensions: Record<string, { width: number; height: number; x: number; y: number }> = {};
    
    // Custom positioning based on panel position property
    currentConfig.panels.forEach(panel => {
      let x = 0, y = 0;
      
      switch (panel.position) {
        case 'top-left':
          x = 0;
          y = 0;
          break;
        case 'top-right':
          x = Math.floor(terminalSize.width / 2);
          y = 0;
          break;
        case 'bottom-left':
          x = 0;
          y = Math.floor(terminalSize.height / 2);
          break;
        case 'bottom-right':
          x = Math.floor(terminalSize.width / 2);
          y = Math.floor(terminalSize.height / 2);
          break;
      }

      dimensions[panel.id] = {
        width: panel.isMinimized ? Math.min(30, panel.defaultSize.width) : panel.defaultSize.width,
        height: panel.isMinimized ? 3 : panel.defaultSize.height,
        x,
        y
      };
    });

    return dimensions;
  };

  const panelDimensions = calculatePanelDimensions();

  if (showHelp) {
    return (
      <Box borderStyle="double" borderColor="yellow" padding={1}>
        <Box flexDirection="column">
          <Text color="yellow" bold>🔧 Layout Manager Help</Text>
          <Text></Text>
          <Text color="cyan">Navigation:</Text>
          <Text>• Tab / Shift+Tab: Switch between panels</Text>
          <Text>• 1-9: Select panel by number</Text>
          <Text>• m: Toggle minimize selected panel</Text>
          <Text></Text>
          <Text color="cyan">Layout Controls:</Text>
          <Text>• Ctrl+L: Cycle layout modes</Text>
          <Text>• Ctrl+R: Toggle resize mode</Text>
          <Text>• Ctrl+Shift+R: Reset to default layout</Text>
          <Text></Text>
          <Text color="cyan">Resize Mode (when active):</Text>
          <Text>• Arrow keys: Resize selected panel</Text>
          <Text></Text>
          <Text color="cyan">General:</Text>
          <Text>• Ctrl+H: Toggle this help</Text>
          <Text></Text>
          <Text color="gray">Press Ctrl+H again to close help</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={terminalSize.width} height={terminalSize.height}>
      {/* Status Bar */}
      <Box justifyContent="space-between" borderStyle="single" borderColor="gray">
        <Text color="gray">
          Layout: {currentConfig.layout} | 
          Selected: {selectedPanel || 'None'} | 
          {resizeMode ? '🔧 Resize Mode' : '📐 Navigate Mode'}
        </Text>
        <Text color="gray">
          Ctrl+H: Help | Ctrl+R: Resize | Ctrl+L: Layout
        </Text>
      </Box>

      {/* Panels */}
      <Box position="relative" width={terminalSize.width} height={terminalSize.height - 1}>
        {currentConfig.panels.map((panel, index) => {
          const dims = panelDimensions[panel.id];
          if (!dims) return null;

          const PanelComponent = panel.component;
          const isSelected = selectedPanel === panel.id;
          const props = {
            width: dims.width,
            height: dims.height,
            isMinimized: panel.isMinimized || false,
            ...panelProps[panel.id]
          };

          return (
            <Box
              key={panel.id}
              position="absolute"
              left={dims.x}
              top={dims.y}
              width={dims.width}
              height={dims.height}
              borderStyle={isSelected ? "double" : undefined}
              borderColor={isSelected ? "cyan" : undefined}
            >
              <PanelComponent {...props} />
              
              {/* Panel Number Indicator */}
              <Box position="absolute" top={0} right={0}>
                <Text color="gray" backgroundColor={isSelected ? "cyan" : undefined}>
                  {index + 1}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// Utility function to create default layout configurations
export const createDefaultLayout = (): LayoutConfig => ({
  layout: 'grid',
  responsive: true,
  panels: [
    {
      id: 'main-chat',
      title: 'Main Chat',
      component: () => <Text>Main Chat Panel</Text>,
      defaultSize: { width: 60, height: 20 },
      minSize: { width: 40, height: 10 },
      position: 'top-left',
      resizable: true,
      minimizable: true
    },
    {
      id: 'system-logs',
      title: 'System Logs',
      component: () => <Text>System Logs Panel</Text>,
      defaultSize: { width: 60, height: 15 },
      minSize: { width: 40, height: 8 },
      position: 'top-right',
      resizable: true,
      minimizable: true
    },
    {
      id: 'agents',
      title: 'Agents',
      component: () => <Text>Agents Panel</Text>,
      defaultSize: { width: 60, height: 15 },
      minSize: { width: 30, height: 8 },
      position: 'bottom-left',
      resizable: true,
      minimizable: true
    },
    {
      id: 'tasks',
      title: 'Task Management',
      component: () => <Text>Task Management Panel</Text>,
      defaultSize: { width: 60, height: 15 },
      minSize: { width: 40, height: 8 },
      position: 'bottom-right',
      resizable: true,
      minimizable: true
    }
  ]
});
