// Register the chart types and SVG features used by the current dashboard.
import {use} from 'echarts/core';
import {LineChart,BarChart,ScatterChart,BoxplotChart,HeatmapChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,LegendComponent,MarkLineComponent,
  MarkAreaComponent,VisualMapContinuousComponent} from 'echarts/components';
import {LabelLayout} from 'echarts/features';
import {SVGRenderer} from 'echarts/renderers';

use([LineChart,BarChart,ScatterChart,BoxplotChart,HeatmapChart,GridComponent,
  TooltipComponent,LegendComponent,MarkLineComponent,MarkAreaComponent,
  VisualMapContinuousComponent,LabelLayout,SVGRenderer]);
export * from 'echarts/core';
