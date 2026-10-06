// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("infra/portfolio.yaml", "utf8");
const bootstrap = readFileSync("infra/bootstrap.yaml", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

/** The text of one top-level resource in a template. */
function resource(template: string, name: string) {
  const start = template.indexOf(`\n  ${name}:\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = template.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[A-Za-z]+:\n/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

const itemActions = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:DeleteItem",
  "dynamodb:Query",
];

describe("private console infrastructure", () => {
  it("defines one on-demand, retained, recoverable table with a TTL", () => {
    const table = resource(app, "AdminTable");
    expect(table).toContain("Type: AWS::DynamoDB::Table");
    expect(table).toContain("DeletionPolicy: Retain");
    expect(table).toContain("UpdateReplacePolicy: Retain");
    expect(table).toContain("BillingMode: PAY_PER_REQUEST");
    expect(table).toContain("AttributeName: expiresAtEpoch");
    expect(table).toContain("PointInTimeRecoveryEnabled: true");
    expect(table).toContain("DeletionProtectionEnabled: true");
  });

  it("grants the function only item actions on that table", () => {
    const role = resource(app, "ServerFunctionRole");
    for (const action of itemActions) expect(role).toContain(`- ${action}`);
    expect(role).toContain("Resource: !GetAtt AdminTable.Arn");
    expect(role).not.toMatch(
      /dynamodb:\*|dynamodb:Scan|dynamodb:BatchWriteItem/,
    );
  });

  it("passes the table and the optional setup token to the function", () => {
    const fn = resource(app, "ServerFunction");
    expect(fn).toContain("ADMIN_TABLE_NAME: !Ref AdminTable");
    expect(fn).toContain("ADMIN_BOOTSTRAP_TOKEN: !Ref AdminBootstrapToken");
    expect(resource(app, "AdminBootstrapToken")).toContain("NoEcho: true");
    expect(resource(app, "AdminBootstrapToken")).toContain('Default: ""');
    expect(workflow).toContain(
      "ADMIN_BOOTSTRAP_TOKEN: ${{ secrets.ADMIN_BOOTSTRAP_TOKEN }}",
    );
    expect(workflow).toContain('"AdminBootstrapToken=$ADMIN_BOOTSTRAP_TOKEN"');
  });

  it("lets the permissions boundary allow the same item actions on stack tables", () => {
    const boundary = resource(bootstrap, "LambdaPermissionsBoundary");
    for (const action of itemActions) expect(boundary).toContain(`- ${action}`);
    expect(boundary).toContain(":table/${AppStackName}-*");
    expect(boundary).not.toContain("dynamodb:*");
  });

  it("lets CloudFormation manage only the stack's tables", () => {
    const role = resource(bootstrap, "CloudFormationExecutionRole");
    expect(role).toContain("- dynamodb:CreateTable");
    expect(role).toContain(":table/${AppStackName}-*");
    expect(role).not.toContain("dynamodb:*");
  });

  it("leaves the CloudFront distribution untouched", () => {
    const distribution = resource(app, "Distribution");
    expect(distribution).toContain("Type: AWS::CloudFront::Distribution");
    expect(distribution).not.toMatch(/admin/i);
  });
});
