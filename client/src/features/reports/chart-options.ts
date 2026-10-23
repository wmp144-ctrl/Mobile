import type { EChartsCoreOption } from 'echarts/core';
import type { ReportChartResult } from '@/lib/types';

export const CHART_COLORS = [
  '#4364ef',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#a855f7',
];

const TEXT_STYLE = {
  fontFamily: 'Vazirmatn, Tahoma, sans-serif',
  fontSize: 12,
  color: '#3a4459',
};

const AXIS_LABEL = {
  ...TEXT_STYLE,
  color: '#66718f',
  hideOverlap: true,
};

function safeName(name: string): string {
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

export function buildChartOption(chart: ReportChartResult): EChartsCoreOption {
  const colors = CHART_COLORS;
  const tooltip = {
    trigger: chart.chartType === 'pie' || chart.chartType === 'doughnut' ? 'item' : 'axis',
    confine: true,
    backgroundColor: '#ffffff',
    borderColor: '#d9dde9',
    textStyle: { fontFamily: TEXT_STYLE.fontFamily, fontSize: 12, color: '#232b3d' },
    axisPointer: { type: 'shadow' },
  };
  const base: EChartsCoreOption = {
    color: colors,
    textStyle: TEXT_STYLE,
    aria: { enabled: true },
    animationDuration: 450,
    tooltip,
  };

  if (chart.chartType === 'pie' || chart.chartType === 'doughnut') {
    const data = chart.categories.map((category, index) => ({
      name: safeName(category),
      value: chart.series[0]?.data[index] ?? 0,
    }));
    return {
      ...base,
      tooltip: {
        ...tooltip,
        formatter: '{b}<br/>{c} مورد ({d}٪)',
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        textStyle: TEXT_STYLE,
        pageIconColor: '#4364ef',
        pageTextStyle: TEXT_STYLE,
      },
      series: [
        {
          type: 'pie',
          radius: chart.chartType === 'doughnut' ? ['38%', '66%'] : ['0%', '66%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 5 },
          label: {
            ...TEXT_STYLE,
            formatter: '{b}\n{d}٪',
            lineHeight: 17,
          },
          labelLine: { length: 10, length2: 8 },
          data,
        },
      ],
    };
  }

  const horizontal = Boolean(chart.horizontal);
  const isStacked = chart.chartType === 'stackedBar';
  const isCombo = chart.chartType === 'combo';
  const isLine = chart.chartType === 'line' || chart.chartType === 'area' || isCombo;
  const showLegend = chart.series.length > 1;

  const categoryAxis = {
    type: 'category',
    data: chart.categories.map(safeName),
    axisLabel: {
      ...AXIS_LABEL,
      interval: 0,
      rotate: !horizontal && chart.categories.length > 6 ? 28 : 0,
      width: horizontal ? 110 : undefined,
      overflow: 'truncate',
    },
    axisLine: { lineStyle: { color: '#d9dde9' } },
    axisTick: { show: false },
  };
  const valueAxis = {
    type: 'value',
    minInterval: 1,
    axisLabel: AXIS_LABEL,
    splitLine: { lineStyle: { color: '#eceef5' } },
  };

  const series = chart.series.map((item, index) => {
    const type = isCombo ? (index === 0 ? 'bar' : 'line') : isStacked ? 'bar' : isLine ? 'line' : 'bar';
    return {
      name: item.name,
      type,
      data: item.data,
      smooth: type === 'line',
      symbolSize: 7,
      stack: isStacked ? 'total' : undefined,
      barMaxWidth: horizontal ? 26 : 36,
      itemStyle: {
        borderRadius:
          type === 'bar' && !isStacked
            ? horizontal
              ? [0, 6, 6, 0]
              : [6, 6, 0, 0]
            : 4,
      },
      areaStyle:
        chart.chartType === 'area'
          ? { opacity: 0.18 }
          : isCombo && index > 0
            ? { opacity: 0.1 }
            : undefined,
      emphasis: { focus: 'series' },
    };
  });

  return {
    ...base,
    legend: showLegend
      ? {
          top: 0,
          textStyle: TEXT_STYLE,
          icon: 'roundRect',
          itemWidth: 12,
          itemHeight: 8,
        }
      : undefined,
    grid: {
      left: 14,
      right: 22,
      top: showLegend ? 46 : 22,
      bottom: 12,
      containLabel: true,
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  };
}
