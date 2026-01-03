import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import { z } from "zod";
import { Step } from "../src/decorators/step";
import { SimpleStep } from "../src/base/simple-step";
import { PollingStep } from "../src/base/polling-step";
import {
  StepOutputs,
  type RunOutput,
  type TriggerOutput,
  type PollOutput,
  type PrepareOutput,
  type ApprovalContext,
} from "../src/output/step-output";
import { StepRegistryInputSchema } from "../src/registry/step-registry";

// Test schemas
const EchoSchema = z.object({
  message: z.string(),
});

const DeploySchema = z.object({
  target: z.string(),
  version: z.string(),
});

type EchoParams = z.infer<typeof EchoSchema>;
type DeployParams = z.infer<typeof DeploySchema>;

type DeployPollingState = {
  deploymentId: string;
  pollCount: number;
};

// Test steps
@Step({ name: "Echo", type: "echo", schema: EchoSchema })
class EchoStep extends SimpleStep<EchoParams> {
  async run(params: EchoParams): Promise<RunOutput> {
    return StepOutputs.success({ echo: params.message });
  }
}

@Step({ name: "Approval Echo", type: "approval-echo", schema: EchoSchema })
class ApprovalEchoStep extends SimpleStep<EchoParams> {
  override async prepare(params: EchoParams): Promise<PrepareOutput> {
    return StepOutputs.approvalRequired({
      message: `Approve echo: ${params.message}`,
    });
  }

  async run(
    params: EchoParams,
    approval?: ApprovalContext
  ): Promise<RunOutput> {
    return StepOutputs.success({
      echo: params.message,
      approvedBy: approval?.approverId,
    });
  }
}

@Step({ name: "Deploy", type: "deploy", schema: DeploySchema })
class DeployStep extends PollingStep<DeployParams, DeployPollingState> {
  async trigger(
    params: DeployParams
  ): Promise<TriggerOutput<DeployPollingState>> {
    return StepOutputs.triggered({
      deploymentId: `deploy-${params.target}-${params.version}`,
      pollCount: 0,
    });
  }

  async poll(
    _params: DeployParams,
    state: DeployPollingState
  ): Promise<PollOutput<DeployPollingState>> {
    if (state.pollCount < 2) {
      return StepOutputs.pollAgain(
        {
          ...state,
          pollCount: state.pollCount + 1,
        },
        1000
      );
    }
    return StepOutputs.success({
      deploymentId: state.deploymentId,
      status: "complete",
    });
  }
}

@Step({
  name: "Approval Deploy",
  type: "approval-deploy",
  schema: DeploySchema,
})
class ApprovalDeployStep extends PollingStep<DeployParams, DeployPollingState> {
  override async prepare(params: DeployParams): Promise<PrepareOutput> {
    return StepOutputs.approvalRequired({
      message: `Approve deployment to ${params.target}?`,
    });
  }

  async trigger(
    params: DeployParams,
    approval?: ApprovalContext
  ): Promise<TriggerOutput<DeployPollingState>> {
    return StepOutputs.triggered({
      deploymentId: `deploy-${params.target}-approved-by-${approval?.approverId}`,
      pollCount: 0,
    });
  }

  async poll(
    _params: DeployParams,
    state: DeployPollingState
  ): Promise<PollOutput<DeployPollingState>> {
    return StepOutputs.success({ deploymentId: state.deploymentId });
  }
}

