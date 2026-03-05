import express from 'express'
import type { Router, Request, Response } from 'express'
import { validateJwt } from '../data/auth.js';
import type { ErrorMessage, DeleteAccountRes } from '../data/types.js'
import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'
import { z } from 'zod';
import { deleteAccountResSchema, statsResponseSchema, todoIdSchema, todoItemSchema, todoSchema, todosResponseSchema, type StatsResponse, type TodoItem, type TodosResponse } from '../validation.js';

const router: Router = express.Router();


//Delete endpoint för att radera konto. 
router.delete('/delete', async (req: Request<{}, DeleteAccountRes | ErrorMessage>, res: Response<DeleteAccountRes | ErrorMessage>) => {
	
	const payload = validateJwt(req.headers.authorization);
	if (!payload) {
		res.status(401).send({ error: 'Unauthorized' });
		return;
	}

	try {
		// Ta bort användaren från family-tabellen (pk: family#UUID dvs familje identifieraren, sk: user#UUID dvs användarens indifierare)
		await db.send(new DeleteCommand({
			TableName: tableName,
			Key: {
				pk: `family#${payload.familyId}`,
				sk: payload.userId
			}
		}));


        // Lookup, en teknik Dynamobd har som fung. som en snabbväg för att hitta en användare. både user och user i family tabellen  måste raderas för att helt ta bort en användare.
		await db.send(new DeleteCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${payload.username}`,
				sk: 'LOOKUP'
			}
		}));

		 // Validera response med zod
      	const parsed = deleteAccountResSchema.safeParse({ success: true });
      	 if (!parsed.success) {
        res.status(500).send({ error: 'Fel i delete-response-format', issues: parsed.error.issues });
        return;
      }

		res.send(parsed.data);
		console.log(`User deleted: ${payload.username} (${payload.userId})`);

	} catch (error) {
		console.log('user.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});


// Kontrollera att userId och familyId i requesten matchar det som finns i JWT-token. Detta förhindrar att en användare försöker komma åt eller manipulera data som inte tillhör dem.
const requireSameUser = (
  payload: any,
  userId: string,
  familyId: string,
  res: express.Response
): boolean => {
  if (payload.userId !== userId || payload.familyId !== familyId) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};



router.get('/stats',async (req: Request, res: Response<StatsResponse | ErrorMessage>
  ) => {
	
  const payload = validateJwt(req.headers.authorization);
  if (!payload) {
    res.status(401).send({ error: 'Unauthorized' });
    return;
  }

  // Kontrollera att användaren bara får hämta sin egen statistik
  if (!requireSameUser(payload, payload.userId, payload.familyId, res)) {
    return;
  }

  try {
    // Hämta alla STATS-items för användaren
    const pk = `family#${payload.familyId}`;
    const skPrefix = `user#${payload.userId}#SESSION#`;
    const result = await db.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk and begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':sk': skPrefix
        }
      })
    );
    const items = result.Items || [];

    // Filtrera ut endast STATS-items
    const statsItems = items.filter((item: any) => typeof item.sk === 'string' && item.sk.endsWith('#STATS'));

    // Hämta även session-items för att kunna koppla startedAt till STATS
    const sessionItems = items.filter((item: any) => typeof item.sk === 'string' && !item.sk.endsWith('#STATS'));
    // Bygg en map sessionId -> startedAt
    const sessionStartedAtMap = new Map<string, string>();
    for (const s of sessionItems) {
      const match = s.sk.match(/^user#[^#]+#SESSION#([^#]+)/);
      if (match && typeof s.startedAt === 'string') {
        sessionStartedAtMap.set(match[1], s.startedAt);
      }
    }

    // Summera statistik
    let totalMinutes = 0;
    let questionCount = 0;
    let quizSum = 0;
    let quizCount = 0;
    // const subjectMap: Record<string, number> = {}; (borttagen)

    for (const s of statsItems) {
      totalMinutes += s.durationMinutes || 0;
      questionCount += s.questionCount || 0;
      if (typeof s.quizScore === 'number') {
        quizSum += s.quizScore;
        quizCount++;
      }
      // if (s.subject) {
      //   subjectMap[s.subject] = (subjectMap[s.subject] || 0) + 1;
      // }
    }

    // Mest tränat ämne borttaget

    // Bygg dailyStats: summera minuter och frågor per dag
    const dailyMap = new Map<string, { minutes: number; questionCount: number }>();
    for (const s of statsItems) {
      let dateKey: string | undefined;
      if (typeof s.startedAt === 'string') {
        dateKey = s.startedAt.slice(0, 10);
      } else {
        // Försök hitta startedAt från session-item
        const match = s.sk.match(/^user#[^#]+#SESSION#([^#]+)/);
        if (match) {
          const startedAt = sessionStartedAtMap.get(match[1]);
          if (startedAt) dateKey = startedAt.slice(0, 10);
        }
      }
      if (dateKey) {
        const entry = dailyMap.get(dateKey) || { minutes: 0, questionCount: 0 };
        entry.minutes += s.durationMinutes || 0;
        entry.questionCount += s.questionCount || 0;
        dailyMap.set(dateKey, entry);
      }
    }
    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Bygg response-objekt
    const responseData = {
      totalMinutes,
      questionCount,
      avgQuizScore: quizCount > 0 ? Math.round((quizSum / quizCount) * 10) / 10 : null,
      dailyStats
    };

    // Validera hela response med Zod
    const parsed = statsResponseSchema.safeParse(responseData);
    if (!parsed.success) {
      res.status(500).send({ error: 'Fel i statistik-format', issues: parsed.error.issues });
      return;
    }
    res.json(parsed.data);
  } catch (error) {
    console.error('user/stats error:', (error as any)?.message);
    res.status(500).send({ error: 'Kunde inte hämta statistik.' });
  }
});



