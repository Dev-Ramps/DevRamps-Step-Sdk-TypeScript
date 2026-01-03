#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Get optional folder name from command line args, default to "step-registry"
const folderName = process.argv[3] || "step-registry";

// Define the base directory
const baseDir = path.join(process.cwd(), folderName);

// Create the folder
console.log(`Creating ${folderName} folder...`);
if (!fs.existsSync(baseDir)) {
  fs.mkdirSync(baseDir);
}

// Initialize NPM project
console.log("Initializing NPM project...");
execSync("npm init -y", { cwd: baseDir, stdio: "inherit" });

// Install dependencies
console.log("Installing dependencies...");
execSync("npm install @devramps/sdk-typescript zod", {
  cwd: baseDir,
  stdio: "inherit",
});
execSync("npm install --save-dev @types/node jest ts-jest @types/jest", {
  cwd: baseDir,
  stdio: "inherit",
});

// Create src folder structure
const srcDir = path.join(baseDir, "src");
const stepsDir = path.join(srcDir, "steps");
console.log("Creating src/steps folder structure...");
if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir);
}
if (!fs.existsSync(stepsDir)) {
  fs.mkdirSync(stepsDir, { recursive: true });
}

// Create tst folder structure
const tstDir = path.join(baseDir, "tst");
const tstStepsDir = path.join(tstDir, "steps");
console.log("Creating tst/steps folder structure...");
if (!fs.existsSync(tstDir)) {
  fs.mkdirSync(tstDir);
}
if (!fs.existsSync(tstStepsDir)) {
  fs.mkdirSync(tstStepsDir, { recursive: true });
}

// Create deployment-service.ts (dependency example)
console.log("Creating deployment-service.ts...");
const deploymentServiceContent = `export interface DeploymentService {
  deploy(target: string, version?: string): Promise<{ deploymentId: string }>;
}

export class RealDeploymentService implements DeploymentService {
  async deploy(target: string, version?: string): Promise<{ deploymentId: string }> {
    // Simulate a deployment
    console.log(\`Deploying to \${target}\${version ? \` version \${version}\` : ""}\`);
    return { deploymentId: \`deploy-\${Date.now()}\` };
  }
}
`;
fs.writeFileSync(
  path.join(srcDir, "deployment-service.ts"),
  deploymentServiceContent
);

// Create my-first-step.ts
console.log("Creating my-first-step.ts...");
const myFirstStepContent = `import {
  RunOutput,
  SimpleStep,
  Step,
  StepOutputs,
} from "@devramps/sdk-typescript";
import z from "zod";
import { DeploymentService } from "../deployment-service";

const DeploySchema = z.object({
  target: z.string().describe("A Target"),
  version: z.string().optional(),
});

type DeployParams = z.infer<typeof DeploySchema>;

@Step({
  name: "Custom Deployment Action",
  type: "CUSTOM:SCRIPT:DEPLOY",
  schema: DeploySchema,
})
export class MyFirstStep extends SimpleStep<DeployParams> {
  constructor(private deploymentService: DeploymentService) {
    super();
  }

  async run(params: DeployParams): Promise<RunOutput> {
    this.logger.info(\`Deploying with params: \${JSON.stringify(params)}\`);

    const result = await this.deploymentService.deploy(
      params.target,
      params.version
    );

    this.logger.info(\`Deployment completed: \${result.deploymentId}\`);

    return StepOutputs.success({
      deploymentId: result.deploymentId,
      target: params.target,
      version: params.version,
    });
  }
}
`;
fs.writeFileSync(path.join(stepsDir, "my-first-step.ts"), myFirstStepContent);

// Create src/index.ts
console.log("Creating src/index.ts...");
const indexContent = `import { StepRegistry } from "@devramps/sdk-typescript";
import { MyFirstStep } from "./steps/my-first-step";
import { RealDeploymentService } from "./deployment-service";

// Instantiate dependencies
const deploymentService = new RealDeploymentService();

// Instantiate steps with their dependencies
const myFirstStep = new MyFirstStep(deploymentService);

// Register step instances
StepRegistry.run([myFirstStep]);
`;
fs.writeFileSync(path.join(srcDir, "index.ts"), indexContent);

// Create tsconfig.json
console.log("Creating tsconfig.json...");
const tsconfigContent = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "types": ["node", "jest"],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictPropertyInitialization": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;
fs.writeFileSync(path.join(baseDir, "tsconfig.json"), tsconfigContent);

// Create jest.config.js
console.log("Creating jest.config.js...");
const jestConfigContent = `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tst'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
};
`;
fs.writeFileSync(path.join(baseDir, "jest.config.js"), jestConfigContent);

// Create test file for my-first-step
console.log("Creating tst/steps/my-first-step.test.ts...");
const testContent = `import { MyFirstStep } from "../../src/steps/my-first-step";
import { DeploymentService } from "../../src/deployment-service";
import { StepOutputs } from "@devramps/sdk-typescript";

// Mock implementation of DeploymentService for testing
class MockDeploymentService implements DeploymentService {
  async deploy(target: string, version?: string): Promise<{ deploymentId: string }> {
    return { deploymentId: \`mock-deploy-\${target}-\${version || "latest"}\` };
  }
}

describe("MyFirstStep", () => {
  let mockDeploymentService: MockDeploymentService;
  let step: MyFirstStep;

  beforeEach(() => {
    // Create mock dependency
    mockDeploymentService = new MockDeploymentService();
    // Inject mock into step
    step = new MyFirstStep(mockDeploymentService);
  });

  it("should run successfully with valid parameters", async () => {
    const params = {
      target: "production",
      version: "1.0.0",
    };

    const result = await step.run(params);

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.data).toEqual({
        deploymentId: "mock-deploy-production-1.0.0",
        target: "production",
        version: "1.0.0",
      });
    }
  });

  it("should run successfully without optional version parameter", async () => {
    const params = {
      target: "staging",
    };

    const result = await step.run(params);

    expect(result.status).toBe("SUCCESS");
    if (result.status === "SUCCESS") {
      expect(result.data).toEqual({
        deploymentId: "mock-deploy-staging-latest",
        target: "staging",
        version: undefined,
      });
    }
  });

  it("should call deployment service with correct parameters", async () => {
    const deploySpy = jest.spyOn(mockDeploymentService, "deploy");
    const params = {
      target: "development",
      version: "2.0.0",
    };

    await step.run(params);

    expect(deploySpy).toHaveBeenCalledWith("development", "2.0.0");
  });

  it("should log deployment information", async () => {
    // Access the logger through type assertion to test logging behavior
    const logSpy = jest.spyOn((step as any).logger, "info");
    const params = {
      target: "production",
      version: "3.0.0",
    };

    await step.run(params);

    expect(logSpy).toHaveBeenCalledWith(
      \`Deploying with params: \${JSON.stringify(params)}\`
    );
    expect(logSpy).toHaveBeenCalledWith(
      "Deployment completed: mock-deploy-production-3.0.0"
    );
  });
});
`;
fs.writeFileSync(path.join(tstStepsDir, "my-first-step.test.ts"), testContent);

// Update package.json to add build and start scripts
console.log("Adding build and start scripts to package.json...");
const packageJsonPath = path.join(baseDir, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.scripts = {
  ...packageJson.scripts,
  "build-step-registry": "tsc -p tsconfig.json",
  "start-step-registry": "node ./dist/index.js",
  test: "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
};
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`\nStep registry created successfully in '${folderName}'!`);
console.log(`\nNext steps:`);
console.log(`  cd ${folderName}`);
console.log(`  npm run build-step-registry`);
console.log(`  npm run test`);
