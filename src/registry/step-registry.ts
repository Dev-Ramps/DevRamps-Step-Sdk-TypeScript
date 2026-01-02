import * as fs from "fs";
import * as path from "path";
import minimist from "minimist";
import z from "zod";
import type { BaseStep, StepClass, StepMetadata } from "../base/base-step";
import type { SimpleStep } from "../base/simple-step";
import type { PollingStep } from "../base/polling-step";
import { StepLogger } from "../logging/step-logger";
import type {
  ApprovalContext,
  StepOutput} from "../output/step-output";
import {
  ApprovalContextSchema,
  StepOutputs,
} from "../output/step-output";

// =============================================================================
// Input Schemas
// =============================================================================

const StepRegistrySynthesizeSchema = z.object({
  job: z.literal("SYNTHESIZE-METADATA"),
});

const StepRegistryExecuteSchema = z.object({
  job: z.literal("EXECUTE"),
  type: z.string(),
  params: z.record(z.string(), z.any()),
  // Optional context - presence determines which phase to run
  approvalContext: ApprovalContextSchema.optional(),
  pollingState: z.record(z.string(), z.any()).optional(),
});

export const StepRegistryInputSchema = z.discriminatedUnion("job", [
  StepRegistryExecuteSchema,
  StepRegistrySynthesizeSchema,
]);

export type StepRegistryInput = z.infer<typeof StepRegistryInputSchema>;

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_OUTPUT_PATH = "/tmp/step-output.json";
const DEFAULT_LOG_DIR = "/tmp/step-logs";

// =============================================================================
// StepRegistry
// =============================================================================

export class StepRegistry {
  private steps: Map<string, StepClass>;
  private outputPath: string;
  private logDir: string;
  private executionId: string;

  private constructor(
    steps: StepClass[],
    outputPath: string,
    logDir: string,
    executionId: string
  ) {
    this.steps = new Map();
    this.outputPath = outputPath;
    this.logDir = logDir;
    this.executionId = executionId;

    for (const StepCls of steps) {
      const instance = new StepCls();
      const metadata = instance.getMetadata();
      this.steps.set(metadata.type, StepCls);
    }
  }

  /**
   * Main entrypoint for running steps.
   * Parses CLI args and either synthesizes metadata or executes a step.
   *
   * Usage in user's entrypoint file:
   * ```
   * StepRegistry.run([MyStep1, MyStep2, ...]);
   * ```
   *
   * CLI arguments:
   * - --input: JSON blob with job type and parameters
   * - --output: Path to write output JSON (default: /tmp/step-output.json)
   * - --log-dir: Directory for log files (default: /tmp/step-logs)
   * - --execution-id: Unique ID for this execution (required for logging)
   */
  static async run(steps: StepClass[]): Promise<void> {
    const args = minimist(process.argv.slice(2));
    const outputPath = args["output"] || DEFAULT_OUTPUT_PATH;
    const logDir = args["log-dir"] || DEFAULT_LOG_DIR;
    const executionId = args["execution-id"] || `exec-${Date.now()}`;

    const registry = new StepRegistry(steps, outputPath, logDir, executionId);
    await registry.execute(args);
  }

