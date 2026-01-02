import { BaseStep } from "./base-step";

export abstract class RequiresApprovalStep<T> extends BaseStep<T> {
  abstract run(): Promise<void>;
  abstract runAfterApproval(): Promise<void>;
}
