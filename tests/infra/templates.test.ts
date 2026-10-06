// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gmailCallbackPath } from "@/lib/admin/googleOAuth";

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

  it("adds no DynamoDB permissions for Gmail connections", () => {
    const role = resource(app, "ServerFunctionRole");
    expect(role.match(/dynamodb:/g)).toHaveLength(itemActions.length);
  });

  it("leaves the CloudFront distribution untouched", () => {
    const distribution = resource(app, "Distribution");
    expect(distribution).toContain("Type: AWS::CloudFront::Distribution");
    expect(distribution).not.toMatch(/admin/i);
  });
});

describe("Gmail OAuth infrastructure", () => {
  const purposeCondition =
    "kms:EncryptionContext:purpose: gmail-oauth-refresh-token";

  it("defines a dedicated, rotated, retained KMS key", () => {
    const key = resource(app, "GmailTokenKey");
    expect(key).toContain("Type: AWS::KMS::Key");
    expect(key).toContain("DeletionPolicy: Retain");
    expect(key).toContain("UpdateReplacePolicy: Retain");
    expect(key).toContain("EnableKeyRotation: true");
    expect(key).toContain("KeySpec: SYMMETRIC_DEFAULT");
  });

  it("lets only the function use the key, for data keys with the Gmail purpose", () => {
    const key = resource(app, "GmailTokenKey");
    const usage = key.slice(
      key.indexOf("Sid: ServerFunctionEncryptsGmailTokens"),
    );
    expect(usage).toContain("AWS: !GetAtt ServerFunctionRole.Arn");
    expect(usage).toContain("- kms:GenerateDataKey");
    expect(usage).toContain("- kms:Decrypt");
    expect(usage).toContain(purposeCondition);
    expect(usage).not.toMatch(/kms:Encrypt\b|kms:ReEncrypt|kms:\*/);

    const admin = key.slice(
      key.indexOf("Sid: AccountAdministersKey"),
      key.indexOf("Sid: ServerFunctionEncryptsGmailTokens"),
    );
    expect(admin).not.toMatch(
      /kms:\*|kms:Decrypt|kms:Encrypt|kms:GenerateDataKey|kms:ReEncrypt/,
    );
  });

  it("grants no KMS permission through the function role", () => {
    expect(resource(app, "ServerFunctionRole")).not.toContain("kms:");
  });

  it("passes the Google client, redirect URI, and key to the function", () => {
    const fn = resource(app, "ServerFunction");
    expect(fn).toContain("GOOGLE_CLIENT_ID: !Ref GoogleClientId");
    expect(fn).toContain("GOOGLE_CLIENT_SECRET: !Ref GoogleClientSecret");
    expect(fn).toContain(`!Sub "\${SiteUrl}${gmailCallbackPath}"`);
    expect(fn).toContain("GMAIL_TOKEN_KMS_KEY_ID: !GetAtt GmailTokenKey.Arn");
    expect(fn).not.toMatch(/\bSITE_URL:/);

    const secret = resource(app, "GoogleClientSecret");
    expect(secret).toContain("NoEcho: true");
    expect(secret).toContain('Default: ""');
  });

  it("wires the client secret from a GitHub secret and the rest from variables", () => {
    expect(workflow).toContain(
      "GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}",
    );
    expect(workflow).toContain(
      "GOOGLE_CLIENT_ID: ${{ vars.GOOGLE_CLIENT_ID }}",
    );
    expect(workflow).toContain('"GoogleClientSecret=$GOOGLE_CLIENT_SECRET"');
    expect(workflow).toContain('"GoogleClientId=$GOOGLE_CLIENT_ID"');
    expect(workflow).toContain('"SiteUrl=$SITE_URL"');
    expect(workflow).not.toMatch(/vars\.GOOGLE_CLIENT_SECRET/);
  });

  it("caps the function at the same KMS actions in the boundary", () => {
    const boundary = resource(bootstrap, "LambdaPermissionsBoundary");
    expect(boundary).toContain("- kms:GenerateDataKey");
    expect(boundary).toContain("- kms:Decrypt");
    expect(boundary).toContain(purposeCondition);
    expect(boundary).not.toMatch(/kms:\*|kms:Encrypt\b|kms:ReEncrypt/);
  });

  it("lets CloudFormation administer, but not use, the key", () => {
    const role = resource(bootstrap, "CloudFormationExecutionRole");
    expect(role).toContain("- kms:PutKeyPolicy");
    expect(role).toContain("Action: kms:CreateKey");
    expect(role).not.toMatch(
      /kms:\*|kms:Decrypt|kms:Encrypt|kms:GenerateDataKey|kms:ReEncrypt/,
    );
  });

  it("commits no Google credential", () => {
    for (const text of [app, bootstrap, workflow]) {
      expect(text).not.toMatch(/GOCSPX-|\.apps\.googleusercontent\.com/);
    }
  });
});
