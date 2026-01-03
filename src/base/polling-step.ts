import type { StepMetadata } from "./base-step";
import { BaseStep } from "./base-step";
import type {
  ApprovalContext,
  PollOutput,
  StepOutput,
  TriggerOutput,
} from "../output/step-output";

/**
 * A polling step for long-running operations that need status checks.
 *
 * Users extend this class and implement:
 * - `trigger(params)` - Start the operation, return initial polling state
 * - `poll(params, pollingState)` - Check status, return POLL_AGAIN, SUCCESS, or FAILED
 *
 * Optionally override `prepare` to require approval before triggering.
 *
 * Steps can accept constructor parameters for dependency injection.
 *
 * @typeParam TParams - The input parameters type (validated by schema)
 * @typeParam TPollingState - The polling state type passed between poll calls
 *
 * @example
 * ```typescript
 * type JobParams = { target: string };
 * type JobPollingState = { jobId: string; startedAt: number };
 *
 * @Step({ name: "Long Job", type: "long-job", schema: jobSchema })
 * class LongJobStep extends PollingStep<JobParams, JobPollingState> {
 *   constructor(private jobService: JobService) {
 *     super();
 *   }
 *
 *   async trigger(params: JobParams): Promise<TriggerOutput<JobPollingState>> {
 *     const jobId = await this.jobService.start(params);
 *     return StepOutputs.triggered({ jobId, startedAt: Date.now() });
 *   }
 *
 *   async poll(params: JobParams, state: JobPollingState): Promise<PollOutput<JobPollingState>> {
 *     const status = await this.jobService.checkStatus(state.jobId);
 *     if (status === "running") {
 *       return StepOutputs.pollAgain(state, 5000);
 *     }
 *     return StepOutputs.success({ result: status });
 *   }
 * }
 *
 * // Register with dependency injected
 * StepRegistry.run([new LongJobStep(jobService)]);
 * ```
 *
 * @example With approval
 * ```typescript
 * @Step({ name: "Dangerous Job", type: "dangerous-job", schema: dangerousSchema })
 * class DangerousJobStep extends PollingStep<DangerousParams, DangerousPollingState> {
 *   constructor(private jobService: JobService) {
 *     super();
 *   }
 *
 *   async prepare(params: DangerousParams): Promise<PrepareOutput> {
 *     return StepOutputs.approvalRequired({
 *       message: `Run dangerous job on ${params.target}?`,
 *     });
 *   }
 *
 *   async trigger(params: DangerousParams, approval: ApprovalContext): Promise<TriggerOutput<DangerousPollingState>> {
 *     const jobId = await this.jobService.startDangerous(params);
 *     return StepOutputs.triggered({ jobId });
 *   }
 *
 *   async poll(params: DangerousParams, state: DangerousPollingState): Promise<PollOutput<DangerousPollingState>> {
 *     const status = await this.jobService.checkStatus(state.jobId);
 *     if (status === "running") {
 *       return StepOutputs.pollAgain(state, 5000);
 *     }
 *     return StepOutputs.success();
 *   }
 * }
 * ```
 */
export abstract class PollingStep<
  TParams,
  TPollingState extends Record<string, unknown> = Record<string, unknown>
> extends BaseStep<TParams> {
  /**
   * Start the long-running operation.
   * @param params - The validated input parameters
   * @param approval - Approval context if this step requires approval (has prepare method)
   * @returns TRIGGERED with initial polling state, or FAILED
   */
  abstract trigger(
    params: TParams,
    approval?: ApprovalContext
  ): Promise<TriggerOutput<TPollingState>>;

  /**
   * Check the status of the operation.
   * @param params - The original input parameters
   * @param pollingState - State from previous trigger() or poll() call
   * @returns POLL_AGAIN with updated state, SUCCESS, or FAILED
   */
  abstract poll(
    params: TParams,
    pollingState: TPollingState
  ): Promise<PollOutput<TPollingState>>;

  /**
   * Called by the registry to execute the trigger phase.
   * @internal
   */
  async executeTrigger(
    params: TParams,
    approval?: ApprovalContext
  ): Promise<StepOutput> {
    return this.trigger(params, approval);
  }

  /**
   * Called by the registry to execute the poll phase.
   * @internal
   */
  async executePoll(
    params: TParams,
    pollingState: TPollingState
  ): Promise<StepOutput> {
    return this.poll(params, pollingState);
  }

  getMetadata(): StepMetadata {
    throw new Error(
      "getMetadata not implemented. Did you forget to add the @Step decorator?"
    );
  }
}
