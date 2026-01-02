// =============================================================================
// Step SDK - Public API
// =============================================================================

// Base classes for creating steps
export { BaseStep, StepClass, StepMetadata, StepKind } from "./base/base-step";
export { SimpleStep } from "./base/simple-step";
export { PollingStep } from "./base/polling-step";

// Decorator for adding metadata to steps
export { Step, StepConfig } from "./decorators/step";

// Output types and helper functions
export {
  // Approval context
  ApprovalContext,
  ApprovalContextSchema,
  // Phase-specific outputs
  PrepareOutput,
  RunOutput,
  TriggerOutput,
  TriggeredOutput,
  PollOutput,
  PollAgainOutput,
  // Common outputs
  SuccessOutput,
  FailedOutput,
  ApprovalRequiredOutput,
  // Combined output type
  StepOutput,
  // Output schemas for validation
  PrepareOutputSchema,
  RunOutputSchema,
  TriggerOutputSchema,
  PollOutputSchema,
  StepOutputSchema,
  // Helper functions
  StepOutputs,
} from "./output/step-output";

// Registry for running steps
export { StepRegistry, StepRegistryInput, StepRegistryInputSchema } from "./registry/step-registry";

// Logging
export { StepLogger, StepLoggerConfig, LogEntry, LogLevel } from "./logging/step-logger";
