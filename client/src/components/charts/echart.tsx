import { useEffect, useRef } from 'react';
import { echarts, type ChartInstance } from '@/lib/echarts';
import { cn } from '@/lib/utils';
import type { EChartsCoreOption } from 'echarts/core';

interface EChartProps {
  option: EChartsCoreOption;
  height?: number;
  className?: string;
  ariaLabel?: string;
  onReady?: (instance: ChartInstance) => void;
  onDispose?: () => void;
}

export function EChart({
  option,
  height = 300,
  className,
  ariaLabel,
  onReady,
  onDispose,
}: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const callbacks = useRef({ onReady, onDispose });
  callbacks.current = { onReady, onDispose };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    callbacks.current.onReady?.(chart);

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      callbacks.current.onDispose?.();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      className={cn('w-full', className)}
      style={{ height }}
      dir="ltr"
      role="img"
      aria-label={ariaLabel}
    />
  );
}
