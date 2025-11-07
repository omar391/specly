/**
 * NextStepTemplateGenerator - Dynamic Generation of Next Step Instructions
 * 
 * Replaces hardcoded "Call specly_add with stepId='validate'" text with dynamic 
 * next step instructions generated from database tool flows. Builds contextual 
 * instructions from tool flow data automatically.
 */

import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { ToolNames } from '../constants/tool-names.js';

export interface NextStepInstruction {
    instructionText: string;
    toolName: string;
    stepId?: string;
    context?: string;
}

export class NextStepTemplateGenerator {
    private dbManager: DrizzleDatabaseManager;
    private instructionCache: Map<string, NextStepInstruction> = new Map();

    constructor(dbManager: DrizzleDatabaseManager) {
        this.dbManager = dbManager;
    }

    /**
     * Generate next step instructions for a given tool and current step
     */
    async generateNextStepInstructions(
        toolName: string, 
        currentStepId?: string,
        workspaceId?: string,
        context?: string
    ): Promise<NextStepInstruction | null> {
        const cacheKey = `${toolName}:${currentStepId || 'initial'}:${workspaceId || 'global'}`;
        
        // Check cache first
        if (this.instructionCache.has(cacheKey)) {
            return this.instructionCache.get(cacheKey)!;
        }

        try {
            // Get tool flow for this tool
            const toolFlow = await this.getToolFlow(toolName, workspaceId);
            if (!toolFlow) {
                return null;
            }

            // Find current step and determine next step
            const nextStep = await this.determineNextStep(toolFlow, currentStepId);
            if (!nextStep) {
                return null;
            }

            // Generate instruction text
            const instruction = this.buildInstructionText(toolName, nextStep, context);
            
            // Cache the result
            this.instructionCache.set(cacheKey, instruction);
            
            return instruction;
        } catch (error) {
            console.error(`Error generating next step instructions for ${toolName}:`, error);
            return null;
        }
    }

    /**
     * Generate completion instructions when a tool flow is finished
     */
    async generateCompletionInstructions(
        toolName: string,
        workspaceId?: string,
        context?: string
    ): Promise<NextStepInstruction> {
        const completionTemplates = {
            [ToolNames.ADD]: "Task has been successfully added to your workspace. Use `specly_status` to view all tasks or continue with other workflow tools.",
            [ToolNames.INIT]: "Project initialization completed. Your workspace is now set up with the task management system. Use `specly_add` to create your first task.",
            [ToolNames.STATUS]: "Status overview complete. Use detailed information to guide your next actions or run `specly_focus` on specific tasks.",
            [ToolNames.UPDATE]: "Task update completed successfully. Changes have been saved to your workspace database.",
            [ToolNames.AUDIT]: "Audit completed. Review the generated reports and recommendations for workspace optimization.",
            [ToolNames.FOCUS]: "Focus session complete. Task analysis and recommendations are ready for implementation."
        } as const;

        const instructionText = (completionTemplates as any)[toolName]
            || `${toolName} completed successfully. Refer to the output for next steps.`;

        return {
            instructionText: context ? `${instructionText} Context: ${context}` : instructionText,
            toolName,
            context
        };
    }

    /**
     * Get available next steps for a tool without executing
     */
    async getAvailableNextSteps(toolName: string, workspaceId?: string): Promise<string[]> {
        try {
            const toolFlow = await this.getToolFlow(toolName, workspaceId);
            if (!toolFlow) {
                return [];
            }

            return toolFlow.flow_steps
                .map(step => this.extractStepId(step.system_tool_fn))
                .filter(stepId => stepId !== null);
        } catch (error) {
            console.error(`Error getting available steps for ${toolName}:`, error);
            return [];
        }
    }

    /**
     * Clear instruction cache for testing or when database changes
     */
    clearCache(): void {
        this.instructionCache.clear();
    }

    // Private helper methods

    // Temporary lightweight interface definitions retained locally after multi-step removal
    // to avoid importing deleted legacy types.
    private async getToolFlow(toolName: string, workspaceId?: string): Promise<{ flow_steps: Array<{ system_tool_fn: string; step_order: number; next_tool?: string; feedback_step?: boolean }> } | null> {
        try {
            // Get tool flow from embedded seed data or database
            // For now, use a simplified approach that works with the current system

            // TODO: Placeholder implementation - future versions will query new SpecEngine routing metadata.
            
            // Return null for now - this will be implemented when we have proper database integration
            return null;
        } catch (error) {
            console.error(`Error fetching tool flow for ${toolName}:`, error);
            return null;
        }
    }

    private async determineNextStep(toolFlow: { flow_steps: Array<{ system_tool_fn: string; step_order: number; next_tool?: string; feedback_step?: boolean }> }, currentStepId?: string): Promise<{ system_tool_fn: string; step_order: number; next_tool?: string; feedback_step?: boolean } | null> {
        if (!currentStepId) {
            // Return first step for initial call
            return toolFlow.flow_steps.find(step => step.step_order === 1) || null;
        }

        // Find current step
        const currentStep = toolFlow.flow_steps.find(step => 
            this.extractStepId(step.system_tool_fn) === currentStepId
        );

        if (!currentStep) {
            return null;
        }

        // Check if this step has explicit next_tool
        if (currentStep.next_tool) {
            // This step points to a different tool - return completion instruction
            return null;
        }

        // Find next step in sequence
        const nextStep = toolFlow.flow_steps.find(step => 
            step.step_order === currentStep.step_order + 1
        );

        return nextStep || null;
    }

    private buildInstructionText(toolName: string, nextStep: { system_tool_fn: string; step_order: number; next_tool?: string; feedback_step?: boolean }, context?: string): NextStepInstruction {
        const stepId = this.extractStepId(nextStep.system_tool_fn);
        
        // Template mappings for different step types
        const stepTemplates = {
            validate: "Continue with validation step to ensure all requirements are met",
            create: "Proceed to creation step to finalize and save the changes",
            confirm: "Confirm the changes before they are applied to your workspace",
            analyze: "Analyze the current state to identify key areas for improvement",
            plan: "Create a detailed plan based on the analysis results",
            implement: "Execute the planned changes and updates",
            detailed: "Generate detailed information for comprehensive overview",
            recommendations: "Get personalized recommendations based on current state",
            rules: "Review and apply workspace rules and guidelines"
        };

        const stepDescription = stepTemplates[stepId as keyof typeof stepTemplates] 
            || `Continue with the ${stepId} step`;

        let instructionText = `Call \`${toolName}\` with \`stepId='${stepId}'\` to ${stepDescription}.`;
        
        if (context) {
            instructionText += ` Context: ${context}`;
        }

        if (nextStep.feedback_step) {
            instructionText += ` Note: This step includes user feedback collection.`;
        }

        return {
            instructionText,
            toolName,
            stepId,
            context
        };
    }

    private extractStepId(systemToolFn: string): string {
        // Extract stepId from system_tool_fn like "specly_add:validate"
        const parts = systemToolFn.split(':');
        return parts.length > 1 ? parts[1] : 'initial';
    }
}

export default NextStepTemplateGenerator;
