# @devramps/@devramps/sdk-typescript

SDK for building custom deployment steps for DevRamps. Create simple one-shot steps or polling steps for long-running operations, with optional approval workflows.

## Installation

```bash
npm install @devramps/sdk-typescript
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## Quick Start

### Simple Step

A simple step runs once and returns a result.

```typescript
import { SimpleStep, Step, StepOutputs, StepRegistry } from "@devramps/@devramps/sdk-typescript";
import { z } from "zod";

// Define your input schema
const DeploySchema = z.object({
  target: z.string(),
  version: z.string(),
});

type DeployParams = z.infer<typeof DeploySchema>;

// Create your step
@Step({ name: "Deploy", type: "deploy", schema: DeploySchema })
class DeployStep extends SimpleStep<DeployParams> {
  async run(params: DeployParams) {
    this.logger.info("Starting deployment", { target: params.target });

    // Your deployment logic here
    const deploymentId = `deploy-${params.target}-${params.version}`;

    this.logger.info("Deployment complete", { deploymentId });
    return StepOutputs.success({ deploymentId });
  }
}

// Register and run
StepRegistry.run([DeployStep]);
```

### Polling Step

A polling step is used for long-running operations that need status checks.

```typescript
import { PollingStep, Step, StepOutputs, StepRegistry } from "@devramps/@devramps/sdk-typescript";
import { z } from "zod";

const BuildSchema = z.object({
  project: z.string(),
  branch: z.string(),
});

type BuildParams = z.infer<typeof BuildSchema>;

type BuildPollingState = {
  buildId: string;
  startedAt: number;
};

@Step({ name: "Build", type: "build", schema: BuildSchema })
class BuildStep extends PollingStep<BuildParams, BuildPollingState> {
  async trigger(params: BuildParams) {
    this.logger.info("Starting build", { project: params.project });

    // Start the build and return initial polling state
    const buildId = await startBuild(params.project, params.branch);

    return StepOutputs.triggered({
      buildId,
      startedAt: Date.now(),
    });
  }

  async poll(params: BuildParams, state: BuildPollingState) {
    const status = await checkBuildStatus(state.buildId);

    if (status === "running") {
      // Still running - poll again in 5 seconds
      return StepOutputs.pollAgain(state, 5000);
    }

    if (status === "failed") {
      return StepOutputs.failed("Build failed", "BUILD_FAILED");
    }

    return StepOutputs.success({ buildId: state.buildId, status: "complete" });
  }
}

StepRegistry.run([BuildStep]);
```

## Approval Workflows

Steps can require approval before execution by overriding the `prepare` method.

### Simple Step with Approval

```typescript
import { SimpleStep, Step, StepOutputs, ApprovalContext } from "@devramps/@devramps/sdk-typescript";
import { z } from "zod";

const DeleteUserSchema = z.object({
  userId: z.string(),
  reason: z.string(),
});

type DeleteUserParams = z.infer<typeof DeleteUserSchema>;

@Step({ name: "Delete User", type: "delete-user", schema: DeleteUserSchema })
class DeleteUserStep extends SimpleStep<DeleteUserParams> {
  // Override prepare to require approval
  async prepare(params: DeleteUserParams) {
    return StepOutputs.approvalRequired({
      context: `Delete user ${params.userId}? Reason: ${params.reason}`,
    });
  }

  async run(params: DeleteUserParams, approval?: ApprovalContext) {
    this.logger.info("Deleting user", {
      userId: params.userId,
      approvedBy: approval?.approverId,
    });

    await deleteUser(params.userId);

    return StepOutputs.success({ deleted: true });
  }
}
```

### Polling Step with Approval

```typescript
import { PollingStep, Step, StepOutputs, ApprovalContext } from "@devramps/@devramps/sdk-typescript";
import { z } from "zod";

const ProductionDeploySchema = z.object({
  service: z.string(),
  version: z.string(),
});

type ProductionDeployParams = z.infer<typeof ProductionDeploySchema>;

type DeployState = {
  deploymentId: string;
};

@Step({ name: "Production Deploy", type: "production-deploy", schema: ProductionDeploySchema })
class ProductionDeployStep extends PollingStep<ProductionDeployParams, DeployState> {
  async prepare(params: ProductionDeployParams) {
    return StepOutputs.approvalRequired({
      context: `Deploy ${params.service} v${params.version} to production?`,
    });
  }

  async trigger(params: ProductionDeployParams, approval?: ApprovalContext) {
    this.logger.info("Starting production deployment", {
      service: params.service,
      approvedBy: approval?.approverId,
    });

    const deploymentId = await startProductionDeploy(params);
    return StepOutputs.triggered({ deploymentId });
  }

  async poll(_params: ProductionDeployParams, state: DeployState) {
    const status = await getDeploymentStatus(state.deploymentId);

    if (status === "in_progress") {
      return StepOutputs.pollAgain(state, 10000);
    }

    if (status === "failed") {
      return StepOutputs.failed("Deployment failed", "DEPLOY_FAILED");
    }

    return StepOutputs.success({ deploymentId: state.deploymentId });
  }
}
```

## API Reference

### Step Outputs

The SDK provides helper functions for creating step outputs:

```typescript
import { StepOutputs } from "@devramps/@devramps/sdk-typescript";

// Success with optional data
StepOutputs.success();
StepOutputs.success({ key: "value" });

// Failure with error message and optional error code
StepOutputs.failed("Something went wrong");
StepOutputs.failed("Not found", "NOT_FOUND");

// Approval required (used in prepare method)
StepOutputs.approvalRequired({
  context: "Please approve this action",  // optional
});

