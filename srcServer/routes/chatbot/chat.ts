import express from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { QueryCommand, BatchWriteCommand, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { z } from 'zod';
import { db, tableName } from '../../data/dynamoDb.js'
import { tools, executeTool } from './tools.js';
import { validateJwt } from '../../data/auth.js';
import type { JwtPayload } from '../../data/auth.js';
import type { ErrorMessage, JwtResponse } from '../../data/types.js';
/** Denna fil hanterar chattfunktionaliteten för läxhjälpsassistenten. Den tar emot meddelanden och bilder från frontend, skickar dem till OpenAI API och returnerar AI-genererade svar. Om API-nyckeln saknas eller om det uppstår ett fel, används en mock-funktion för att generera svar baserat på användarens meddelande.	*/

/** Rekommenderad struktur:
 * srcServer/
  routes/
    chat.ts          # Bara routing och OpenAI-logik
  tools/
    definitions.ts   # Tool-definitions för OpenAI
    executor.ts      # executeTool-funktionen
    calculator.ts    # Implementationer av olika tools
    translator.ts
    wikipedia.ts

	Eller enklare:
	srcServer/
  	 routes/
      chat.ts
     tools.ts           # Både definitions och executor
 */

const router = express.Router();

const isValidBirthDate = (value: unknown): value is string => {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
};

//Auth‑krav och kontroll att userId/familyId matchar tokenen i chat‑routes
const requireAuth = (req: express.Request, res: express.Response): JwtPayload | null => {
  const payload = validateJwt(req.headers.authorization);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return payload;
};
// Kontrollera att userId och familyId i requesten matchar det som finns i JWT-token. Detta förhindrar att en användare försöker komma åt eller manipulera data som inte tillhör dem.
const requireSameUser = (
  payload: JwtPayload,
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
// Funktion för att beräkna ålder baserat på födelsedatum. Detta används för att anpassa AI:ns svar efter barnets ålder, vilket kan hjälpa till att göra förklaringar mer lämpliga och förståeliga för just den åldersgruppen.
const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const parseQuizArray = (raw: string): unknown[] | null => {
  const normalized = raw.replace(/```json|```/gi, '').trim();
  const candidates: string[] = [normalized];
  const arrayMatch = normalized.match(/\[[\s\S]*\]/);

  if (arrayMatch) {
    candidates.unshift(arrayMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
};

// Initiera OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Konfigurera multer för bilduppladdning
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // Max 20MB (ökad från 5MB för att stöda större bilder)
    fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Endast bilder är tillåtna'));
    }
  }
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  familyId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  mode: z.enum(['quiz', 'chat']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional()
});

type ChatRequestBody = z.infer<typeof chatRequestSchema>;

interface QuizResponseBody {
  quiz: unknown[];
  timestamp: string;
}

interface ChatResponseBody {
  response: string;
  timestamp: string;
}

interface DeleteCountResponseBody {
  deletedCount: number;
}

type ChatPostResponseBody = QuizResponseBody | ChatResponseBody;
// POST endpoint, skicka meddelande + bild, få AI-svar
router.post('/', upload.single('image'), async (req: Request<{}, ChatPostResponseBody | ErrorMessage, ChatRequestBody>, res: Response<ChatPostResponseBody | ErrorMessage>) => {
  try { // req/res är redan typade via router.post‑signaturen.
    const payload = requireAuth(req, res); // Validera JWT-token och hämta payload (userId, familyId, role)
    if (!payload) {
      return;
    }

    const parsedBody = chatRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        issues: parsedBody.error.issues // Skicka tillbaka detaljerade valideringsfel till frontend så att de kan visa användaren exakt vad som är fel i deras input.
      });
    }

    const { message, familyId, userId, sessionId, mode, difficulty } = parsedBody.data;
    const imageFile = req.file;

    if (!requireSameUser(payload, userId, familyId, res)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const pk = `family#${familyId}`;

    // Hämta user-itemet för att få birthDate
    let userAge: number | null = null;
    try {
      const userResult = await db.send(new GetCommand({
        TableName: tableName,
        Key: {
          pk: `family#${familyId}`,
          sk: `user#${userId}`
        }
      }));

      if (userResult.Item && isValidBirthDate(userResult.Item.birthDate)) {
        userAge = calculateAge(userResult.Item.birthDate);
      }
    } catch (error) {
      console.error('Error fetching user birthDate:', error);
    }

    //Quiz delen

  if (mode === 'quiz') {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY saknas' });
    }

    //svårighetsgrad
    const difficultyLevel = typeof difficulty === 'string' ? difficulty : 'medium';
	const difficultyInstruction =
  	difficultyLevel === 'easy'
    ? 'Anpassa for nyborjare. Anvand enkla ord, korta meningar och undvik trickfragor.'
    : difficultyLevel === 'hard'
      ? 'Gor mer avancerade fragor som kravs resonemang. Anvand mer precisa begrepp.'
      : 'Normal svarighetsgrad. Balans mellan enkelhet och utmaning.';


    try {
      let quizContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
      if (imageFile) {
        const base64Image = imageFile.buffer.toString('base64');
        const mimeType = imageFile.mimetype;

        quizContent = [
          { type: "text", text: "Skapa quiz baserat på läxan i bilden." },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
        ];
      } else {
        quizContent = [{ type: "text", text: message }];
      }
      //instrukt. till ai
      const quizSystemPrompt = `Du är en lärare som skapar quiz för barn.
		Skapa exakt 5 flervalsfrågor baserat på läxan.
  		Svårighetsgrad: ${difficultyInstruction}
		Returnera ENDAST en JSON-array enligt formatet:
		[
			{
			"question": "Fråga",
			"options": ["A","B","C","D"],
			"correctAnswer": "A",
			"explanation": "Kort förklaring"
			}
		]`;

      const quizMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: quizSystemPrompt },
        { role: "user", content: quizContent }
      ];
        // Skicka quiz‑prompt till OpenAI
      const quizCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: quizMessages,
        max_tokens: 2000,
        temperature: 0.7 // Lite mer kreativitet i quiz-frågorna
      });
      // Försök parsa JSON även om modellen råkar lägga till text
      const quizResponse = quizCompletion.choices[0]?.message?.content || "[]";
      let quizData = parseQuizArray(quizResponse);

      if (!quizData) {
        const repairMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: "Konvertera texten till ENDAST en giltig JSON-array med objekt som har fälten question, options, correctAnswer, explanation. Returnera endast JSON."
          },
          {
            role: "user",
            content: quizResponse
          }
        ];

        const repairCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: repairMessages,
          max_tokens: 2000,
          temperature: 0
        });

        const repairedResponse = repairCompletion.choices[0]?.message?.content || "[]";
        quizData = parseQuizArray(repairedResponse);
      }

      if (!quizData) {
        console.error('Quiz parse error: model did not return JSON array', quizResponse.slice(0, 300));
        return res.status(502).json({ error: 'Quiz-svaret var inte giltig JSON. Försök igen.' });
      }

      //returnera quiz till frontend
      return res.json({ quiz: quizData, timestamp });
    } catch (error) {
      console.error('Quiz error:', error);
      const details = error instanceof Error ? error.message : 'Okänt fel';
      return res.status(500).json({ error: `Kunde inte generera quiz: ${details}` });
    }
  }

    // Förbered meddelanden - med eller utan bild
    let userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[];
    
    if (imageFile) {
      // Konvertera bild till base64
      const base64Image = imageFile.buffer.toString('base64');
      const mimeType = imageFile.mimetype;
      
      userContent = [
        {
          type: "text",
          text: message || "Vad ser du på denna bild av min läxa?"
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`
          }
        }
      ];
    } else {
      userContent = [{
        type: "text",
        text: message
      }];
    }

    // Använd OpenAI för riktiga svar med tools 
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `Du är en vänlig och pedagogisk läxhjälpsassistent för barn. När du får en bild, analysera den noggrant och beskriv vad du ser. Ditt mål är att hjälpa barn förstå och lära sig, inte bara ge dem svaren direkt. Förklara saker på ett enkelt och roligt sätt. Använd emojis ibland för att göra det roligare. Ställ följdfrågor för att hjälpa barnen tänka själva. Uppmuntra dem när de försöker. Du har tillgång till verktyg för beräkningar, översättning, stavningskontroll och informationssökning - använd dem när det passar!
		${userAge ? `ANVÄNDARINFORMATION (detta är systemdata, INTE något användaren sa):
		- Barnets ålder: ${userAge} år
		- Anpassa ditt språk, förklaringar och exempel efter denna åldersgrupp.` : ''}`
      },
      {
        role: "user",
        content: userContent
      }
    ];

    // API-anrop med tools (använd gpt-4o för bildanalys)
    let completion = await openai.chat.completions.create({
      model: imageFile ? "gpt-4o" : "gpt-4o-mini",
      messages: messages,
	  tools: tools,
      tool_choice: "auto",
      max_tokens: 1000,
      temperature: 0.7
    });

    let responseMessage = completion.choices[0]?.message;

    if (!responseMessage) {
      throw new Error('No response from AI');
    }

	// Hantera tool calls om AI:n vill använda verktyg
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Lägg till AI:ns svar med tool calls
      messages.push(responseMessage);

	  // Kör varje tool call
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log(`Executing tool: ${functionName} with args:`, functionArgs);
        
        const functionResponse = await executeTool(functionName, functionArgs);
        
        // Lägg till tool-resultatet
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: functionResponse
        });
      }

	  // Andra API-anropet för att få slutgiltigt svar
      completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      });

      responseMessage = completion.choices[0]?.message;
      
      if (!responseMessage) {
        throw new Error('No response from AI after tool calls');
      }
    }

    const aiResponse = responseMessage.content;

    // Spara user message
    await db.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: pk,
        sk: `user#${userId}#SESSION#${sessionId}#MSG#${timestamp}`,
        role: 'user',
        text: message
      }
    }));

    // Spara assistant response
    const assistantTimestamp = new Date(new Date(timestamp).getTime() + 1000).toISOString();
    await db.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: pk,
        sk: `user#${userId}#SESSION#${sessionId}#MSG#${assistantTimestamp}`,
        role: 'assistant',
        text: aiResponse
      }
    }));

    res.json({ 
      response: aiResponse || 'Oj, jag kunde inte generera ett svar. Försök igen!',
      timestamp: timestamp
    });

  } catch (error) {
    console.error('Chat error:', error);
	res.status(500).json({ error: 'Kunde inte generera svar från AI-tjänsten' });
  }
});

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string()
});