describe("StepRegistryInputSchema", () => {
  describe("SYNTHESIZE-METADATA job", () => {
    it("validates synthesize metadata input", () => {
      const input = { job: "SYNTHESIZE-METADATA" };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });
  });

  describe("EXECUTE job", () => {
    it("validates execute input without approval or polling", () => {
      const input = {
        job: "EXECUTE",
        type: "echo",
        params: { message: "hello" },
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("validates execute input with approval context", () => {
      const input = {
        job: "EXECUTE",
        type: "approval-echo",
        params: { message: "hello" },
        approvalContext: {
          approved: true,
          approverId: "user-123",
        },
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("validates execute input with polling state", () => {
      const input = {
        job: "EXECUTE",
        type: "deploy",
        params: { target: "production", version: "1.0.0" },
        pollingState: {
          deploymentId: "deploy-123",
          pollCount: 1,
        },
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("validates execute input with both approval and polling state", () => {
      const input = {
        job: "EXECUTE",
        type: "approval-deploy",
        params: { target: "production", version: "1.0.0" },
        approvalContext: {
          approved: true,
          approverId: "admin-1",
        },
        pollingState: {
          deploymentId: "deploy-123",
          pollCount: 0,
        },
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(true);
    });

    it("rejects execute input with invalid approval context", () => {
      const input = {
        job: "EXECUTE",
        type: "echo",
        params: { message: "hello" },
        approvalContext: {
          approved: false, // Must be true
          approverId: "user-123",
        },
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it("rejects execute input with missing required fields", () => {
      const input = {
        job: "EXECUTE",
        // Missing type and params
      };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe("invalid job types", () => {
    it("rejects invalid job type", () => {
      const input = { job: "INVALID" };
      const result = StepRegistryInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });
});

describe("Step metadata extraction", () => {
  it("EchoStep has correct metadata", () => {
    const step = new EchoStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Echo");
    expect(metadata.stepType).toBe("echo");
    expect(metadata.paramsJsonSchema).toBeDefined();
  });

  it("ApprovalEchoStep has correct metadata", () => {
    const step = new ApprovalEchoStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Approval Echo");
    expect(metadata.stepType).toBe("approval-echo");
  });

  it("DeployStep has correct metadata", () => {
    const step = new DeployStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Deploy");
    expect(metadata.stepType).toBe("deploy");
  });

  it("ApprovalDeployStep has correct metadata", () => {
    const step = new ApprovalDeployStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Approval Deploy");
    expect(metadata.stepType).toBe("approval-deploy");
  });

  describe("metadata with optional fields", () => {
    const TestSchema = z.object({ value: z.string() });

    @Step({
      name: "Documented Step",
      type: "documented-step",
      schema: TestSchema,
      shortDescription: "Short description",
      longDescription: "Long description with more details",
      yamlExample: "type: documented-step\nparams:\n  value: test",
    })
    class DocumentedStep extends SimpleStep<z.infer<typeof TestSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("includes all optional metadata fields", () => {
      const step = new DocumentedStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBe("Documented Step");
      expect(metadata.stepType).toBe("documented-step");
      expect(metadata.shortDescription).toBe("Short description");
      expect(metadata.longDescription).toBe(
        "Long description with more details"
      );
      expect(metadata.yamlExample).toBe(
        "type: documented-step\nparams:\n  value: test"
      );
      expect(metadata.paramsJsonSchema).toBeDefined();
      expect(metadata.paramsJsonSchema.type).toBe("object");
    });

    @Step({
      type: "minimal-step",
      schema: TestSchema,
    })
    class MinimalStep extends SimpleStep<z.infer<typeof TestSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("handles steps with minimal metadata", () => {
      const step = new MinimalStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBeUndefined();
      expect(metadata.stepType).toBe("minimal-step");
      expect(metadata.shortDescription).toBeUndefined();
      expect(metadata.longDescription).toBeUndefined();
      expect(metadata.yamlExample).toBeUndefined();
      expect(metadata.paramsJsonSchema).toBeDefined(); // jsonSchema is always generated
    });
  });
});

describe("Step execution", () => {
  describe("SimpleStep", () => {
    it("executes without approval", async () => {
      const step = new EchoStep();
      const result = await step.execute({ message: "hello world" });

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({ echo: "hello world" });
      }
    });

    it("returns approval required from prepare", async () => {
      const step = new ApprovalEchoStep();
      const result = await step.prepare({ message: "sensitive action" });

      expect(result.status).toBe("APPROVAL_REQUIRED");
      if (result.status === "APPROVAL_REQUIRED") {
        expect(result.approvalRequest.message).toBe(
          "Approve echo: sensitive action"
        );
      }
    });

    it("executes with approval context", async () => {
      const step = new ApprovalEchoStep();
      const approval: ApprovalContext = {
        approved: true,
        approverId: "admin-user",
      };
      const result = await step.execute(
        { message: "approved action" },
        approval
      );

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({
          echo: "approved action",
          approvedBy: "admin-user",
        });
      }
    });
  });

  describe("PollingStep", () => {
    it("triggers and returns polling state", async () => {
      const step = new DeployStep();
      const result = await step.executeTrigger({
        target: "staging",
        version: "2.0.0",
      });

      expect(result.status).toBe("TRIGGERED");
      if (result.status === "TRIGGERED") {
        expect(result.pollingState).toEqual({
          deploymentId: "deploy-staging-2.0.0",
          pollCount: 0,
        });
      }
    });

    it("polls and returns poll again", async () => {
      const step = new DeployStep();
      const result = await step.executePoll(
        { target: "staging", version: "2.0.0" },
        { deploymentId: "deploy-staging-2.0.0", pollCount: 0 }
      );

      expect(result.status).toBe("POLL_AGAIN");
      if (result.status === "POLL_AGAIN") {
        expect(result.pollingState.pollCount).toBe(1);
        expect(result.retryAfterMs).toBe(1000);
      }
    });

    it("polls and returns success when complete", async () => {
      const step = new DeployStep();
      const result = await step.executePoll(
        { target: "staging", version: "2.0.0" },
        { deploymentId: "deploy-staging-2.0.0", pollCount: 2 }
      );

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({
          deploymentId: "deploy-staging-2.0.0",
          status: "complete",
        });
      }
    });

    it("returns approval required from prepare", async () => {
      const step = new ApprovalDeployStep();
      const result = await step.prepare({
        target: "production",
        version: "1.0.0",
      });

      expect(result.status).toBe("APPROVAL_REQUIRED");
      if (result.status === "APPROVAL_REQUIRED") {
        expect(result.approvalRequest.message).toBe(
          "Approve deployment to production?"
        );
      }
    });

    it("triggers with approval context", async () => {
      const step = new ApprovalDeployStep();
      const approval: ApprovalContext = {
        approved: true,
        approverId: "release-manager",
      };
      const result = await step.executeTrigger(
        { target: "production", version: "1.0.0" },
        approval
      );

      expect(result.status).toBe("TRIGGERED");
      if (result.status === "TRIGGERED") {
        expect(result.pollingState.deploymentId).toBe(
          "deploy-production-approved-by-release-manager"
        );
      }
    });
  });
});

describe("StepRegistry integration tests", () => {
  const TEST_OUTPUT_PATH = "/tmp/test-step-output.json";

  beforeEach(() => {
    // Clean up any existing output file
    if (fs.existsSync(TEST_OUTPUT_PATH)) {
      fs.unlinkSync(TEST_OUTPUT_PATH);
    }
  });

  afterEach(() => {
    // Clean up test output file
    if (fs.existsSync(TEST_OUTPUT_PATH)) {
      fs.unlinkSync(TEST_OUTPUT_PATH);
    }
  });

  describe("SYNTHESIZE-METADATA job", () => {
    it("writes metadata for all registered steps to output file", async () => {
      const { StepRegistry } = await import("../src/registry/step-registry");

      // Mock process.argv to simulate CLI input
      const originalArgv = process.argv;
      process.argv = [
        "node",
        "script.js",
        "--input",
        JSON.stringify({ job: "SYNTHESIZE-METADATA" }),
        "--output",
        TEST_OUTPUT_PATH,
      ];

      try {
        // Run the registry with our test steps
        await StepRegistry.run([
          new EchoStep(),
          new ApprovalEchoStep(),
          new DeployStep(),
          new ApprovalDeployStep(),
        ]);

        // Verify the output file was created
        expect(fs.existsSync(TEST_OUTPUT_PATH)).toBe(true);

        // Read and parse the output
        const outputContent = fs.readFileSync(TEST_OUTPUT_PATH, "utf-8");
        const output = JSON.parse(outputContent);

        // Validate top-level structure
        expect(output).toEqual({
          status: "SUCCESS",
          data: {
            metadata: expect.any(Array),
          },
        });

        // Validate metadata array
        const metadata = output.data.metadata;
        expect(metadata).toHaveLength(4);

        // Validate EchoStep metadata
        const echoMeta = metadata.find((m: any) => m.stepType === "echo");
        expect(echoMeta).toMatchObject({
          name: "Echo",
          stepType: "echo",
          paramsJsonSchema: expect.objectContaining({
            type: "object",
            properties: expect.objectContaining({
              message: expect.any(Object),
            }),
            required: ["message"],
          }),
        });

        // Validate ApprovalEchoStep metadata
        const approvalEchoMeta = metadata.find(
          (m: any) => m.stepType === "approval-echo"
        );
        expect(approvalEchoMeta).toMatchObject({
          name: "Approval Echo",
          stepType: "approval-echo",
        });

        // Validate DeployStep metadata
        const deployMeta = metadata.find((m: any) => m.stepType === "deploy");
        expect(deployMeta).toMatchObject({
          name: "Deploy",
          stepType: "deploy",
          paramsJsonSchema: expect.objectContaining({
            type: "object",
            properties: expect.objectContaining({
              target: expect.any(Object),
              version: expect.any(Object),
            }),
            required: ["target", "version"],
          }),
        });

        // Validate ApprovalDeployStep metadata
        const approvalDeployMeta = metadata.find(
          (m: any) => m.stepType === "approval-deploy"
        );
        expect(approvalDeployMeta).toMatchObject({
          name: "Approval Deploy",
          stepType: "approval-deploy",
        });
      } finally {
        process.argv = originalArgv;
      }
    });

    it("creates output directory if it doesn't exist", async () => {
      const { StepRegistry } = await import("../src/registry/step-registry");
      const NESTED_OUTPUT_PATH = "/tmp/test-nested/step-output.json";

      // Ensure the directory doesn't exist
      const dir = "/tmp/test-nested";
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }

      const originalArgv = process.argv;
      process.argv = [
        "node",
        "script.js",
        "--input",
        JSON.stringify({ job: "SYNTHESIZE-METADATA" }),
        "--output",
        NESTED_OUTPUT_PATH,
      ];

      try {
        await StepRegistry.run([new EchoStep()]);

        // Verify the directory and file were created
        expect(fs.existsSync(NESTED_OUTPUT_PATH)).toBe(true);

        const output = JSON.parse(fs.readFileSync(NESTED_OUTPUT_PATH, "utf-8"));
        expect(output.status).toBe("SUCCESS");
      } finally {
        process.argv = originalArgv;
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true });
        }
      }
    });
  });
});
