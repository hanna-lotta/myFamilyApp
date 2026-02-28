import express from 'express';
import type { Request, Response } from 'express';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { validateJwt } from '../data/auth.js';
import type { ErrorMessage } from '../data/types.js';
import { db, tableName } from '../data/dynamoDb.js';
import { z } from 'zod';

type ParentOverview = {
  totalMinutes: number;
  questionCount: number;
  avgQuizScore: number | null;
  topSubject: string | null;
  sessionsCount: number;
};

type DailyStat = {
  date: string;
  minutes: number;
  questionCount: number;
  avgQuizScore: number | null;
};

type SessionSummary = {
  childUserId: string;
  sessionId: string;
  title: string;
  startedAt: string;
  subject: string;
  durationMinutes: number;
  questionCount: number;
  quizScore: number | null;
};

type OverviewResponse = {
  overview: ParentOverview;
  childUsername: string | null;
  dailyStats: DailyStat[];
  recentSessions: SessionSummary[];
};

const router = express.Router();

const overviewQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  childId: z.string().optional()
});

const toUtcRange = (from: string, to: string) => {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  return { fromDate, toDate };
};

const sessionKey = (userId: string, sessionId: string) => `${userId}#${sessionId}`;

router.get('/overview', async (req: Request, res: Response<OverviewResponse | ErrorMessage>) => {
  const payload = validateJwt(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (payload.role !== 'parent') {
    res.status(403).json({ error: 'Only parents can view overview' });
    return;
  }

  const parsedQuery = overviewQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid request query', issues: parsedQuery.error.issues });
    return;
  }

  const { from, to, childId } = parsedQuery.data;
  const { fromDate, toDate } = toUtcRange(from, to);

  const pk = `family#${payload.familyId}`;
  const skPrefix = childId ? `user#${childId}#SESSION#` : 'user#';

  const sessions = new Map<string, {
    userId: string;
    sessionId: string;
    startedAt?: string;
    subject?: string;
    firstMsgAt?: string;
    lastMsgAt?: string;
    firstUserMsgAt?: string;
    firstUserMessage?: string;
    questionCount: number;
  }>();

  const childUsernames = new Map<string, string>();

  const stats = new Map<string, {
    durationMinutes?: number;
    questionCount?: number;
    quizScore?: number | null;
  }>();

  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      ExpressionAttributeNames: {
        '#pk': 'pk',
        '#sk': 'sk'
      },
      ExpressionAttributeValues: {
        ':pk': pk,
        ':sk': skPrefix
      },
      ExclusiveStartKey: lastKey
    }));

    const items = result.Items || [];

    for (const item of items) {
      if (!item || typeof item.sk !== 'string') continue;

      const sk: string = item.sk;
      const userMatch = sk.match(/^user#([^#]+)$/);
      const sessionMatch = sk.match(/^user#([^#]+)#SESSION#([^#]+)$/);
      const statsMatch = sk.match(/^user#([^#]+)#SESSION#([^#]+)#STATS$/);
      const msgMatch = sk.match(/^user#([^#]+)#SESSION#([^#]+)#MSG#(.+)$/);

      if (userMatch && userMatch[1]) {
        const userId = userMatch[1];
        const role = typeof item.role === 'string' ? item.role : '';
        if (role === 'child' && typeof item.username === 'string') {
          childUsernames.set(userId, item.username);
        }
        continue;
      }

      if (sessionMatch && sessionMatch[1] && sessionMatch[2]) {
        const userId = sessionMatch[1];
        const sessionId = sessionMatch[2];
        const key = sessionKey(userId, sessionId);
        const existing = sessions.get(key) || {
          userId,
          sessionId,
          questionCount: 0
        };
        const updated: typeof existing = {
          ...existing
        };
        if (typeof item.startedAt === 'string') {
          updated.startedAt = item.startedAt;
        }
        if (typeof item.subject === 'string') {
          updated.subject = item.subject;
        }
        sessions.set(key, updated);
        continue;
      }

      if (statsMatch && statsMatch[1] && statsMatch[2]) {
        const userId = statsMatch[1];
        const sessionId = statsMatch[2];
        const key = sessionKey(userId, sessionId);
        const statsObj: { durationMinutes?: number; questionCount?: number; quizScore?: number | null } = {};
        if (typeof item.durationMinutes === 'number') {
          statsObj.durationMinutes = item.durationMinutes;
        }
        if (typeof item.questionCount === 'number') {
          statsObj.questionCount = item.questionCount;
        }
        if (typeof item.quizScore === 'number' || item.quizScore === null) {
          statsObj.quizScore = item.quizScore;
        }
        stats.set(key, statsObj);
        continue;
      }

      if (msgMatch && msgMatch[1] && msgMatch[2] && msgMatch[3]) {
        const userId = msgMatch[1];
        const sessionId = msgMatch[2];
        const timestamp = msgMatch[3];
        const msgDate = new Date(timestamp);
        if (Number.isNaN(msgDate.getTime())) continue;
        if (msgDate < fromDate || msgDate > toDate) continue;

        const key = sessionKey(userId, sessionId);
        const existing = sessions.get(key) || {
          userId,
          sessionId,
          questionCount: 0
        };

        const role = typeof item.role === 'string' ? item.role : '';
        const isUserMessage = role === 'user';

        const updatedSession = {
          ...existing,
          firstMsgAt: existing.firstMsgAt && existing.firstMsgAt < timestamp ? existing.firstMsgAt : timestamp,
          lastMsgAt: existing.lastMsgAt && existing.lastMsgAt > timestamp ? existing.lastMsgAt : timestamp,
          questionCount: existing.questionCount + (isUserMessage ? 1 : 0)
        };

        if (isUserMessage && (!existing.firstUserMsgAt || timestamp < existing.firstUserMsgAt)) {
          updatedSession.firstUserMsgAt = timestamp;
          if (typeof item.text === 'string') {
            updatedSession.firstUserMessage = item.text;
          }
        }

        sessions.set(key, updatedSession);
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const sessionSummaries: SessionSummary[] = [];

  for (const session of sessions.values()) {
    const start = session.startedAt || session.firstMsgAt;
    const end = session.lastMsgAt || session.firstMsgAt || session.startedAt;
    if (!start || !end) continue;

    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) continue;
    if (startDate < fromDate || startDate > toDate) continue;

    const stat = stats.get(sessionKey(session.userId, session.sessionId));
    const durationMinutes = typeof stat?.durationMinutes === 'number'
      ? stat.durationMinutes
      : Math.max(0, Math.round((new Date(end).getTime() - startDate.getTime()) / 60000));

    const questionCount = typeof stat?.questionCount === 'number'
      ? stat.questionCount
      : session.questionCount;

    const title = (session.firstUserMessage || 'Konversation')
      .split(/[\s.!?]+/)
      .slice(0, 5)
      .join(' ');

    sessionSummaries.push({
      childUserId: session.userId,
      sessionId: session.sessionId,
      title,
      startedAt: startDate.toISOString(),
      subject: session.subject || 'Okänt',
      durationMinutes,
      questionCount,
      quizScore: typeof stat?.quizScore === 'number' ? stat.quizScore : null
    });
  }

  sessionSummaries.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  if (childId && !childUsernames.has(childId)) {
    const childItem = await db.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk,
        sk: `user#${childId}`
      }
    }));

    if (childItem.Item && typeof childItem.Item.username === 'string') {
      childUsernames.set(childId, childItem.Item.username);
    }
  }

  let childUsername: string | null = null;
  if (childId) {
    childUsername = childUsernames.get(childId) || null;
  } else if (sessionSummaries.length > 0 && sessionSummaries[0]) {
    childUsername = childUsernames.get(sessionSummaries[0].childUserId) || null;
  } else {
    const firstChild = childUsernames.values().next();
    childUsername = firstChild.done ? null : firstChild.value;
  }

  const dailyMap = new Map<string, { minutes: number; questionCount: number; quizScores: number[] }>();
  let totalMinutes = 0;
  let totalQuestions = 0;
  const quizScores: number[] = [];
  const subjectCounts = new Map<string, number>();

  for (const session of sessionSummaries) {
    const dateKey = session.startedAt.slice(0, 10);
    const entry = dailyMap.get(dateKey) || { minutes: 0, questionCount: 0, quizScores: [] };
    entry.minutes += session.durationMinutes;
    entry.questionCount += session.questionCount;
    if (typeof session.quizScore === 'number') {
      entry.quizScores.push(session.quizScore);
      quizScores.push(session.quizScore);
    }
    dailyMap.set(dateKey, entry);

    totalMinutes += session.durationMinutes;
    totalQuestions += session.questionCount;

    if (session.subject) {
      subjectCounts.set(session.subject, (subjectCounts.get(session.subject) || 0) + 1);
    }
  }

  const dailyStats: DailyStat[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      minutes: data.minutes,
      questionCount: data.questionCount,
      avgQuizScore: data.quizScores.length
        ? Math.round(data.quizScores.reduce((sum, score) => sum + score, 0) / data.quizScores.length)
        : null
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const avgQuizScore = quizScores.length
    ? Math.round(quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length)
    : null;

  let topSubject: string | null = null;
  let maxSubjectCount = 0;
  for (const [subject, count] of subjectCounts.entries()) {
    if (count > maxSubjectCount) {
      maxSubjectCount = count;
      topSubject = subject;
    }
  }

  res.json({
    overview: {
      totalMinutes,
      questionCount: totalQuestions,
      avgQuizScore,
      topSubject,
      sessionsCount: sessionSummaries.length
    },
    childUsername,
    dailyStats,
    recentSessions: sessionSummaries.slice(0, 6)
  });
});

export default router;