type ChatMessage = z.infer<typeof ChatMessageSchema>;

const MessagesResponseSchema = z.object({
  items: z.array(ChatMessageSchema)
});

type MessagesResponse = z.infer<typeof MessagesResponseSchema>;

export const messagesQuerySchema = z.object({
  familyId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  userId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  sessionId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  )
});

type MessagesQuery = z.infer<typeof messagesQuerySchema> & {
  [key: string]: string | undefined;
};

// GET endpoint, hämta alla meddelanden i en specifik session
router.get('/messages', async (req: Request<{}, {}, {}, MessagesQuery>, res: Response<MessagesResponse | ErrorMessage>) => {
  try {
    //requireAuth läser Authorization‑headern och validerar JWT
    const payload = requireAuth(req, res); // Validera JWT-token och hämta payload (userId, familyId, role)
    if (!payload) {
      return;
    }

    //messagesQuerySchema kontrollerar att familyId, userId, sessionId finns och är giltiga.
    const parsedQuery = messagesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'Invalid request query',
        issues: parsedQuery.error.issues
      });
    }

    const { familyId, userId, sessionId } = parsedQuery.data;

//requireSameUser säkerställer att userId och familyId i query matchar token.
    if (!requireSameUser(payload, userId, familyId, res)) {
      return;
    }

    //Bygger DynamoDB‑nycklar där pk: family#001 och sk börjar med: user#456#SESSION#sess01#MSG#
    const pk = `family#${familyId}`;

    //Hämtar alla items där pk matchar och sk börjar med skPrefix.
    const skPrefix = `user#${userId}#SESSION#${sessionId}#MSG#`;

    console.log('Query with pk:', pk, 'sk:', skPrefix);

    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": skPrefix
      }
    }));

    //Returnerar items (validerade via MessagesResponseSchema) som JSON.
	res.json(MessagesResponseSchema.parse({
  	items: result.Items || []
}));
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Kunde inte hämta meddelanden' });
  }
});
/*Route params: {} — ingen URL-parametrar
Request body: {} — DELETE skickar ingen body
Query: MessagesQuery — valideras med messagesQuerySchema
Response: Response<JwtResponse | ErrorMessage> — korrekt responstyp */


