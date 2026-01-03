import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SimpleStep } from "../src/base/simple-step";
import { Step } from "../src/decorators/step";
import { StepOutputs, type RunOutput, type PrepareOutput, type ApprovalContext } from "../src/output/step-output";

const TestParamsSchema = z.object({
  message: z.string(),
});

type TestParams = z.infer<typeof TestParamsSchema>;

describe("SimpleStep", () => {
  describe("without decorator", () => {
    it("throws error when getMetadata is called", () => {
      class UnDecoratedStep extends SimpleStep<TestParams> {
        async run(params: TestParams): Promise<RunOutput> {
          return StepOutputs.success({ echo: params.message });
        }
      }

      const step = new UnDecoratedStep();
      expect(() => step.getMetadata()).toThrow(
        "getMetadata not implemented. Did you forget to add the @Step decorator?"
      );
    });
  });

  describe("with decorator", () => {
    @Step({ name: "Echo Step", type: "echo", schema: TestParamsSchema })
    class EchoStep extends SimpleStep<TestParams> {
      async run(params: TestParams): Promise<RunOutput> {
        return StepOutputs.success({ echo: params.message });
      }
    }

    it("returns correct metadata", () => {
      const step = new EchoStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBe("Echo Step");
      expect(metadata.stepType).toBe("echo");
      expect(metadata.stepKind).toBe("simple");
      expect(metadata.requiresApproval).toBe(false);
    });

    it("executes run method correctly", async () => {
      const step = new EchoStep();
      const result = await step.execute({ message: "hello" });

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({ echo: "hello" });
      }
    });
  });

  describe("with approval flow", () => {
    @Step({ name: "Approval Step", type: "approval", schema: TestParamsSchema })
    class ApprovalStep extends SimpleStep<TestParams> {
      override async prepare(params: TestParams): Promise<PrepareOutput> {
        return StepOutputs.approvalRequired({
          message: `Please approve: ${params.message}`,
        });
      }

      async run(params: TestParams, approval?: ApprovalContext): Promise<RunOutput> {
        if (approval) {
          return StepOutputs.success({
            message: params.message,
            approvedBy: approval.approverId,
          });
        }
        return StepOutputs.success({ message: params.message });
      }
    }

    it("detects requiresApproval when prepare is overridden", () => {
      const step = new ApprovalStep();
      const metadata = step.getMetadata();

      expect(metadata.requiresApproval).toBe(true);
    });

    it("returns approval required from prepare", async () => {
      const step = new ApprovalStep();
      const result = await step.prepare({ message: "test action" });

      expect(result.status).toBe("APPROVAL_REQUIRED");
      if (result.status === "APPROVAL_REQUIRED") {
        expect(result.approvalRequest.message).toBe("Please approve: test action");
      }
    });

    it("executes with approval context", async () => {
      const step = new ApprovalStep();
      const approval: ApprovalContext = {
        approved: true,
        approverId: "user-123",
      };

      const result = await step.execute({ message: "approved action" }, approval);

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({
          message: "approved action",
          approvedBy: "user-123",
        });
      }
    });
  });

  describe("error handling", () => {
    @Step({ name: "Failing Step", type: "failing", schema: TestParamsSchema })
    class FailingStep extends SimpleStep<TestParams> {
      async run(_params: TestParams): Promise<RunOutput> {
        return StepOutputs.failed("Something went wrong", "STEP_ERROR");
      }
    }

    it("returns failed output", async () => {
      const step = new FailingStep();
      const result = await step.execute({ message: "test" });

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.error).toBe("Something went wrong");
        expect(result.errorCode).toBe("STEP_ERROR");
      }
    });
  });
});