// Triggered with polling state (used in PollingStep.trigger)
StepOutputs.triggered({ jobId: "123", startedAt: Date.now() });

// Poll again with updated state and optional delay (used in PollingStep.poll)
StepOutputs.pollAgain({ jobId: "123", attempt: 2 }, 5000);
```

### @Step Decorator

The `@Step` decorator adds metadata to your step class:

```typescript
@Step({
  name: "Human-readable name",
  type: "unique-step-type",
  schema: zodSchema,
})
```

- `name`: Display name for the step
- `type`: Unique identifier used when executing the step
- `schema`: Zod schema for validating input parameters

### StepRegistry

The registry handles CLI argument parsing and step execution:

```typescript
import { StepRegistry } from "@devramps/@devramps/sdk-typescript";

// Register all your steps
StepRegistry.run([
  DeployStep,
  BuildStep,
  DeleteUserStep,
]);
```

#### CLI Arguments

When running your step entrypoint:

```bash
node entrypoint.js --input '{"job":"EXECUTE","type":"deploy","params":{"target":"staging","version":"1.0.0"}}'
```

| Argument | Description | Default |
|----------|-------------|---------|
| `--input` | JSON input with job type and parameters | Required |
| `--output` | Path to write output JSON | `/tmp/step-output.json` |
| `--log-dir` | Directory for log files | `/tmp/step-logs` |
| `--execution-id` | Unique ID for this execution | Auto-generated |

#### Input Format

**Synthesize Metadata** - Get metadata for all registered steps:
```json
{
  "job": "SYNTHESIZE-METADATA"
}
```

**Execute Step** - Run a specific step:
```json
{
  "job": "EXECUTE",
  "type": "deploy",
  "params": { "target": "staging", "version": "1.0.0" }
}
```

**Execute with Approval Context**:
```json
{
  "job": "EXECUTE",
  "type": "delete-user",
  "params": { "userId": "123", "reason": "requested" },
  "approvalContext": {
    "approved": true,
    "approverId": "admin@example.com"
  }
}
```

**Execute Poll Phase**:
```json
{
  "job": "EXECUTE",
  "type": "build",
  "params": { "project": "my-app", "branch": "main" },
  "pollingState": {
    "buildId": "build-123",
    "startedAt": 1704067200000
  }
}
```

### Logging

Steps have access to a structured logger:

```typescript
class MyStep extends SimpleStep<MyParams> {
  async run(params: MyParams) {
    // Log info with optional data
    this.logger.info("Processing started", { itemCount: 10 });

    // Log errors
    this.logger.error("Failed to connect", { host: "example.com" });

    return StepOutputs.success();
  }
}
```

Logs are written as JSON lines to `{log-dir}/{execution-id}.jsonl`:

```json
{"timestamp":"2024-01-01T12:00:00.000Z","level":"info","message":"Processing started","data":{"itemCount":10},"stepType":"my-step","executionId":"exec-123"}
```

## Output Types

### RunOutput (SimpleStep.run)
- `SUCCESS` with optional data
- `FAILED` with error message

### TriggerOutput (PollingStep.trigger)
- `TRIGGERED` with polling state
- `FAILED` with error message

### PollOutput (PollingStep.poll)
- `SUCCESS` with optional data
- `POLL_AGAIN` with updated polling state and optional retry delay
- `FAILED` with error message

### PrepareOutput (approval flow)
- `APPROVAL_REQUIRED` with approval request details
- `FAILED` with error message

## Complete Example

Here's a complete example with multiple step types:

```typescript
// steps.ts
import {
  SimpleStep,
  PollingStep,
  Step,
  StepOutputs,
  StepRegistry,
  ApprovalContext,
} from "@devramps/@devramps/sdk-typescript";
import { z } from "zod";

// Schema definitions
const NotifySchema = z.object({
  channel: z.string(),
  message: z.string(),
});

const MigrationSchema = z.object({
  database: z.string(),
  version: z.string(),
});

// Simple notification step
@Step({ name: "Send Notification", type: "notify", schema: NotifySchema })
class NotifyStep extends SimpleStep<z.infer<typeof NotifySchema>> {
  async run(params: z.infer<typeof NotifySchema>) {
    this.logger.info("Sending notification", { channel: params.channel });
    // Send notification logic...
    return StepOutputs.success({ sent: true });
  }
}

// Database migration with approval and polling
type MigrationState = {
  migrationId: string;
  startedAt: number;
};

@Step({ name: "Database Migration", type: "db-migration", schema: MigrationSchema })
class MigrationStep extends PollingStep<z.infer<typeof MigrationSchema>, MigrationState> {
  async prepare(params: z.infer<typeof MigrationSchema>) {
    return StepOutputs.approvalRequired({
      context: `Run migration ${params.version} on ${params.database}?`,
    });
  }

  async trigger(params: z.infer<typeof MigrationSchema>, approval?: ApprovalContext) {
    this.logger.info("Starting migration", {
      database: params.database,
      approvedBy: approval?.approverId,
    });

    const migrationId = `migration-${Date.now()}`;
    return StepOutputs.triggered({
      migrationId,
      startedAt: Date.now(),
    });
  }

  async poll(_params: z.infer<typeof MigrationSchema>, state: MigrationState) {
    // Check migration status...
    const elapsed = Date.now() - state.startedAt;

    if (elapsed < 30000) {
      return StepOutputs.pollAgain(state, 5000);
    }

    return StepOutputs.success({
      migrationId: state.migrationId,
      duration: elapsed,
    });
  }
}

// Run the registry
StepRegistry.run([NotifyStep, MigrationStep]);
```

## TypeScript Configuration

Ensure your `tsconfig.json` includes decorator support:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## License

MIT
