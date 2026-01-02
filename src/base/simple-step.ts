import type { StepMetadata } from "./base-step";
import { BaseStep } from "./base-step";
import type { ApprovalContext, RunOutput, StepOutput } from "../output/step-output";

/**
 * A simple step that runs once with the provided params.
 *
 * Users extend this class and implement the `run` method.
 * Optionally override `prepare` to require approval before execution.
 *
 * @example
 * ```typescript
 * @Step({ name: "Deploy", type: "deploy", schema: deploySchema })
 * class DeployStep extends SimpleStep<DeployParams> {
 *   async run(params: DeployParams): Promise<RunOutput> {
 *     this.logger.info("Deploying", { target: params.target });
 *     return StepOutputs.success({ deploymentId: "123" });
 *   }
 * }
 * ```
 *
 * @example With approval
 * ```typescript
 * @Step({ name: "Delete User", type: "delete-user", schema: deleteUserSchema })
 * class DeleteUserStep extends SimpleStep<DeleteUserParams> {
 *   async prepare(params: DeleteUserParams): Promise<PrepareOutput> {
 *     return StepOutputs.approvalRequired({
 *       message: `Delete user ${params.userId}?`,
 *     });
 *   }
 *
 *   async run(params: DeleteUserParams, approval: ApprovalContext): Promise<RunOutput> {
 *     this.logger.info("Deleting user", { approvedBy: approval.approverId });
 *     return StepOutputs.success();
 *   }
 * }
 * ```
 */
export abstract class SimpleStep<TParams> extends BaseStep<TParams> {
  /**
   * Execute the step logic.
   * @param params - The validated input parameters
   * @param approval - Approval context if this step requires approval (has prepare method)
   */
  abstract run(params: TParams, approval?: ApprovalContext): Promise<RunOutput>;

  /**
   * Called by the registry to execute this step.
   * @internal
   */
  async execute(params: TParams, approval?: ApprovalContext): Promise<StepOutput> {
    return this.run(params, approval);
  }

  getMetadata(): StepMetadata {
    throw new Error(
      "getMetadata not implemented. Did you forget to add the @Step decorator?"
    );
  }
}
