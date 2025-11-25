import React, { useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { GripVertical, Plus, Trash2, Settings } from 'lucide-react';
import type { Spec } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface SortableSpecItemProps {
    id: string;
    spec: Spec;
    onRemove: (id: string) => void;
    onEdit: (id: string, updatedSpec: Spec) => void;
}

function SortableSpecItem({ id, spec, onRemove, onEdit }: SortableSpecItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="mb-2">
            <Card className="bg-card hover:bg-accent/5 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                    <div {...attributes} {...listeners} className="cursor-move text-muted-foreground hover:text-foreground">
                        <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{spec.intent}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">
                                {spec.executor_type}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            {spec.content_template || 'No template defined'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <SpecDialog spec={spec} onSave={(updated) => onEdit(id, updated)} trigger={
                            <Button variant="ghost" size="icon">
                                <Settings className="w-4 h-4" />
                            </Button>
                        } />
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => onRemove(id)}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

interface SpecDialogProps {
    spec?: Spec;
    onSave: (spec: Spec) => void;
    trigger: React.ReactNode;
}

function SpecDialog({ spec, onSave, trigger }: SpecDialogProps) {
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState<Spec>(spec || {
        executor_type: 'llm-prompt',
        executor_version: 'v1',
        intent: '',
        content_template: '',
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        setOpen(false);
        if (!spec) {
            // Reset if creating new
            setFormData({
                executor_type: 'llm-prompt',
                executor_version: 'v1',
                intent: '',
                content_template: '',
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{spec ? 'Edit Spec' : 'Add New Spec'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Intent</Label>
                        <Input
                            value={formData.intent}
                            onChange={(e) => setFormData({ ...formData, intent: e.target.value })}
                            placeholder="e.g., Analyze user input"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Executor Type</Label>
                            <Select
                                value={formData.executor_type}
                                onValueChange={(val) => setFormData({ ...formData, executor_type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="llm-prompt">LLM Prompt</SelectItem>
                                    <SelectItem value="tool-call">Tool Call</SelectItem>
                                    <SelectItem value="code-execution">Code Execution</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Version</Label>
                            <Input
                                value={formData.executor_version}
                                onChange={(e) => setFormData({ ...formData, executor_version: e.target.value })}
                                placeholder="v1"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Content Template</Label>
                        <Textarea
                            value={formData.content_template || ''}
                            onChange={(e) => setFormData({ ...formData, content_template: e.target.value })}
                            placeholder="Instructions or prompt template..."
                            className="min-h-[100px]"
                        />
                    </div>
                    <div className="flex justify-end pt-4">
                        <Button type="submit">Save Spec</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

interface WorkflowEditorProps {
    initialSpecs?: Spec[];
    onChange: (specs: Spec[]) => void;
}

export function WorkflowEditor({ initialSpecs = [], onChange }: WorkflowEditorProps) {
    // We use a local ID for drag and drop stability, mapped to the spec
    const [items, setItems] = useState<{ id: string; spec: Spec }[]>(
        initialSpecs.map((s) => ({ id: crypto.randomUUID(), spec: s }))
    );

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setItems((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newItems = arrayMove(items, oldIndex, newIndex);
                onChange(newItems.map(i => i.spec));
                return newItems;
            });
        }
    };

    const addSpec = (spec: Spec) => {
        const newItem = { id: crypto.randomUUID(), spec };
        const newItems = [...items, newItem];
        setItems(newItems);
        onChange(newItems.map(i => i.spec));
    };

    const removeSpec = (id: string) => {
        const newItems = items.filter((i) => i.id !== id);
        setItems(newItems);
        onChange(newItems.map(i => i.spec));
    };

    const editSpec = (id: string, updatedSpec: Spec) => {
        const newItems = items.map((i) => (i.id === id ? { ...i, spec: updatedSpec } : i));
        setItems(newItems);
        onChange(newItems.map(i => i.spec));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Workflow Steps</h3>
                <SpecDialog
                    onSave={addSpec}
                    trigger={
                        <Button size="sm" className="gap-2">
                            <Plus className="w-4 h-4" />
                            Add Step
                        </Button>
                    }
                />
            </div>

            <div className="bg-muted/30 rounded-lg p-4 min-h-[200px] border border-dashed border-muted-foreground/25">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={items.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {items.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                                <p>No steps defined yet.</p>
                                <p className="text-sm">Add a step to begin building the workflow.</p>
                            </div>
                        ) : (
                            items.map((item) => (
                                <SortableSpecItem
                                    key={item.id}
                                    id={item.id}
                                    spec={item.spec}
                                    onRemove={removeSpec}
                                    onEdit={editSpec}
                                />
                            ))
                        )}
                    </SortableContext>
                </DndContext>
            </div>
        </div>
    );
}
