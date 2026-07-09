import React, { memo, useCallback } from 'react';
import { BaseEdge, getBezierPath, useReactFlow } from '@xyflow/react';

/**
 * UE 蓝图风格连线（贝塞尔曲线）。
 * 双击线体的位置 → 在该点生成一个 reroute 中断点节点，把当前边切成两段。
 */
const BlueprintEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}) => {
  const { screenToFlowPosition } = useReactFlow();

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const onEdgeDoubleClick = useCallback((e) => {
    e.stopPropagation();
    if (!data?.onSplit) return;
    // 屏幕坐标 → world 坐标（考虑 pan/zoom）
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    data.onSplit(id, flowPos.x, flowPos.y);
  }, [id, data, screenToFlowPosition]);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {/* 透明宽 stroke 用于捕获双击事件 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onDoubleClick={onEdgeDoubleClick}
        style={{ cursor: 'copy', pointerEvents: 'stroke' }}
      />
    </>
  );
});

BlueprintEdge.displayName = 'BlueprintEdge';

export default BlueprintEdge;
