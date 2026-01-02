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

  async run(params: EchoParams, approval?: ApprovalContext): Promise<RunOutput> {
    return StepOutputs.success({
      echo: params.message,
      approvedBy: approval?.approverId,
    });
  }
}

@Step({ name: "Deploy", type: "deploy", schema: DeploySchema })
class DeployStep extends PollingStep<DeployParams, DeployPollingState> {
  async trigger(params: DeployParams): Promise<TriggerOutput<DeployPollingState>> {
    return StepOutputs.triggered({
      deploymentId: `deploy-${params.target}-${params.version}`,
      pollCount: 0,
    });
  }

  async poll(_params: DeployParams, state: DeployPollingState): Promise<PollOutput<DeployPollingState>> {
    if (state.pollCount < 2) {
      return StepOutputs.pollAgain({
        ...state,
        pollCount: state.pollCount + 1,
      }, 1000);
    }
    return StepOutputs.success({ deploymentId: state.deploymentId, status: "complete" });
  }
}

@Step({ name: "Approval Deploy", type: "approval-deploy", schema: DeploySchema })
class ApprovalDeployStep extends PollingStep<DeployParams, DeployPollingState> {
  override async prepare(params: DeployParams): Promise<PrepareOutput> {
    return StepOutputs.approvalRequired({
      message: `Approve deployment to ${params.target}?`,
    });
  }

  async trigger(params: DeployParams, approval?: ApprovalContext): Promise<TriggerOutput<DeployPollingState>> {
    return StepOutputs.triggered({
      deploymentId: `deploy-${params.target}-approved-by-${approval?.approverId}`,
      pollCount: 0,
    });
  }

  async poll(_params: DeployParams, state: DeployPollingState): Promise<PollOutput<DeployPollingState>> {
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
    expect(metadata.type).toBe("echo");
    expect(metadata.stepKind).toBe("simple");
    expect(metadata.requiresApproval).toBe(false);
  });

  it("ApprovalEchoStep has correct metadata", () => {
    const step = new ApprovalEchoStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Approval Echo");
    expect(metadata.type).toBe("approval-echo");
    expect(metadata.stepKind).toBe("simple");
    expect(metadata.requiresApproval).toBe(true);
  });

  it("DeployStep has correct metadata", () => {
    const step = new DeployStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Deploy");
    expect(metadata.type).toBe("deploy");
    expect(metadata.stepKind).toBe("polling");
    expect(metadata.requiresApproval).toBe(false);
  });

  it("ApprovalDeployStep has correct metadata", () => {
    const step = new ApprovalDeployStep();
    const metadata = step.getMetadata();

    expect(metadata.name).toBe("Approval Deploy");
    expect(metadata.type).toBe("approval-deploy");
    expect(metadata.stepKind).toBe("polling");
    expect(metadata.requiresApproval).toBe(true);
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
        expect(result.approvalRequest.message).toBe("Approve echo: sensitive action");
      }
    });

    it("executes with approval context", async () => {
      const step = new ApprovalEchoStep();
      const approval: ApprovalContext = {
        approved: true,
        approverId: "admin-user",
      };
      const result = await step.execute({ message: "approved action" }, approval);

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
        expect(result.approvalRequest.message).toBe("Approve deployment to production?");
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
