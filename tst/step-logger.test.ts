import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { StepLogger, NoOpLogger, type LogEntry } from "../src/logging/step-logger";

describe("StepLogger", () => {
  const testLogDir = "/tmp/step-logger-test";
  const testExecutionId = "test-exec-123";
  const testStepType = "test-step";

  beforeEach(() => {
    // Clean up test directory before each test
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true });
    }
  });

  describe("constructor", () => {
    it("creates log directory if it does not exist", () => {
      expect(fs.existsSync(testLogDir)).toBe(false);

      new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      expect(fs.existsSync(testLogDir)).toBe(true);
    });

    it("works when log directory already exists", () => {
      fs.mkdirSync(testLogDir, { recursive: true });

      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      // Should not throw
      logger.info("test message");
    });
  });

  describe("info", () => {
    it("writes info log entry to file", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      logger.info("Test info message");

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      expect(fs.existsSync(logFile)).toBe(true);

      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const entry: LogEntry = JSON.parse(logContent);

      expect(entry.level).toBe("info");
      expect(entry.message).toBe("Test info message");
      expect(entry.stepType).toBe(testStepType);
      expect(entry.executionId).toBe(testExecutionId);
      expect(entry.timestamp).toBeDefined();
      expect(entry.data).toBeUndefined();
    });

    it("writes info log entry with data", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      logger.info("Test with data", { key: "value", count: 42 });

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const entry: LogEntry = JSON.parse(logContent);

      expect(entry.data).toEqual({ key: "value", count: 42 });
    });
  });

  describe("error", () => {
    it("writes error log entry to file", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      logger.error("Test error message");

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const entry: LogEntry = JSON.parse(logContent);

      expect(entry.level).toBe("error");
      expect(entry.message).toBe("Test error message");
    });

    it("writes error log entry with data", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      logger.error("Error occurred", { errorCode: "ERR_001", details: "some details" });

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const entry: LogEntry = JSON.parse(logContent);

      expect(entry.level).toBe("error");
      expect(entry.data).toEqual({ errorCode: "ERR_001", details: "some details" });
    });
  });

  describe("multiple log entries", () => {
    it("appends multiple entries to the same file", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      logger.info("First message");
      logger.info("Second message");
      logger.error("Third message");

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const lines = logContent.split("\n");

      expect(lines).toHaveLength(3);

      const entries = lines.map((line) => JSON.parse(line) as LogEntry);
      expect(entries[0].message).toBe("First message");
      expect(entries[0].level).toBe("info");
      expect(entries[1].message).toBe("Second message");
      expect(entries[1].level).toBe("info");
      expect(entries[2].message).toBe("Third message");
      expect(entries[2].level).toBe("error");
    });
  });

  describe("timestamp", () => {
    it("includes ISO timestamp in log entries", () => {
      const logger = new StepLogger({
        logDir: testLogDir,
        executionId: testExecutionId,
        stepType: testStepType,
      });

      const beforeLog = new Date().toISOString();
      logger.info("Test message");
      const afterLog = new Date().toISOString();

      const logFile = path.join(testLogDir, `${testExecutionId}.jsonl`);
      const logContent = fs.readFileSync(logFile, "utf-8").trim();
      const entry: LogEntry = JSON.parse(logContent);

      // Timestamp should be between before and after (or equal)
      expect(entry.timestamp >= beforeLog).toBe(true);
      expect(entry.timestamp <= afterLog).toBe(true);
    });
  });
});

describe("NoOpLogger", () => {
  it("can be instantiated", () => {
    const logger = new NoOpLogger();
    expect(logger).toBeInstanceOf(NoOpLogger);
  });

  it("info does nothing", () => {
    const logger = new NoOpLogger();
    // Should not throw
    logger.info("Test message");
    logger.info("Test message", { key: "value" });
  });

  it("error does nothing", () => {
    const logger = new NoOpLogger();
    // Should not throw
    logger.error("Test error");
    logger.error("Test error", { errorCode: "ERR" });
  });

  it("does not create any log files", () => {
    const logger = new NoOpLogger();
    logger.info("Test message");
    logger.error("Test error");

    // NoOpLogger uses /tmp/noop as log dir
    const noopLogFile = "/tmp/noop.jsonl";
    expect(fs.existsSync(noopLogFile)).toBe(false);
  });
});
