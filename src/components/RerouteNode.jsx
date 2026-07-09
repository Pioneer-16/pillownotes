import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

/**
 * UE 蓝图风格的 reroute（中断点）节点。
 * - 一个圆形小把手，可拖拽
 * - 左右各一个隐藏 handle 用来接线
 * - 被选中后按 Delete 会被移除（在 Canvas 的 onNodesChange 里处理合并）
 */
const RerouteNode = memo(({ selected }) => {
  return (
    <div className={`reroute-node${selected ? ' selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        id="r-in"
        className="reroute-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="r-out"
        className="reroute-handle"
      />
    </div>
  );
});

RerouteNode.displayName = 'RerouteNode';

export default RerouteNode;