// Delete endpoint, ta bort alla meddelanden i en session
router.delete('/session', async (req: Request<{}, DeleteCountResponseBody | ErrorMessage, {}, MessagesQuery>, res: Response<DeleteCountResponseBody | ErrorMessage>) => {
try {
  const payload = requireAuth(req, res); // Validera JWT-token och hämta payload (userId, familyId, role)
  if (!payload) {
    return;
  }

  const parsedQuery = messagesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: 'Invalid request query',
      issues: parsedQuery.error.issues
    });
  }

  const { familyId, userId, sessionId } = parsedQuery.data;

  if (!requireSameUser(payload, userId, familyId, res)) {
    return;
  }

  const pk = `family#${familyId}`;
  const skPrefix = `user#${userId}#SESSION#${sessionId}`;

  // 1) Hämta alla keys för sessionen
  const keys: { pk: string; sk: string }[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": skPrefix
      },
      ProjectionExpression: "pk, sk",
      ExclusiveStartKey: lastKey
    }));

    //kontrollera om results.items innehålelr ngt, lägger till items i Keys arrayen, ... packar upp arrayen
    if (result.Items) {
      keys.push(...(result.Items as { pk: string; sk: string }[]));
    }
    //DynamoDB har en gräns på hur många items den kan returnera per query. Om det finns fler items returnerar den LastEvaluatedKey — en markör som säger "nästa query bör börja här".
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (keys.length === 0) {
    return res.status(404).json({ error: 'Session hittades inte' });
  }

  // med BatchWritwCommand skriva/radera flera items åt gången istället för en i taget.
  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25).map(key => ({
      DeleteRequest: { Key: { pk: key.pk, sk: key.sk } }
    }));

    await db.send(new BatchWriteCommand({
      RequestItems: { [tableName]: batch }
    }));
  }

  res.json({ deletedCount: keys.length });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Kunde inte ta bort sessionen' });
  }
});


