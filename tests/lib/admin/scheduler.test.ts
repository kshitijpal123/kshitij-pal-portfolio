// @vitest-environment node
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { describe, expect, it } from "vitest";
import type { Schedule } from "@/lib/admin/model";
import {
  createAwsScheduleTriggers,
  createAwsTriggerRemover,
  createScheduleRequest,
  getSchedulerConfig,
} from "@/lib/admin/scheduler";

const config = {
  groupName: "portfolio-production-mail",
  targetArn:
    "arn:aws:lambda:us-east-1:123456789012:function:portfolio-production-scheduler",
  roleArn:
    "arn:aws:iam::123456789012:role/portfolio-production-SchedulerInvokeRole-X",
};

const base: Schedule = {
  id: "8c5d2f9e-1b0a-4c3d-9e8f-7a6b5c4d3e2f",
  userId: "user-1",
  type: "ONE_TIME",
  status: "ACTIVE",
  senderIdentityId: "identity-1",
  senderEmail: "alice@gmail.com",
  contactIds: [],
  emails: ["rahul@example.com"],
  templateId: null,
  subject: "Private subject",
  body: "Private body",
  timeZone: "Asia/Kolkata",
  startLocal: "2026-10-12T10:00",
  startAt: "2026-10-12T04:30:00.000Z",
  endAt: null,
  recurrence: null,
  nextRunAt: "2026-10-12T04:30:00.000Z",
  lastRunAt: null,
  lastRunStatus: null,
  lastRunFailure: null,
  runCount: 0,
  triggerName: "mail-8c5d2f9e-1b0a-4c3d-9e8f-7a6b5c4d3e2f",
  failureCode: null,
  createdBy: "user-1",
  createdAt: "2026-10-06T09:00:00.000Z",
  updatedAt: "2026-10-06T09:00:00.000Z",
  cancelledAt: null,
  completedAt: null,
};

function fakeClient(fail?: string) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      async send(command: unknown) {
        calls.push(command);
        if (fail) {
          const error = new Error("scheduler");
          error.name = fail;
          throw error;
        }
        return {};
      },
    },
  };
}

describe("Scheduler triggers", () => {
  it("fires a one-time schedule once at its UTC instant, carrying only its ID", () => {
    const request = createScheduleRequest(base, config);
    expect(request).toMatchObject({
      Name: base.triggerName,
      GroupName: config.groupName,
      ScheduleExpression: "at(2026-10-12T04:30:00)",
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      State: "ENABLED",
      ClientToken: base.id,
      Target: {
        Arn: config.targetArn,
        RoleArn: config.roleArn,
        RetryPolicy: {
          MaximumRetryAttempts: 2,
          MaximumEventAgeInSeconds: 3600,
        },
      },
    });
    expect(JSON.parse(request.Target.Input)).toEqual({
      scheduleId: base.id,
      scheduledTime: "<aws.scheduler.scheduled-time>",
    });
    const text = JSON.stringify(request);
    for (const secret of [
      base.subject,
      base.body,
      "rahul@example.com",
      base.senderEmail,
      base.userId,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(request).not.toHaveProperty("StartDate");
  });

  it("repeats a recurring schedule in its own zone between start and end", () => {
    const request = createScheduleRequest(
      {
        ...base,
        type: "RECURRING",
        recurrence: {
          frequency: "WEEKLY",
          weekdays: ["MONDAY"],
          time: "10:00",
        },
        endAt: "2026-12-31T18:29:00.000Z",
      },
      config,
    );
    expect(request.ScheduleExpression).toBe("cron(0 10 ? * MON *)");
    expect(request.ScheduleExpressionTimezone).toBe("Asia/Kolkata");
    expect(request).toMatchObject({
      StartDate: new Date("2026-10-12T04:29:00.000Z"),
      EndDate: new Date("2026-12-31T18:29:00.000Z"),
    });
  });

  it("keeps a trigger an earlier attempt created, and reports other failures", async () => {
    const existing = fakeClient("ConflictException");
    await expect(
      createAwsScheduleTriggers(config, existing.client).create(base),
    ).resolves.toBeUndefined();
    expect(existing.calls[0]).toBeInstanceOf(CreateScheduleCommand);

    const failing = fakeClient("ThrottlingException");
    await expect(
      createAwsScheduleTriggers(config, failing.client).create(base),
    ).rejects.toThrow();
  });

  it("treats a trigger that is already gone as deleted", async () => {
    const gone = fakeClient("ResourceNotFoundException");
    await expect(
      createAwsTriggerRemover(config.groupName, gone.client).remove(base),
    ).resolves.toBeUndefined();
    const call = gone.calls[0] as DeleteScheduleCommand;
    expect(call).toBeInstanceOf(DeleteScheduleCommand);
    expect(call.input).toEqual({
      Name: base.triggerName,
      GroupName: config.groupName,
    });

    const denied = fakeClient("AccessDeniedException");
    await expect(
      createAwsTriggerRemover(config.groupName, denied.client).remove(base),
    ).rejects.toThrow();
  });

  it("is configured only with the group, target, and role together", () => {
    expect(
      getSchedulerConfig({
        SCHEDULER_GROUP_NAME: config.groupName,
        SCHEDULER_TARGET_ARN: config.targetArn,
        SCHEDULER_ROLE_ARN: config.roleArn,
      }),
    ).toEqual(config);
    expect(
      getSchedulerConfig({
        SCHEDULER_GROUP_NAME: config.groupName,
        SCHEDULER_TARGET_ARN: config.targetArn,
      }),
    ).toBeNull();
  });
});