// GET /api/user/todos - hämta alla todos för inloggad användare
router.get(
  '/todos',
  async (req: Request, res: Response<TodosResponse | ErrorMessage>) => {

    const payload = validateJwt(req.headers.authorization);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });

    const pk = `FAMILY#${payload.familyId}`;
    const skPrefix = `USER#${payload.userId}#TODO#`;

    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': pk, ':skPrefix': skPrefix }
    }));

    const todos: TodoItem[] = (result.Items || [])
      .map(item => ({
        todoId: typeof item.sk === 'string' ? item.sk.split('#').pop() ?? '' : '',
        text: typeof item.text === 'string' ? item.text : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : ''
      }))
      .filter(todo => todoItemSchema.safeParse(todo).success);

    const parsed = todosResponseSchema.safeParse({ todos });
    if (!parsed.success) {
      return res.status(500).json({ error: 'Fel i todo-format', issues: parsed.error.issues });
    }
    res.json(parsed.data);
  }
);


// POST /api/user/todos - skapa en ny todo
router.post('/todos', async (req, res) => {
  const payload = validateJwt(req.headers.authorization);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const parseResult = todoSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Ogiltig todo', issues: parseResult.error.issues });
  }
  const { text } = parseResult.data;

  const pk = `FAMILY#${payload.familyId}`;
  const todoId = Date.now().toString();
  const sk = `USER#${payload.userId}#TODO#${todoId}`;

  await db.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk,
      sk,
      text,
      createdAt: new Date().toISOString()
    }
  }));
  res.json({ success: true, todoId });
});


interface todoIdParams {
  todoId: string;
}
interface DeleteTodoRes {
  success: boolean | ErrorMessage;
}


// DELETE /api/user/todos/:todoId - ta bort en todo
router.delete('/todos/:todoId', async (req: Request<todoIdParams>, res: Response<DeleteTodoRes | ErrorMessage>) => {

  const payload = validateJwt(req.headers.authorization);
  if (!payload) 
	return res.status(401).json({ error: 'Unauthorized' });

  const parseResult = todoIdSchema.safeParse(req.params);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Ogiltigt todoId', issues: parseResult.error.issues });
  }

  const { todoId } = parseResult.data;

  const pk = `FAMILY#${payload.familyId}`;
  const sk = `USER#${payload.userId}#TODO#${todoId}`;

  await db.send(new DeleteCommand({
    TableName: tableName,
    Key: { pk, sk }
  }));
  res.json({ success: true });
});

export default router
