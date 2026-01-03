import type { ZodType } from "zod";
import type { StepLogger } from "../logging/step-logger";
import { NoOpLogger } from "../logging/step-logger";
import type { PrepareOutput } from "../output/step-output";
import { StepOutputs } from "../output/step-output";
import type { ZodStandardJSONSchemaPayload } from "zod/v4/core";

export type StepKind = "simple" | "polling";

export interface StepData<S extends ZodType = ZodType> {
  schema: S;
  stepType: string;
  stepKind: StepKind;
  requiresApproval: boolean;
}

export interface StepMetadata<S extends ZodType = ZodType> {
  name?: string;
  shortDescription?: string;
  longDescription?: string;
  yamlExample?: string;
  stepType: string;
  paramsJsonSchema: ZodStandardJSONSchemaPayload<S>;
  documentationUrl?: string;
}

/**
 * Base class for all steps.
 * Provides logging and common functionality.
 */
export abstract class BaseStep<TParams = unknown> {
  protected logger: StepLogger = new NoOpLogger();

  /**
   * Called by the registry to inject the logger before execution.
   * @internal
   */
  _setLogger(logger: StepLogger): void {
    this.logger = logger;
  }

  /**
   * Returns metadata about this step.
   * Implemented by the @Step decorator.
   */
  getMetadata(): StepMetadata {
    throw new Error(
      "getMetadata not implemented. Did you forget to add the @Step decorator?"
    );
  }

  getData(): StepData {
    throw new Error(
      "getData not implemented. Did you forget to add the @Step decorator?"
    );
  }

  /**
   * Optional prepare method for approval flow.
   * Override this to require approval before execution.
   * If not overridden, the step will not require approval.
   */
  async prepare(_params: TParams): Promise<PrepareOutput> {
    // Default: no approval required - this should never be called
    // The registry checks if prepare is overridden before calling it
    return StepOutputs.failed(
      "prepare() called but not implemented",
      "PREPARE_NOT_IMPLEMENTED"
    );
  }
}
