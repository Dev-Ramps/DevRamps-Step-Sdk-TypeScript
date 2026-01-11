import { describe, it, expect } from "vitest";
import { z } from "zod";
import { PollingStep } from "../src/base/polling-step";
import { Step } from "../src/decorators/step";
import {
  StepOutputs,
  type TriggerOutput,
  type PollOutput,
  type PrepareOutput,
  type ApprovalContext,
} from "../src/output/step-output";

const JobParamsSchema = z.object({
  target: z.string(),
});

type JobParams = z.infer<typeof JobParamsSchema>;

type JobPollingState = {
  jobId: string;
  pollCount: number;
};

describe("PollingStep", () => {
  describe("without decorator", () => {
    it("throws error when getMetadata is called", () => {
      class UnDecoratedPollingStep extends PollingStep<
        JobParams,
        JobPollingState
      > {
        async trigger(
          _params: JobParams
        ): Promise<TriggerOutput<JobPollingState>> {
          return StepOutputs.triggered({ jobId: "123", pollCount: 0 });
        }

        async poll(
          _params: JobParams,
          state: JobPollingState
        ): Promise<PollOutput<JobPollingState>> {
          return StepOutputs.success({ finalCount: state.pollCount });
        }
      }

      const step = new UnDecoratedPollingStep();
      expect(() => step.getMetadata()).toThrow(
        "getMetadata not implemented. Did you forget to add the @Step decorator?"
      );
    });
  });

  describe("with decorator", () => {
    @Step({ name: "Job Step", type: "job", schema: JobParamsSchema })
    class JobStep extends PollingStep<JobParams, JobPollingState> {
      async trigger(
        params: JobParams
      ): Promise<TriggerOutput<JobPollingState>> {
        return StepOutputs.triggered({
          jobId: `job-${params.target}`,
          pollCount: 0,
        });
      }

      async poll(
        _params: JobParams,
        state: JobPollingState
      ): Promise<PollOutput<JobPollingState>> {
        if (state.pollCount < 3) {
          return StepOutputs.pollAgain(
            { ...state, pollCount: state.pollCount + 1 },
            1000
          );
        }
        return StepOutputs.success({ totalPolls: state.pollCount });
      }
    }

    it("returns correct data", () => {
      const step = new JobStep();
      const metadata = step.getData();

      expect(metadata.stepType).toBe("job");
      expect(metadata.stepKind).toBe("polling");
      expect(metadata.requiresApproval).toBe(false);
    });

    it("returns correct metadata", () => {
      const step = new JobStep();
      const metadata = step.getMetadata();

      expect(metadata.name).toBe("Job Step");
      expect(metadata.stepType).toBe("job");
    });

    it("executes trigger correctly", async () => {
      const step = new JobStep();
      const result = await step.executeTrigger({ target: "server-1" });

      expect(result.status).toBe("TRIGGERED");
      if (result.status === "TRIGGERED") {
        expect(result.pollingState).toEqual({
          jobId: "job-server-1",
          pollCount: 0,
        });
      }
    });

    it("executes poll and returns poll again", async () => {
      const step = new JobStep();
      const result = await step.executePoll(
        { target: "server-1" },
        {
          jobId: "job-server-1",
          pollCount: 1,
        }
      );

      expect(result.status).toBe("POLL_AGAIN");
      if (result.status === "POLL_AGAIN") {
        expect(result.pollingState).toEqual({
          jobId: "job-server-1",
          pollCount: 2,
        });
        expect(result.retryAfterMs).toBe(1000);
      }
    });

    it("executes poll and returns success when complete", async () => {
      const step = new JobStep();
      const result = await step.executePoll(
        { target: "server-1" },
        {
          jobId: "job-server-1",
          pollCount: 3,
        }
      );

      expect(result.status).toBe("SUCCESS");
      if (result.status === "SUCCESS") {
        expect(result.data).toEqual({ totalPolls: 3 });
      }
    });
  });

  describe("with approval flow", () => {
    @Step({
      name: "Approval Polling Step",
      type: "approval-polling",
      schema: JobParamsSchema,
    })
    class ApprovalPollingStep extends PollingStep<JobParams, JobPollingState> {
      override async prepare(params: JobParams): Promise<PrepareOutput> {
        return StepOutputs.approvalRequired({
          context: `Approve job for ${params.target}?`,
        });
      }

      async trigger(
        params: JobParams,
        approval?: ApprovalContext
      ): Promise<TriggerOutput<JobPollingState>> {
        return StepOutputs.triggered({
          jobId: `job-${params.target}-approved-by-${approval?.approverId}`,
          pollCount: 0,
        });
      }

      async poll(
        _params: JobParams,
        state: JobPollingState
      ): Promise<PollOutput<JobPollingState>> {
        return StepOutputs.success({ jobId: state.jobId });
      }
    }

    it("detects requiresApproval when prepare is overridden", () => {
      const step = new ApprovalPollingStep();
      const data = step.getData();

      expect(data.requiresApproval).toBe(true);
    });

    it("returns approval required from prepare", async () => {
      const step = new ApprovalPollingStep();
      const result = await step.prepare({ target: "production" });

      expect(result.status).toBe("APPROVAL_REQUIRED");
      if (result.status === "APPROVAL_REQUIRED") {
        expect(result.approvalRequest.context).toBe(
          "Approve job for production?"
        );
      }
    });

    it("executes trigger with approval context", async () => {
      const step = new ApprovalPollingStep();
      const approval: ApprovalContext = {
        approved: true,
        approverId: "admin-1",
      };

      const result = await step.executeTrigger(
        { target: "production" },
        approval
      );

      expect(result.status).toBe("TRIGGERED");
      if (result.status === "TRIGGERED") {
        expect(result.pollingState.jobId).toBe(
          "job-production-approved-by-admin-1"
        );
      }
    });
  });

  describe("error handling", () => {
    @Step({
      name: "Failing Trigger Step",
      type: "failing-trigger",
      schema: JobParamsSchema,
    })
    class FailingTriggerStep extends PollingStep<JobParams, JobPollingState> {
      async trigger(
        _params: JobParams
      ): Promise<TriggerOutput<JobPollingState>> {
        return StepOutputs.failed("Failed to start job", "TRIGGER_ERROR");
      }

      async poll(
        _params: JobParams,
        _state: JobPollingState
      ): Promise<PollOutput<JobPollingState>> {
        return StepOutputs.success();
      }
    }

    @Step({
      name: "Failing Poll Step",
      type: "failing-poll",
      schema: JobParamsSchema,
    })
    class FailingPollStep extends PollingStep<JobParams, JobPollingState> {
      async trigger(
        _params: JobParams
      ): Promise<TriggerOutput<JobPollingState>> {
        return StepOutputs.triggered({ jobId: "123", pollCount: 0 });
      }

      async poll(
        _params: JobParams,
        _state: JobPollingState
      ): Promise<PollOutput<JobPollingState>> {
        return StepOutputs.failed("Job failed during polling", "POLL_ERROR");
      }
    }

    it("returns failed output from trigger", async () => {
      const step = new FailingTriggerStep();
      const result = await step.executeTrigger({ target: "server-1" });

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.error).toBe("Failed to start job");
        expect(result.errorCode).toBe("TRIGGER_ERROR");
      }
    });

    it("returns failed output from poll", async () => {
      const step = new FailingPollStep();
      const result = await step.executePoll(
        { target: "server-1" },
        {
          jobId: "123",
          pollCount: 0,
        }
      );

      expect(result.status).toBe("FAILED");
      if (result.status === "FAILED") {
        expect(result.error).toBe("Job failed during polling");
        expect(result.errorCode).toBe("POLL_ERROR");
      }
    });
  });
});
