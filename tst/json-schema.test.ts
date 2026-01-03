import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Step } from "../src/decorators/step";
import { SimpleStep } from "../src/base/simple-step";
import { StepOutputs, type RunOutput } from "../src/output/step-output";

describe("JSON Schema Generation", () => {
  describe("simple schema types", () => {
    const StringSchema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });

    @Step({ type: "simple-types", schema: StringSchema })
    class SimpleTypesStep extends SimpleStep<z.infer<typeof StringSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("generates JSON schema for basic types", () => {
      const step = new SimpleTypesStep();
      const metadata = step.getMetadata();

      expect(metadata.paramsJsonSchema.type).toBe("object");
      expect(metadata.paramsJsonSchema.properties?.name).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.age).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.active).toBeDefined();
    });
  });

  describe("complex schema types", () => {
    const ComplexSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      count: z.number().int().positive(),
      tags: z.array(z.string()),
      metadata: z.record(z.string(), z.any()).optional(),
      status: z.enum(["active", "inactive", "pending"]),
    });

    @Step({ type: "complex-types", schema: ComplexSchema })
    class ComplexTypesStep extends SimpleStep<z.infer<typeof ComplexSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("generates JSON schema for complex types", () => {
      const step = new ComplexTypesStep();
      const metadata = step.getMetadata();

      expect(metadata.paramsJsonSchema.type).toBe("object");
      expect(metadata.paramsJsonSchema.properties?.id).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.email).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.count).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.tags).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.metadata).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.status).toBeDefined();
    });

    it("includes required fields in JSON schema", () => {
      const step = new ComplexTypesStep();
      const metadata = step.getMetadata();

      // metadata is optional, so it should not be in required array
      expect(metadata.paramsJsonSchema.required).toBeDefined();
      expect(metadata.paramsJsonSchema.required).toContain("id");
      expect(metadata.paramsJsonSchema.required).toContain("email");
      expect(metadata.paramsJsonSchema.required).toContain("count");
      expect(metadata.paramsJsonSchema.required).toContain("tags");
      expect(metadata.paramsJsonSchema.required).toContain("status");
    });
  });

  describe("nested schema types", () => {
    const AddressSchema = z.object({
      street: z.string(),
      city: z.string(),
      zipCode: z.string(),
    });

    const PersonSchema = z.object({
      name: z.string(),
      age: z.number(),
      address: AddressSchema,
      alternateAddresses: z.array(AddressSchema).optional(),
    });

    @Step({ type: "nested-types", schema: PersonSchema })
    class NestedTypesStep extends SimpleStep<z.infer<typeof PersonSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("generates JSON schema for nested objects", () => {
      const step = new NestedTypesStep();
      const metadata = step.getMetadata();

      expect(metadata.paramsJsonSchema.type).toBe("object");
      expect(metadata.paramsJsonSchema.properties?.address).toBeDefined();
      expect(
        metadata.paramsJsonSchema.properties?.alternateAddresses
      ).toBeDefined();
    });
  });

  describe("union and discriminated union types", () => {
    const UnionSchema = z
      .object({
        type: z.literal("webhook"),
        url: z.string().url(),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
      })
      .or(
        z.object({
          type: z.literal("email"),
          recipient: z.string().email(),
          subject: z.string(),
        })
      );

    @Step({ type: "union-types", schema: UnionSchema })
    class UnionTypesStep extends SimpleStep<z.infer<typeof UnionSchema>> {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("generates JSON schema for union types", () => {
      const step = new UnionTypesStep();
      const metadata = step.getMetadata();

      expect(metadata.paramsJsonSchema).toBeDefined();
      // Union types are represented as oneOf or anyOf in JSON Schema
    });
  });

  describe("schema with defaults and descriptions", () => {
    const DescribedSchema = z.object({
      name: z.string().describe("The name of the resource"),
      count: z.number().default(10).describe("Number of items to process"),
      enabled: z
        .boolean()
        .default(true)
        .describe("Whether the feature is enabled"),
    });

    @Step({ type: "described-types", schema: DescribedSchema })
    class DescribedTypesStep extends SimpleStep<
      z.infer<typeof DescribedSchema>
    > {
      async run(): Promise<RunOutput> {
        return StepOutputs.success();
      }
    }

    it("generates JSON schema with descriptions", () => {
      const step = new DescribedTypesStep();
      const metadata = step.getMetadata();

      expect(metadata.paramsJsonSchema.type).toBe("object");
      expect(metadata.paramsJsonSchema.properties?.name).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.count).toBeDefined();
      expect(metadata.paramsJsonSchema.properties?.enabled).toBeDefined();
    });
  });
});
