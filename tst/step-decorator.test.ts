import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Step } from "../src/decorators/step";
import { SimpleStep } from "../src/base/simple-step";
import { PollingStep } from "../src/base/polling-step";
import { BaseStep } from "../src/base/base-step";
import {
  StepOutputs,
  type RunOutput,
  type TriggerOutput,
  type PollOutput,
  type PrepareOutput,
} from "../src/output/step-output";

const TestSchema = z.object({
  value: z.string(),
});

type TestParams = z.infer<typeof TestSchema>;

describe("@Step decorator", () => {
  describe("with SimpleStep", () => {
    @Step({ name: "Simple Test", type: "simple-test", schema: TestSchema })
    class SimpleTestStep extends SimpleStep<TestParams> {
      async run(params: TestParams): Promise<RunOutput> {
        return StepOutputs.success({ value: params.value });
      }
    }

    it("adds getMetadata method", () => {
      const step = new SimpleTestStep();
      const metadata = step.getMetadata();

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe("Simple Test");
      expect(metadata.stepType).toBe("simple-test");
      expect(metadata.schema).toBe(TestSchema);
    });

    it("detects stepKind as simple", () => {
      const step = new SimpleTestStep();
      const metadata = step.getMetadata();

      expect(metadata.stepKind).toBe("simple");
    });

    it("detects requiresApproval as false when prepare is not overridden", () => {
      const step = new SimpleTestStep();
      const metadata = step.getMetadata();

      expect(metadata.requiresApproval).toBe(false);
    });
  });

  describe("with SimpleStep requiring approval", () => {
    @Step({ name: "Approval Test", type: "approval-test", schema: TestSchema })
    class ApprovalTestStep extends SimpleStep<TestParams> {
      override async prepare(params: TestParams): Promise<PrepareOutput> {
        return StepOutputs.approvalRequired({
          message: `Approve ${params.value}?`,
        });
      }

      async run(params: TestParams): Promise<RunOutput> {
        return StepOutputs.success({ value: params.value });
      }
    }

    it("detects requiresApproval as true when prepare is overridden", () => {
      const step = new ApprovalTestStep();
      const metadata = step.getMetadata();

      expect(metadata.requiresApproval).toBe(true);
    });
  });

  describe("with PollingStep", () => {
    type PollingState = { jobId: string };

    @Step({ name: "Polling Test", type: "polling-test", schema: TestSchema })
    class PollingTestStep extends PollingStep<TestParams, PollingState> {
      async trigger(params: TestParams): Promise<TriggerOutput<PollingState>> {
        return StepOutputs.triggered({ jobId: params.value });
      }

      async poll(_params: TestParams, state: PollingState): Promise<PollOutput<PollingState>> {
        return StepOutputs.success({ jobId: state.jobId });
      }
    }

    it("adds getMetadata method", () => {
      const step = new PollingTestStep();
      const metadata = step.getMetadata();

      expect(metadata).toBeDefined();
      expect(metadata.name).toBe("Polling Test");
      expect(metadata.stepType).toBe("polling-test");
    });

    it("detects stepKind as polling", () => {
      const step = new PollingTestStep();
      const metadata = step.getMetadata();

      expect(metadata.stepKind).toBe("polling");
    });

    it("detects requiresApproval as false when prepare is not overridden", () => {
      const step = new PollingTestStep();
      const metadata = step.getMetadata();

      expect(metadata.requiresApproval).toBe(false);
    });
  });

  describe("with PollingStep requiring approval", () => {
    type PollingState = { jobId: string };

    @Step({ name: "Approval Polling Test", type: "approval-polling-test", schema: TestSchema })
    class ApprovalPollingTestStep extends PollingStep<TestParams, PollingState> {
      override async prepare(params: TestParams): Promise<PrepareOutput> {
        return StepOutputs.approvalRequired({
          message: `Approve polling for ${params.value}?`,
        });
      }

      async trigger(params: TestParams): Promise<TriggerOutput<PollingState>> {
        return StepOutputs.triggered({ jobId: params.value });
      }

      async poll(_params: TestParams, state: PollingState): Promise<PollOutput<PollingState>> {
        return StepOutputs.success({ jobId: state.jobId });
      }
    }

    it("detects requiresApproval as true when prepare is overridden", () => {
      const step = new ApprovalPollingTestStep();
      const metadata = step.getMetadata();

      expect(metadata.requiresApproval).toBe(true);
    });
  });

  describe("schema validation", () => {
    const ComplexSchema = z.object({
      name: z.string().min(1),
      count: z.number().int().positive(),
      tags: z.array(z.string()).optional(),
    });

    @Step({ name: "Complex Schema", type: "complex-schema", schema: ComplexSchema })
    class ComplexSchemaStep extends SimpleStep<z.infer<typeof ComplexSchema>> {
      async run(params: z.infer<typeof ComplexSchema>): Promise<RunOutput> {
        return StepOutputs.success({ processed: params.name });
      }
    }

    it("includes schema in metadata", () => {
      const step = new ComplexSchemaStep();
      const metadata = step.getMetadata();

      expect(metadata.schema).toBe(ComplexSchema);
    });

    it("schema can be used for validation", () => {
      const step = new ComplexSchemaStep();
      const metadata = step.getMetadata();

      const validResult = metadata.schema.safeParse({
        name: "test",
        count: 5,
      });
      expect(validResult.success).toBe(true);

      const invalidResult = metadata.schema.safeParse({
        name: "",
        count: -1,
      });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe("optional metadata fields", () => {
    @Step({
      name: "Fully Documented Step",
      type: "fully-documented",
      schema: TestSchema,
      shortDescription: "A short description of the step",
      longDescription: "This is a much longer description that provides detailed information about what this step does and how to use it.",
      yamlExample: "type: fully-documented\nparams:\n  value: example",
    })
    class FullyDocumentedStep extends SimpleStep<TestParams> {
      async run(params: TestParams): Promise<RunOutput> {
        return StepOutputs.success({ value: params.value });
      }
    }

    it("includes all optional metadata fields when provided", () => {
      const step = new FullyDocumentedStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBe("Fully Documented Step");
      expect(metadata.stepType).toBe("fully-documented");
      expect(metadata.shortDescription).toBe("A short description of the step");
      expect(metadata.longDescription).toBe(
        "This is a much longer description that provides detailed information about what this step does and how to use it."
      );
      expect(metadata.yamlExample).toBe(
        "type: fully-documented\nparams:\n  value: example"
      );
    });

    it("generates JSON schema from Zod schema", () => {
      const step = new FullyDocumentedStep();
      const metadata = step.getMetadata();

      expect(metadata.jsonSchema).toBeDefined();
      expect(metadata.jsonSchema.type).toBe("object");
      expect(metadata.jsonSchema.properties).toBeDefined();
      // Verify the schema contains the 'value' property from TestSchema
      expect(metadata.jsonSchema.properties?.value).toBeDefined();
    });

    @Step({
      type: "minimal-step",
      schema: TestSchema,
    })
    class MinimalStep extends SimpleStep<TestParams> {
      async run(params: TestParams): Promise<RunOutput> {
        return StepOutputs.success({ value: params.value });
      }
    }

    it("handles missing optional fields gracefully", () => {
      const step = new MinimalStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBeUndefined();
      expect(metadata.stepType).toBe("minimal-step");
      expect(metadata.shortDescription).toBeUndefined();
      expect(metadata.longDescription).toBeUndefined();
      expect(metadata.yamlExample).toBeUndefined();
      expect(metadata.jsonSchema).toBeDefined(); // jsonSchema should always be present
    });
  });

  describe("class inheritance", () => {
    it("decorated class is still instanceof SimpleStep", () => {
      @Step({ name: "Instance Test", type: "instance-test", schema: TestSchema })
      class InstanceTestStep extends SimpleStep<TestParams> {
        async run(): Promise<RunOutput> {
          return StepOutputs.success();
        }
      }

      const step = new InstanceTestStep();
      expect(step).toBeInstanceOf(SimpleStep);
      expect(step).toBeInstanceOf(BaseStep);
    });

    it("decorated class is still instanceof PollingStep", () => {
      type PollingState = { id: string };

      @Step({ name: "Polling Instance Test", type: "polling-instance-test", schema: TestSchema })
      class PollingInstanceTestStep extends PollingStep<TestParams, PollingState> {
        async trigger(): Promise<TriggerOutput<PollingState>> {
          return StepOutputs.triggered({ id: "123" });
        }

        async poll(_params: TestParams, state: PollingState): Promise<PollOutput<PollingState>> {
          return StepOutputs.success({ id: state.id });
        }
      }

      const step = new PollingInstanceTestStep();
      expect(step).toBeInstanceOf(PollingStep);
      expect(step).toBeInstanceOf(BaseStep);
    });
  });
});