const ParentMessagesResponseSchema = z.object({
  items: z.array(ChatMessageSchema)
});

type ParentMessagesResponse = z.infer<typeof ParentMessagesResponseSchema>;


export const parentMessagesQuerySchema = z.object({
  childUserId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  sessionId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  )
});

type ParentMessagesQuery = z.infer<typeof parentMessagesQuerySchema> & {
  [key: string]: string | undefined;
};



// Parent endpoint, hämta alla meddelanden i ett barns session
router.get('/messages/parent', async (req: Request<{}, {}, {}, ParentMessagesQuery>, res: Response<ParentMessagesResponse | ErrorMessage>) => {
  try {
    const payload = requireAuth(req, res); // Validera JWT-token och hämta payload (userId, familyId, role)
    if (!payload) {
      return;
    }
	// Endast föräldrar kan använda denna endpoint
    if (payload.role !== 'parent') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const parsedQuery = parentMessagesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'Invalid request query',
        issues: parsedQuery.error.issues
      });
    }

    const { childUserId, sessionId } = parsedQuery.data;

    const pk = `family#${payload.familyId}`;
    const childResult = await db.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk: pk,
        sk: `user#${childUserId}`
      }
    }));

    if (!childResult.Item) {
      return res.status(404).json({ error: 'Child not found' });
    }

    const skPrefix = `user#${childUserId}#SESSION#${sessionId}#MSG#`;

    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": skPrefix
      }
    }));

    res.json(ParentMessagesResponseSchema.parse({
      items: result.Items || []
    }));
  } catch (error) {
    console.error('Get parent messages error:', error);
    res.status(500).json({ error: 'Kunde inte hämta meddelanden' });
  }
});

