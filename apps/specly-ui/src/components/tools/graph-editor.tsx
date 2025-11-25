import { useCallback } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    type Connection,
    type Edge,
    type Node,
    BackgroundVariant,
    Panel,
    ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import CustomNode from './custom-node';

interface GraphEditorProps {
    initialNodes?: Node[];
    initialEdges?: Edge[];
    readOnly?: boolean;
    onChange?: (data: { nodes: Node[]; edges: Edge[] }) => void;
}

const nodeTypes = {
    custom: CustomNode,
};

export function GraphEditor({ initialNodes = [], initialEdges = [], readOnly = false, onChange }: GraphEditorProps) {
    // If no initial nodes provided, start with a default one
    const defaultNodes: Node[] = initialNodes.length > 0 ? initialNodes : [
        { id: '1', position: { x: 100, y: 100 }, data: { label: 'Entry Spec' }, type: 'custom' }
    ];

    const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const onConnect = useCallback(
        (params: Connection) => {
            const newEdges = addEdge(params, edges);
            setEdges(newEdges);
            if (onChange) onChange({ nodes, edges: newEdges });
        },
        [edges, nodes, onChange, setEdges],
    );

    const addNode = () => {
        if (readOnly) return;
        const id = (nodes.length + 1).toString();
        const newNode: Node = {
            id,
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: { label: `Spec ${id}` },
            type: 'custom',
        };
        const newNodes = [...nodes, newNode];
        setNodes(newNodes);

        if (onChange) {
            onChange({ nodes: newNodes, edges });
        }
    };

    const proOptions = { hideAttribution: true };

    return (
        <div style={{ width: '100%', height: '600px' }} className="border rounded-xl bg-gray-50 overflow-hidden shadow-sm">
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    proOptions={proOptions}
                    fitView
                    className="bg-gray-50"
                >
                    {!readOnly && <Controls className="bg-white border-gray-200 shadow-md rounded-lg overflow-hidden" />}
                    <MiniMap
                        className="border-2 border-gray-100 rounded-lg shadow-md overflow-hidden"
                        maskColor="rgba(240, 240, 240, 0.6)"
                        nodeColor="#e2e8f0"
                    />
                    <Background color="#94a3b8" variant={BackgroundVariant.Dots} gap={20} size={1} />
                    {!readOnly && (
                        <Panel position="top-right" className="m-4">
                            <Button onClick={addNode} size="sm" className="shadow-md hover:shadow-lg transition-all">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Node
                            </Button>
                        </Panel>
                    )}
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
