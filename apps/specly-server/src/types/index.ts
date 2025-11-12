
export interface SpeclyToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
