import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push-notifications";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const users = await prisma.user.findMany({
    where: {
      pushSubscriptions: { some: {} },
      notificationSettings: { pushRemindersEnabled: true },
    },
    select: {
      id: true,
      notificationSettings: { select: { pushReminderMinutes: true } },
    },
  });

  let sent = 0;

  for (const user of users) {
    const minutes = user.notificationSettings?.pushReminderMinutes ?? 30;
    const windowStart = new Date(now.getTime() + minutes * 60 * 1000 - 30 * 1000);
    const windowEnd = new Date(now.getTime() + minutes * 60 * 1000 + 30 * 1000);

    // Calendar events
    const events = await prisma.calendarEvent.findMany({
      where: {
        feed: { userId: user.id },
        allDay: false,
        start: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, title: true },
    });

    for (const event of events) {
      if (await alreadySent(user.id, event.id, minutes)) continue;
      await sendPushToUser(user.id, {
        title: event.title,
        body: `Starting in ${minutes} minutes`,
        url: "/calendar",
      });
      await markSent(user.id, event.id, minutes);
      sent++;
    }

    // Tasks with an upcoming due date
    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: { not: "completed" },
        dueDate: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, title: true },
    });

    for (const task of tasks) {
      if (await alreadySent(user.id, task.id, minutes)) continue;
      await sendPushToUser(user.id, {
        title: `Due: ${task.title}`,
        body: `Due in ${minutes} minutes`,
        url: "/tasks",
      });
      await markSent(user.id, task.id, minutes);
      sent++;
    }

    // Auto-scheduled tasks with an upcoming scheduled start
    const scheduledTasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: { not: "completed" },
        isAutoScheduled: true,
        scheduledStart: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, title: true },
    });

    for (const task of scheduledTasks) {
      const sentKey = `sched:${task.id}`;
      if (await alreadySent(user.id, sentKey, minutes)) continue;
      await sendPushToUser(user.id, {
        title: task.title,
        body: `Scheduled to start in ${minutes} minutes`,
        url: "/tasks",
      });
      await markSent(user.id, sentKey, minutes);
      sent++;
    }
  }

  // Clean up old sent reminders (older than 7 days)
  await prisma.sentPushReminder.deleteMany({
    where: { sentAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
  });

  return NextResponse.json({ ok: true, sent });
}

async function alreadySent(userId: string, eventId: string, reminderMinutes: number) {
  const row = await prisma.sentPushReminder.findUnique({
    where: { userId_eventId_reminderMinutes: { userId, eventId, reminderMinutes } },
  });
  return row !== null;
}

async function markSent(userId: string, eventId: string, reminderMinutes: number) {
  await prisma.sentPushReminder.create({
    data: { userId, eventId, reminderMinutes },
  });
}
