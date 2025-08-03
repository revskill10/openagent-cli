// performance-monitor.tsx - Performance monitoring and optimization utilities
import React, { useState, useEffect, useRef } from 'react';
import { Text, Box } from 'ink';

export interface PerformanceMetrics {
  renderTime: number;
  updateCount: number;
  memoryUsage: number;
  lastUpdate: Date;
  fps: number;
}

export interface PerformanceMonitorProps {
  enabled?: boolean;
  sampleInterval?: number;
  maxSamples?: number;
  onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
}

export const usePerformanceMonitor = (options: PerformanceMonitorProps = {}) => {
  const {
    enabled = false,
    sampleInterval = 1000,
    maxSamples = 60,
    onMetricsUpdate
  } = options;

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    updateCount: 0,
    memoryUsage: 0,
    lastUpdate: new Date(),
    fps: 0
  });

  const renderStartTime = useRef<number>(0);
  const updateCount = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const lastFrameTime = useRef<number>(Date.now());
  const samples = useRef<number[]>([]);

  // Start render timing
  const startRender = () => {
    if (!enabled) return;
    renderStartTime.current = performance.now();
  };

  // End render timing
  const endRender = () => {
    if (!enabled) return;
    const renderTime = performance.now() - renderStartTime.current;
    updateCount.current++;
    frameCount.current++;

    // Calculate FPS
    const now = Date.now();
    const deltaTime = now - lastFrameTime.current;
    
    if (deltaTime >= 1000) {
      const fps = (frameCount.current * 1000) / deltaTime;
      frameCount.current = 0;
      lastFrameTime.current = now;

      // Update metrics
      const newMetrics: PerformanceMetrics = {
        renderTime,
        updateCount: updateCount.current,
        memoryUsage: getMemoryUsage(),
        lastUpdate: new Date(),
        fps
      };

      setMetrics(newMetrics);
      onMetricsUpdate?.(newMetrics);

      // Store sample for averaging
      samples.current.push(renderTime);
      if (samples.current.length > maxSamples) {
        samples.current.shift();
      }
    }
  };

  // Get memory usage (Node.js specific)
  const getMemoryUsage = (): number => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return Math.round(usage.heapUsed / 1024 / 1024); // MB
    }
    return 0;
  };

  // Get average render time
  const getAverageRenderTime = (): number => {
    if (samples.current.length === 0) return 0;
    const sum = samples.current.reduce((acc, val) => acc + val, 0);
    return sum / samples.current.length;
  };

  // Reset metrics
  const reset = () => {
    updateCount.current = 0;
    frameCount.current = 0;
    samples.current = [];
    setMetrics({
      renderTime: 0,
      updateCount: 0,
      memoryUsage: 0,
      lastUpdate: new Date(),
      fps: 0
    });
  };

  return {
    metrics,
    startRender,
    endRender,
    getAverageRenderTime,
    reset,
    enabled
  };
};

export const PerformanceOverlay: React.FC<{
  metrics: PerformanceMetrics;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  visible?: boolean;
}> = ({ metrics, position = 'top-right', visible = true }) => {
  if (!visible) return null;

  const getPositionStyles = () => {
    switch (position) {
      case 'top-left':
        return { position: 'absolute' as const, top: 0, left: 0 };
      case 'top-right':
        return { position: 'absolute' as const, top: 0, right: 0 };
      case 'bottom-left':
        return { position: 'absolute' as const, bottom: 0, left: 0 };
      case 'bottom-right':
        return { position: 'absolute' as const, bottom: 0, right: 0 };
      default:
        return { position: 'absolute' as const, top: 0, right: 0 };
    }
  };

  const getPerformanceColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'green';
    if (value <= thresholds.warning) return 'yellow';
    return 'red';
  };

  return (
    <Box {...getPositionStyles()} borderStyle="single" borderColor="gray" padding={1}>
      <Box flexDirection="column">
        <Text color="gray" bold>⚡ Performance</Text>
        
        <Text color={getPerformanceColor(metrics.renderTime, { good: 16, warning: 33 })}>
          Render: {metrics.renderTime.toFixed(1)}ms
        </Text>
        
        <Text color={getPerformanceColor(60 - metrics.fps, { good: 10, warning: 20 })}>
          FPS: {metrics.fps.toFixed(0)}
        </Text>
        
        <Text color={getPerformanceColor(metrics.memoryUsage, { good: 100, warning: 200 })}>
          Memory: {metrics.memoryUsage}MB
        </Text>
        
        <Text color="gray">
          Updates: {metrics.updateCount}
        </Text>
      </Box>
    </Box>
  );
};

// React component wrapper for performance monitoring
export const withPerformanceMonitoring = <P extends object>(
  Component: React.ComponentType<P>,
  options: PerformanceMonitorProps = {}
) => {
  return React.forwardRef<any, P>((props, ref) => {
    const performanceMonitor = usePerformanceMonitor(options);

    useEffect(() => {
      performanceMonitor.startRender();
      return () => {
        performanceMonitor.endRender();
      };
    });

    return <Component {...props} ref={ref} />;
  });
};

// Debounce hook for performance optimization
export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Throttle hook for performance optimization
export const useThrottle = <T,>(value: T, limit: number): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef<number>(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
};

// Memoization hook for expensive calculations
export const useMemoizedCallback = <T extends (...args: any[]) => any,>(
  callback: T,
  deps: React.DependencyList
): T => {
  return React.useCallback(callback, deps);
};

// Virtual scrolling hook for large lists
export const useVirtualScrolling = (
  items: any[],
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  );

  const visibleItems = items.slice(startIndex, endIndex);
  const totalHeight = items.length * itemHeight;
  const offsetY = startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop,
    startIndex,
    endIndex
  };
};

// Performance optimization utilities
export const PerformanceUtils = {
  // Batch DOM updates
  batchUpdates: (callback: () => void) => {
    // In React 18+, updates are automatically batched
    callback();
  },

  // Measure component render time
  measureRenderTime: (componentName: string, renderFn: () => void) => {
    const start = performance.now();
    renderFn();
    const end = performance.now();
    console.log(`${componentName} render time: ${(end - start).toFixed(2)}ms`);
  },

  // Check if component should update (shallow comparison)
  shouldUpdate: (prevProps: any, nextProps: any): boolean => {
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);

    if (prevKeys.length !== nextKeys.length) return true;

    for (const key of prevKeys) {
      if (prevProps[key] !== nextProps[key]) return true;
    }

    return false;
  },

  // Deep clone with performance considerations
  deepClone: <T,>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
    if (obj instanceof Array) return obj.map(item => PerformanceUtils.deepClone(item)) as unknown as T;
    
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = PerformanceUtils.deepClone(obj[key]);
      }
    }
    return cloned;
  }
};