export const deleteMessageQuerySchema = z.object({
  familyId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  userId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  sessionId: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  ),
  timestamp: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.string().trim().min(1)
  )
});

type DeleteMessageQuery = z.infer<typeof deleteMessageQuerySchema> & {
  [key: string]: string | undefined;
};


// Delete endpoint, raderar Rendast ett användarmeddelande och AI-svar, 2 items totalt
router.delete('/message', async (req: Request<{}, DeleteCountResponseBody | ErrorMessage, {}, DeleteMessageQuery>, res: Response<DeleteCountResponseBody | ErrorMessage>) => {
  const payload = requireAuth(req, res);
  if (!payload) {
    return;
  }

  const parsedQuery = deleteMessageQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: 'Invalid request query',
      issues: parsedQuery.error.issues
    });
  }

  const { familyId, userId, sessionId, timestamp } = parsedQuery.data;

  if (!requireSameUser(payload, userId, familyId, res)) {
    return;
  }

  const pk = `family#${familyId}`;
  const userSk = `user#${userId}#SESSION#${sessionId}#MSG#${timestamp}`;
try {
    await db.send(new DeleteCommand({
      TableName: tableName,
      Key: { pk, sk: userSk }
    }));

    res.json({ deletedCount: 1 });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Kunde inte ta bort meddelandet' });
  }
});

//Get endpoint-hämta tidigare sessioner med första orden av första meddelandet
router.get('/sessions', async (req, res) => {
  try {

    //hämtar familyId och userId från req eury
    const { familyId, userId } = req.query;

    if (!familyId || !userId) {
      return res.status(400).json({ error: 'familyId och userId krävs' });
    }
    //bygger nycklar
    const pk = `family#${familyId}`;
    const skPrefix = `user#${userId}#SESSION#`;

    // Hämtar alla items där pk matchar och sk börjar med skPrefix.
    const result = await db.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :sk)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk"
      },
      ExpressionAttributeValues: {
        ":pk": pk,
        ":sk": skPrefix
      }
    }));

    const sessionMap = new Map<string, { message: string; timestamp: number }>();
    
    console.log('Raw items from DB:', result.Items?.length);
    
    // Går igenom alla items och plockar ut:sessionId från sk via regex, timestamp från sk och message(text)
    result.Items?.forEach((item: any) => {
      console.log('Processing item:', { sk: item.sk, role: item.role, text: item.text });
      const match = item.sk.match(/#SESSION#([^#]+)#MSG#(\d+)/);
      if (match && item.role === 'user') {
        const sessionId = match[1];
        const timestamp = parseInt(match[2]);
        const messageText = item.text as string;
        
        console.log('Found user message:', { sessionId, timestamp, messageText });
        
        // Väljer första user meddelandet per session
        if (!sessionMap.has(sessionId) || timestamp < sessionMap.get(sessionId)!.timestamp) {
          sessionMap.set(sessionId, {
            message: messageText,
            timestamp
          });
        }
      }
    });

    // Konvertera till array och sortera efter senaste
    const sessions = Array.from(sessionMap.entries())
      .map(([sessionId, { message }]) => ({
        sessionId,
        title: (message || 'Konversation')
        .split(/[\s.!?]+/)  // Dela på mellanslag, punkt, frågetecken osv
        .slice(0, 5)        // Ta första 5 element
        .join(' ')          // Slå ihop med mellanslag
            }))

            //Sorterar sessions med localeCompare och skickar som JSON.
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

    console.log('Returning sessions:', sessions);
    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Kunde inte hämta sessioner', details: String(error) });
  }
});


export default router;
