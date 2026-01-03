import { type ZodType, z } from "zod";
import type { StepData, StepKind, StepMetadata } from "../base/base-step";
import { BaseStep } from "../base/base-step";

export interface StepConfig<S extends ZodType = ZodType> {
  name?: string;
  type: string;
  shortDescription?: string;
  longDescription?: string;
  yamlExample?: string;
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
 *   constructor(private apiClient: ApiClient) {
 *     super();
 *   }
 *
 *   async run(params: MyParams): Promise<RunOutput> {
 *     await this.apiClient.doSomething();
 *     return StepOutputs.success();
 *   }
 * }
 *
 * // Register with dependencies injected
 * StepRegistry.run([new MyStep(apiClient)]);
 * ```
 */
export function Step<S extends ZodType>(config: StepConfig<S>) {
  return function <T extends new (...args: any[]) => BaseStep<z.infer<S>>>(
    Base: T
  ): T {
    const Enhanced = class extends Base {
      override getMetadata(): StepMetadata<S> {
        return {
          name: config.name,
          stepType: config.type,
          shortDescription: config.shortDescription,
          longDescription: config.longDescription,
          yamlExample: config.yamlExample,
          paramsJsonSchema: z.toJSONSchema(config.schema),
        };
      }

      override getData(): StepData<S> {
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
          stepType: config.type,
          schema: config.schema,
          stepKind,
          requiresApproval,
        };
      }
    };

    return Enhanced as T;
  };
}
