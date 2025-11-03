# Standard Development Rules (from SWE-agent)

## Core Principles

1. **Analytical Rigor**: Apply the Analytical Thinking Framework to all technical decisions and requirements
2. **Test-Driven Approach**: Decompose work into individually testable units
3. **Pure Functionality**: Favor pure functions with clear inputs and outputs
4. **Incremental Progress**: Structure tasks to deliver incremental value
5. **Code Reuse**: Always audit existing codebase before creating new implementations
6. **Documentation Consistency**: Keep all `./.task/` documents synchronized
7. **Adaptive Learning**: Continuously refine workspace rules based on user interactions

## Analytical Thinking Framework

Apply rigorous rational analysis to all technical decisions and requirements:

### ANALYSIS PROTOCOL

1. **Logical Consistency**: Evaluate statements for internal coherence and contradictions
2. **Evidence Quality**: Assess the strength and reliability of supporting data/reasoning
3. **Hidden Assumptions**: Identify unstated premises that may affect outcomes
4. **Cognitive Biases**: Detect emotional reasoning, confirmation bias, or wishful thinking
5. **Causal Relationships**: Verify claimed cause-and-effect relationships are valid
6. **Alternative Perspectives**: Consider competing explanations or approaches

### RESPONSE FRAMEWORK

- **Constructive Challenge**: Point out flaws clearly with "I notice..." statements
- **Evidence-Based Reasoning**: Require concrete justification for technical decisions
- **Assumption Validation**: Question the source and validity of beliefs/requirements
- **Steel-Manning**: Encourage exploring the strongest version of opposing views
- **Intellectual Honesty**: Reward self-correction and acknowledge strong reasoning

### APPLICATION AREAS

- Requirements analysis and validation
- Technical architecture decisions
- Task decomposition and priority assessment
- Code review and implementation choices
- Rule evolution and workspace guidelines

## Workflow Protocols

### Starting Work
- Review all three core documents (`./.task/project.md`, both rules files)
- Check existing codebase to avoid duplication
- Verify implementation plan follows established rules

### Implementation
- **Existing code**: Minimal, targeted changes using TDD principles
- **New features**: Follow documented technology stack and rules

### Task Completion
- Run linters and relevant unit tests
- Update task status only when all checks pass
- Update project documentation with technical details
- Create git commit with **concise message** (max 72 chars first line, Task ID in body)
- Move completed task to done file (only when user explicitly requests)

### Rules Evolution
- Automatically identify user preference patterns
- Update workspace rules without explicit commands
- Ensure project consistency through rule application

## File Organization

### Structure Rules
- Split files by unit task
- Split code files (src + tests) exceeding 300 lines into category-based files
- Use max 3-word descriptive file names
- Soft remove old files to `./.old` folder

## Task Management System

### Task Structure
Each task follows this format:

```text
## Task ID: [Unique Identifier]
- **Title**: [Concise description]
- **Description**: [Detailed explanation including acceptance criteria]
- **Priority**: [High/Medium/Low]
- **Dependencies**: [List of Task IDs this task depends on, if any]
- **Status**: [Backlog/In-Progress/Blocked/Review/Done/Dropped]
- **Progress**: [0-100%]
- **Notes**: [Additional information, challenges, or implementation details]
- **Connected File List**: [List of comma separated relative file paths - updated/created for this task]
```

### Completion Workflow
- Run linters and ONLY relevant unit tests after task completion
- Mark 100% complete only when lint and unit tests pass
- Update `./.task/todo/current.md` (do NOT auto-move to done file)
- Create git commit with **concise message** (max 72 chars first line, detailed body with Task IDs)
- Format: `type: brief summary\n\nTask ID: SP-XXX\nDetails...`
- Subtasks follow same format and link to parent task

### Final Project Completion
- Create/update root `README.md` professionally
- Rerun all tests
- Remove unnecessary temporary files/docs/src

## Response Format

1. Confirm review of `./.task/project.md` and both rules files
2. State current task title and status
3. Provide implementation details or recommendations
4. Update relevant task documents
5. Suggest next steps or ask clarifying questions
6. Note any new rules added to `workspace_rules.md`
