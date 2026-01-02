import { describe, it, expect } from "vitest";
import {
  StepOutputs,
  StepOutputSchema,
  PrepareOutputSchema,
  RunOutputSchema,
  TriggerOutputSchema,
  PollOutputSchema,
} from "../src/output/step-output";

describe("StepOutputs helpers", () => {
  describe("success", () => {
    it("creates a success output without data", () => {
      const output = StepOutputs.success();
      expect(output).toEqual({ status: "SUCCESS", data: undefined });
      expect(RunOutputSchema.safeParse(output).success).toBe(true);
    });

    it("creates a success output with data", () => {
      const output = StepOutputs.success({ key: "value" });
      expect(output).toEqual({ status: "SUCCESS", data: { key: "value" } });
      expect(RunOutputSchema.safeParse(output).success).toBe(true);
    });
  });

  describe("failed", () => {
    it("creates a failed output with error message", () => {
      const output = StepOutputs.failed("Something went wrong");
      expect(output).toEqual({
        status: "FAILED",
        error: "Something went wrong",
        errorCode: undefined,
      });
      expect(StepOutputSchema.safeParse(output).success).toBe(true);
    });

    it("creates a failed output with error code", () => {
      const output = StepOutputs.failed("Not found", "NOT_FOUND");
      expect(output).toEqual({
        status: "FAILED",
        error: "Not found",
        errorCode: "NOT_FOUND",
      });
    });
  });

  describe("approvalRequired", () => {
    it("creates an approval required output", () => {
      const output = StepOutputs.approvalRequired({
        message: "Please approve this action",
        approvers: ["admin@example.com"],
      });
      expect(output.status).toBe("APPROVAL_REQUIRED");
      expect(output.approvalRequest.message).toBe("Please approve this action");
      expect(output.approvalRequest.approvers).toEqual(["admin@example.com"]);
      expect(PrepareOutputSchema.safeParse(output).success).toBe(true);
    });

    it("creates an approval required output with metadata", () => {
      const output = StepOutputs.approvalRequired({
        message: "Approve deployment",
        metadata: { environment: "production", version: "1.0.0" },
      });
      expect(output.approvalRequest.metadata).toEqual({
        environment: "production",
        version: "1.0.0",
      });
    });
  });

  describe("triggered", () => {
    it("creates a triggered output with polling state", () => {
      const output = StepOutputs.triggered({ jobId: "123", startedAt: 1000 });
      expect(output).toEqual({
        status: "TRIGGERED",
        pollingState: { jobId: "123", startedAt: 1000 },
      });
      expect(TriggerOutputSchema.safeParse(output).success).toBe(true);
    });
  });

  describe("pollAgain", () => {
    it("creates a poll again output", () => {
      const output = StepOutputs.pollAgain({ jobId: "123", count: 1 }, 5000);
      expect(output).toEqual({
        status: "POLL_AGAIN",
        pollingState: { jobId: "123", count: 1 },
        retryAfterMs: 5000,
      });
      expect(PollOutputSchema.safeParse(output).success).toBe(true);
    });

    it("creates a poll again output without retry delay", () => {
      const output = StepOutputs.pollAgain({ jobId: "123" });
      expect(output.status).toBe("POLL_AGAIN");
      expect(output.retryAfterMs).toBeUndefined();
    });
  });
});

describe("Output schema validation", () => {
  it("StepOutputSchema validates all output types", () => {
    const outputs = [
      StepOutputs.success(),
      StepOutputs.failed("error"),
      StepOutputs.approvalRequired({ message: "approve" }),
      StepOutputs.triggered({ id: "1" }),
      StepOutputs.pollAgain({ id: "1" }),
    ];

    for (const output of outputs) {
      const result = StepOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid output", () => {
    const invalid = { status: "INVALID", foo: "bar" };
    const result = StepOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("PrepareOutputSchema validates approval required and failed outputs", () => {
    const approvalOutput = StepOutputs.approvalRequired({ message: "test" });
    const failedOutput = StepOutputs.failed("error");

    expect(PrepareOutputSchema.safeParse(approvalOutput).success).toBe(true);
    expect(PrepareOutputSchema.safeParse(failedOutput).success).toBe(true);
  });

  it("RunOutputSchema validates success and failed outputs", () => {
    const successOutput = StepOutputs.success({ data: "test" });
    const failedOutput = StepOutputs.failed("error");

    expect(RunOutputSchema.safeParse(successOutput).success).toBe(true);
    expect(RunOutputSchema.safeParse(failedOutput).success).toBe(true);
  });

  it("TriggerOutputSchema validates triggered and failed outputs", () => {
    const triggeredOutput = StepOutputs.triggered({ jobId: "123" });
    const failedOutput = StepOutputs.failed("error");

    expect(TriggerOutputSchema.safeParse(triggeredOutput).success).toBe(true);
    expect(TriggerOutputSchema.safeParse(failedOutput).success).toBe(true);
  });

  it("PollOutputSchema validates poll again, success, and failed outputs", () => {
    const pollAgainOutput = StepOutputs.pollAgain({ count: 1 });
    const successOutput = StepOutputs.success();
    const failedOutput = StepOutputs.failed("error");

    expect(PollOutputSchema.safeParse(pollAgainOutput).success).toBe(true);
    expect(PollOutputSchema.safeParse(successOutput).success).toBe(true);
    expect(PollOutputSchema.safeParse(failedOutput).success).toBe(true);
  });
});
