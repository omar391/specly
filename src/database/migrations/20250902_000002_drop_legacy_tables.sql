-- SP-001 Drastic migration: drop legacy TaskPilot tables
BEGIN TRANSACTION;
DROP TABLE IF EXISTS tool_flow_steps;
DROP TABLE IF EXISTS tool_flows;
DROP TABLE IF EXISTS feedback_steps;
DROP TABLE IF EXISTS workspace_tool_flows;
DROP TABLE IF EXISTS workspace_feedback_steps;
COMMIT;
