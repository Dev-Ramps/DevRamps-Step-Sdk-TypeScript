import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { BaseStep } from "../src/base/base-step";
import { StepLogger, NoOpLogger } from "../src/logging/step-logger";
import { StepOutputs } from "../src/output/step-output";

// Concrete implementation for testing
class TestStep extends BaseStep<{ value: string }> {
  getLoggerForTest(): StepLogger {
    return this.logger;
  }
}

describe("BaseStep", () => {
  describe("logger", () => {
    it("has a NoOpLogger by default", () => {
      const step = new TestStep();
      expect(step.getLoggerForTest()).toBeInstanceOf(NoOpLogger);
    });

    it("can have its logger set via _setLogger", () => {
      const step = new TestStep();
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
      } as unknown as StepLogger;

      step._setLogger(mockLogger);
      expect(step.getLoggerForTest()).toBe(mockLogger);
    });
  });

  describe("getMetadata", () => {
    it("throws error when not decorated", () => {
      const step = new TestStep();
      expect(() => step.getMetadata()).toThrow(
        "getMetadata not implemented. Did you forget to add the @Step decorator?"
      );
    });
  });

  describe("prepare", () => {
    it("returns failed output by default", async () => {
      const step = new TestStep();
      const result = await step.prepare({ value: "test" });

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.error).toBe("prepare() called but not implemented");
        expect(result.errorCode).toBe("PREPARE_NOT_IMPLEMENTED");
      }
    });
  });
});
