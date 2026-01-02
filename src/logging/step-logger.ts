import * as fs from "fs";
import * as path from "path";

export type LogLevel = "info" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  stepType: string;
  executionId: string;
}

export interface StepLoggerConfig {
  logDir: string;
  executionId: string;
  stepType: string;
}

/**
 * File-based structured logger for steps.
 * Writes JSON lines to {logDir}/{executionId}.jsonl
 */
export class StepLogger {
  private readonly logFilePath: string;
  private readonly stepType: string;
  private readonly executionId: string;

  constructor(config: StepLoggerConfig) {
    this.stepType = config.stepType;
    this.executionId = config.executionId;
    this.logFilePath = path.join(config.logDir, `${config.executionId}.jsonl`);

    // Ensure log directory exists
    const logDir = path.dirname(this.logFilePath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write("info", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write("error", message, data);
  }

  private write(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      stepType: this.stepType,
      executionId: this.executionId,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    fs.appendFileSync(this.logFilePath, JSON.stringify(entry) + "\n");
  }
}

/**
 * No-op logger for use when logging is not configured.
 */
export class NoOpLogger extends StepLogger {
  constructor() {
    // Pass dummy config - methods are overridden anyway
    super({ logDir: "/tmp", executionId: "noop", stepType: "noop" });
  }

  override info(_message: string, _data?: Record<string, unknown>): void {
    // No-op
  }

  override error(_message: string, _data?: Record<string, unknown>): void {
    // No-op
  }
}
