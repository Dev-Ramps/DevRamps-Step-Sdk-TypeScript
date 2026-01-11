import z from "zod";

// =============================================================================
// Approval Context (passed to steps after approval is granted)
// =============================================================================

export const ApprovalContextSchema = z.object({
  approved: z.literal(true),
  approverId: z.string(),
});

export type ApprovalContext = z.infer<typeof ApprovalContextSchema>;

// =============================================================================
// Shared Output Components
// =============================================================================

const FailedOutputSchema = z.object({
  status: z.literal("FAILED"),
  error: z.string(),
  errorCode: z.string().optional(),
});

const SuccessOutputSchema = z.object({
  status: z.literal("SUCCESS"),
  data: z.record(z.string(), z.any()).optional(),
});

export type FailedOutput = z.infer<typeof FailedOutputSchema>;
export type SuccessOutput = z.infer<typeof SuccessOutputSchema>;

// =============================================================================
// PrepareOutput (for approval flow - used by SimpleStep and PollingStep)
// =============================================================================

const ApprovalRequiredOutputSchema = z.object({
  status: z.literal("APPROVAL_REQUIRED"),
  approvalRequest: z.object({
    context: z.string().optional(),
  }),
});

export const PrepareOutputSchema = z.discriminatedUnion("status", [
  ApprovalRequiredOutputSchema,
  FailedOutputSchema,
]);

export type ApprovalRequiredOutput = z.infer<
  typeof ApprovalRequiredOutputSchema
>;
export type PrepareOutput = z.infer<typeof PrepareOutputSchema>;

// =============================================================================
// RunOutput (SimpleStep.run)
// =============================================================================

export const RunOutputSchema = z.discriminatedUnion("status", [
  SuccessOutputSchema,
  FailedOutputSchema,
]);

export type RunOutput = z.infer<typeof RunOutputSchema>;

// =============================================================================
// TriggerOutput (PollingStep.trigger)
// =============================================================================

const TriggeredOutputSchema = z.object({
  status: z.literal("TRIGGERED"),
  pollingState: z.record(z.string(), z.any()),
});

export const TriggerOutputSchema = z.discriminatedUnion("status", [
  TriggeredOutputSchema,
  FailedOutputSchema,
]);

export type TriggeredOutput<TPollingState = Record<string, unknown>> = {
  status: "TRIGGERED";
  pollingState: TPollingState;
};

export type TriggerOutput<TPollingState = Record<string, unknown>> =
  | TriggeredOutput<TPollingState>
  | FailedOutput;

// =============================================================================
// PollOutput (PollingStep.poll)
// =============================================================================

const PollAgainOutputSchema = z.object({
  status: z.literal("POLL_AGAIN"),
  pollingState: z.record(z.string(), z.any()),
  retryAfterMs: z.number().optional(),
});

export const PollOutputSchema = z.discriminatedUnion("status", [
  PollAgainOutputSchema,
  SuccessOutputSchema,
  FailedOutputSchema,
]);

export type PollAgainOutput<TPollingState = Record<string, unknown>> = {
  status: "POLL_AGAIN";
  pollingState: TPollingState;
  retryAfterMs?: number;
};

export type PollOutput<TPollingState = Record<string, unknown>> =
  | PollAgainOutput<TPollingState>
  | SuccessOutput
  | FailedOutput;

// =============================================================================
// Combined StepOutput (for registry to write to file)
// =============================================================================

export const StepOutputSchema = z.discriminatedUnion("status", [
  SuccessOutputSchema,
  FailedOutputSchema,
  ApprovalRequiredOutputSchema,
  TriggeredOutputSchema,
  PollAgainOutputSchema,
]);

export type StepOutput = z.infer<typeof StepOutputSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

export const StepOutputs = {
  // Success (used by SimpleStep.run and PollingStep.poll)
  success(data?: Record<string, unknown>): SuccessOutput {
    return { status: "SUCCESS", data };
  },

  // Failed (used by all phases)
  failed(error: string, errorCode?: string): FailedOutput {
    return { status: "FAILED", error, errorCode };
  },

  // Approval required (used by prepare phase)
  approvalRequired(request: { context?: string }): ApprovalRequiredOutput {
    return { status: "APPROVAL_REQUIRED", approvalRequest: request };
  },

  // Triggered (used by PollingStep.trigger)
  triggered<TPollingState>(
    pollingState: TPollingState
  ): TriggeredOutput<TPollingState> {
    return { status: "TRIGGERED", pollingState };
  },

  // Poll again (used by PollingStep.poll)
  pollAgain<TPollingState>(
    pollingState: TPollingState,
    retryAfterMs?: number
  ): PollAgainOutput<TPollingState> {
    return { status: "POLL_AGAIN", pollingState, retryAfterMs };
  },
};