  private async execute(args: minimist.ParsedArgs): Promise<void> {
    try {
      const input = StepRegistryInputSchema.parse(JSON.parse(args["input"]));

      switch (input.job) {
        case "SYNTHESIZE-METADATA": {
          const metadata = this.synthesizeMetadata();
          this.writeOutput({ status: "SUCCESS", data: { metadata } });
          break;
        }

        case "EXECUTE": {
          await this.executeStep(
            input.type,
            input.params,
            input.approvalContext,
            input.pollingState
          );
          break;
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.writeOutput(StepOutputs.failed(errorMessage, "REGISTRY_ERROR"));
    }
  }

  private synthesizeMetadata(): StepMetadata[] {
    const metadata: StepMetadata[] = [];

    for (const StepCls of this.steps.values()) {
      const instance = new StepCls();
      metadata.push(instance.getMetadata());
    }

    return metadata;
  }

  private async executeStep(
    type: string,
    params: Record<string, unknown>,
    approvalContext?: ApprovalContext,
    pollingState?: Record<string, unknown>
  ): Promise<void> {
    const StepCls = this.steps.get(type);

    if (!StepCls) {
      this.writeOutput(
        StepOutputs.failed(`No step registered with type: ${type}`, "STEP_NOT_FOUND")
      );
      return;
    }

    try {
      const instance = new StepCls();
      const metadata = instance.getMetadata();

      // Inject logger
      const logger = new StepLogger({
        logDir: this.logDir,
        executionId: this.executionId,
        stepType: metadata.type,
      });
      instance._setLogger(logger);

      // Validate params against the step's schema
      const parseResult = metadata.schema.safeParse(params);
      if (!parseResult.success) {
        this.writeOutput(
          StepOutputs.failed(
            `Invalid params: ${parseResult.error.message}`,
            "INVALID_PARAMS"
          )
        );
        return;
      }

      const validatedParams = parseResult.data;

      // Route to appropriate phase based on step kind and input context
      const output = await this.routeExecution(
        instance,
        metadata,
        validatedParams,
        approvalContext,
        pollingState
      );

      this.writeOutput(output);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.writeOutput(StepOutputs.failed(errorMessage, "EXECUTION_ERROR"));
    }
  }

  private async routeExecution(
    instance: BaseStep<unknown>,
    metadata: StepMetadata,
    params: unknown,
    approvalContext?: ApprovalContext,
    pollingState?: Record<string, unknown>
  ): Promise<StepOutput> {
    const requiresApproval = metadata.requiresApproval;

    if (metadata.stepKind === "simple") {
      return this.routeSimpleStep(
        instance as SimpleStep<unknown>,
        params,
        requiresApproval,
        approvalContext
      );
    }

    if (metadata.stepKind === "polling") {
      return this.routePollingStep(
        instance as PollingStep<unknown, Record<string, unknown>>,
        params,
        requiresApproval,
        approvalContext,
        pollingState
      );
    }

    return StepOutputs.failed(
      `Unknown step kind: ${metadata.stepKind}`,
      "UNKNOWN_STEP_KIND"
    );
  }

  /**
   * Route SimpleStep execution based on approval state.
   *
   * | requiresApproval | approvalContext provided? | Action              |
   * |------------------|---------------------------|---------------------|
   * | No               | -                         | Call run(params)    |
   * | Yes              | No                        | Call prepare(params)|
   * | Yes              | Yes                       | Call run(params, approval) |
   */
  private async routeSimpleStep(
    instance: SimpleStep<unknown>,
    params: unknown,
    requiresApproval: boolean,
    approvalContext?: ApprovalContext
  ): Promise<StepOutput> {
    if (!requiresApproval) {
      // No approval needed - just run
      return instance.execute(params, undefined);
    }

    if (!approvalContext) {
      // Needs approval but don't have it yet - call prepare
      return instance.prepare(params);
    }

    // Have approval - run with approval context
    return instance.execute(params, approvalContext);
  }

  /**
   * Route PollingStep execution based on approval and polling state.
   *
   * | requiresApproval | approvalContext? | pollingState? | Action                        |
   * |------------------|------------------|---------------|-------------------------------|
   * | No               | -                | No            | Call trigger(params)          |
   * | No               | -                | Yes           | Call poll(params, pollingState)|
   * | Yes              | No               | No            | Call prepare(params)          |
   * | Yes              | Yes              | No            | Call trigger(params, approval)|
   * | Yes              | Yes              | Yes           | Call poll(params, pollingState)|
   */
  private async routePollingStep(
    instance: PollingStep<unknown, Record<string, unknown>>,
    params: unknown,
    requiresApproval: boolean,
    approvalContext?: ApprovalContext,
    pollingState?: Record<string, unknown>
  ): Promise<StepOutput> {
    // If we have polling state, we're in the poll phase (regardless of approval)
    if (pollingState) {
      return instance.executePoll(params, pollingState);
    }

    if (!requiresApproval) {
      // No approval needed - trigger directly
      return instance.executeTrigger(params, undefined);
    }

    if (!approvalContext) {
      // Needs approval but don't have it yet - call prepare
      return instance.prepare(params);
    }

    // Have approval - trigger with approval context
    return instance.executeTrigger(params, approvalContext);
  }

  private writeOutput(output: StepOutput): void {
    const outputDir = path.dirname(this.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(this.outputPath, JSON.stringify(output, null, 2));
  }
}
