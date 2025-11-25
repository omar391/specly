import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, MoreHorizontal } from 'lucide-react';

const CustomNode = ({ data, selected }: NodeProps) => {
    return (
        <div
            className={`
        px-4 py-3 shadow-lg rounded-xl bg-white border-2 min-w-[200px]
        transition-all duration-200 ease-in-out
        ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100 hover:border-gray-200'}
      `}
        >
            <div className="flex items-center gap-3">
                {/* Icon Container */}
                <div className={`
          p-2 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5
          ${selected ? 'text-primary' : 'text-gray-500'}
        `}>
                    <Box size={20} />
                </div>

                {/* Content */}
                <div className="flex-1">
                    <div className="text-sm font-bold text-gray-900">{data.label as string}</div>
                    <div className="text-xs text-gray-500">Node Description</div>
                </div>

                {/* Actions */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600">
                        <MoreHorizontal size={16} />
                    </button>
                </div>
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white transition-colors hover:!bg-primary"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white transition-colors hover:!bg-primary"
            />
        </div>
    );
};

export default memo(CustomNode);
