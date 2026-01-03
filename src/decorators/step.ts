import type { ZodType, z } from "zod";
import type { StepKind, StepMetadata } from "../base/base-step";
import { BaseStep } from "../base/base-step";

export interface StepConfig<S extends ZodType> {
  name: string;
  type: string;
  schema: S;
}

/**
 * Decorator that adds metadata to a step class.
 * This is required for all steps to be registered with StepRegistry.
 *
 * The decorated class must extend SimpleStep or PollingStep.
 *
 * @example
 * ```typescript
 * @Step({ name: "My Step", type: "my-step", schema: mySchema })
 * class MyStep extends SimpleStep<MyParams> {
 *   async run(params: MyParams): Promise<RunOutput> {
 *     return StepOutputs.success();
 *   }
 * }
 * ```
 */
export function Step<S extends ZodType>(config: StepConfig<S>) {
  return function <T extends new (...args: any[]) => BaseStep<z.infer<S>>>(
    Base: T
  ): T {
    const Enhanced = class extends Base {
      override getMetadata(): StepMetadata<S> {
        // Detect step kind by checking for PollingStep methods
        const hasPollingMethods =
          "trigger" in this &&
          typeof (this as any).trigger === "function" &&
          "poll" in this &&
          typeof (this as any).poll === "function";

        const stepKind: StepKind = hasPollingMethods ? "polling" : "simple";

        // Check if prepare is overridden (not the default BaseStep.prepare)
        const requiresApproval = this.prepare !== BaseStep.prototype.prepare;

        return {
          type: config.type,
          name: config.name,
          schema: config.schema,
          stepKind,
          requiresApproval,
        };
      }
    };

    return Enhanced as T;
  };
}
