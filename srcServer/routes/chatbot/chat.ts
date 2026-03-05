import express from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { QueryCommand, BatchWriteCommand, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, tableName } from '../../data/dynamoDb.js'
import { tools, executeTool } from './tools.js';
import { validateJwt } from '../../data/auth.js';
import type { JwtPayload } from '../../data/auth.js';
import type { ErrorMessage } from '../../data/types.js';
import { chatRequestSchema, deleteMessageQuerySchema, messagesQuerySchema, parentMessagesQuerySchema, ParentMessagesResponseSchema, sessionsQuerySchema, sessionsResponseSchema, statsRequestSchema, type ChatRequestBody, type DeleteMessageQuery, type MessagesQuery, type MessagesResponse, type ParentMessagesQuery, type ParentMessagesResponse, type SessionsQuery, type SessionsResponse, type StatsRequestBody } from '../../validation.js';



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
  limits: { fileSize: 20 * 1024 * 1024 }, // Max 20MB 
    fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';
    if (isImage || isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Endast bilder eller PDF är tillåtna'));
    }
  }
});



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

router.post('/stats', async (req: Request<{}, { ok: boolean } | ErrorMessage, StatsRequestBody>, res: Response<{ ok: boolean } | ErrorMessage>) => {
  try {
    const payload = requireAuth(req, res);
    if (!payload) {
      return;
    }

    const parsedBody = statsRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        issues: parsedBody.error.issues
      });
    }

    const { familyId, userId, sessionId, quizScore, questionCount, subject } = parsedBody.data;

    if (!requireSameUser(payload, userId, familyId, res)) {
      return;
    }

    const pk = `family#${familyId}`;
    const sessionSk = `user#${userId}#SESSION#${sessionId}`;
    const statsSk = `${sessionSk}#STATS`;
    const nowIso = new Date().toISOString();

    // Fetch existing SESSION item to preserve startedAt
    const sessionResult = await db.send(new GetCommand({
      TableName: tableName,
      Key: { pk, sk: sessionSk }
    }));

    const startedAt = typeof sessionResult.Item?.startedAt === 'string' 
      ? sessionResult.Item.startedAt 
      : nowIso;
    const existingSubject = typeof sessionResult.Item?.subject === 'string' 
      ? sessionResult.Item.subject 
      : subject || 'Okänt';

    // Upsert SESSION with subject if provided
    await db.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk,
        sk: sessionSk,
        startedAt,
        subject: existingSubject
      }
    }));

    // Fetch existing STATS to merge with current values
    const statsResult = await db.send(new GetCommand({
      TableName: tableName,
      Key: { pk, sk: statsSk }
    }));

    // Build STATS item: preserve durationMinutes, add/update quizScore & questionCount
    const statsItem: Record<string, unknown> = {
      pk,
      sk: statsSk
    };

    if (typeof statsResult.Item?.durationMinutes === 'number') {
      statsItem.durationMinutes = statsResult.Item.durationMinutes;
    }
    
    statsItem.quizScore = quizScore;  // Always update with new quizScore
    
    // Use provided questionCount if given, otherwise preserve existing
    if (typeof questionCount === 'number') {
      statsItem.questionCount = questionCount;
    } else if (typeof statsResult.Item?.questionCount === 'number') {
      statsItem.questionCount = statsResult.Item.questionCount;
    }

    await db.send(new PutCommand({
      TableName: tableName,
      Item: statsItem
    }));

    return res.json({ ok: true });
  } catch (error) {
    console.error('Save stats error:', error);
    return res.status(500).json({ error: 'Kunde inte spara statistik' });
  }
});

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

    const { message, familyId, userId, sessionId, mode, difficulty, subject } = parsedBody.data;
    const imageFile = req.file;

    if (!requireSameUser(payload, userId, familyId, res)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const pk = `family#${familyId}`;
    const sessionSk = `user#${userId}#SESSION#${sessionId}`;

    // PDF handling block
    let pdfText = '';
    const isPdf = imageFile?.mimetype === 'application/pdf';
    if (imageFile && isPdf) {
      // @ts-ignore
      const pdfParse = require('pdf-parse');
      let parsed: { text?: string } = {};
      try {
        parsed = await pdfParse(imageFile.buffer);
      } catch (error) {
        console.error('PDF-parse error:', error);
        return res.status(400).json({
          response: 'Kunde inte läsa PDF-filen.',
          timestamp
        });
      }
      pdfText = (parsed.text || '').trim();
      if (!pdfText) {
        return res.json({
          response: 'PDF innehåller ingen markerbar text (troligen skannad).',
          timestamp
        });
      }
    }

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
      "question": "Frågetexten här",
      "options": ["Svarsalternativ 1", "Svarsalternativ 2", "Svarsalternativ 3", "Svarsalternativ 4"],
      "correctAnswer": "Svarsalternativ 1",
      "explanation": "Kort förklaring varför detta är rätt"
      }
    ]
    VIKTIGT: options ska bara vara svarstext (ingen bokstav A/B/C/D), och correctAnswer ska vara exakt samma text som ett av alternativen.`;

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

		MYCKET VIKTIG FORMATERING - LÄSNING MÅSTE VARA LÄTT:
		
		ABSOLUT FÖRBJUDET - ANVÄND ALDRIG:
		- Asterisker * eller ** (ingen fetstil, ingen italik)
		- Hashtags # eller ### (inga rubriker)
		- Streck - eller --- (inga linjer)
		- Backticks \` eller \`\`\`
		- Hakparenteser [ ] eller { }
		
		ANVÄND ISTÄLLET - GRUPPERAT FORMAT:
		- Gruppera relaterade meningar tillsammans (INGEN blank rad mellan meningar i samma grupp)
		- En BLANK RAD (endast mellan olika ämnen/grupper)
		- Maximalt 3-4 meningar per grupp innan du växlar ämne
		- Enkel text utan specialtecken
		
		RÄTT FORMAT - KOPIERA EXAKT DENNA STIL:
		
		Hej! 🌟
		
		Låt oss börja med första uppgiften!
		
		Du har 34 morötter hemma. 5 morötter äts upp av familjen. Hur många morötter blir kvar?
		Kan du försöka räkna ut det? 🤔
		
		I en låda ligger 41 nötter. 27 nötter äts upp. Hur många nötter är kvar?
		Försök att räkna detta också! 🥜
		
		Skriv ner dina svar och vi kontrollerar dem tillsammans 📝

		VIKTIGT - Din primära uppgift:
		Du är specifikt en LÄXHJÄLPSASSISTENT. Hjälp endast med:
		- Skolämnen (matte, svenska, SO, NO, engelska, etc.)
		- Läxor och skoluppgifter
		- Förståelsefrågor om det barnet lär sig i skolan
		- Studieteknik och inlärning

		Om barnet frågar om saker som INTE är skolrelaterade (t.ex. spelrekommendationer, filmtips, allmän konversation), svara vänligt:
		"Jag är här för att hjälpa dig med läxor och skolarbete! 📚 Har du någon läxa eller skoluppgift jag kan hjälpa dig med?"

		VIKTIGT - Hantering av känsliga ämnen:
		Om barnet frågar om eller nämner känsliga ämnen som:
		- Våld, mobbning eller hot (i hemmet, skolan eller på nätet)
		- Psykisk ohälsa, ångest, depression eller självskadebeteende
		- Missbruk, droger eller alkohol
		- Sexuella trakasserier eller kränkningar
		- Självmordstankar eller självskada

		Svara då ALLTID på detta sätt:
		1. Validera barnets känslor med empati (t.ex. "Jag förstår att det måste kännas svårt")
		2. Förklara tydligt att du är en läxhjälpsassistent och inte kan ge den hjälp som behövs för sådana frågor
		3. Uppmuntra barnet att prata med en vuxen de litar på (förälder, lärare, skolkurator, skolsköterska)
		4. Ge ALLTID dessa kontaktuppgifter till organisationer med tystnadsplikt:

		📞 BRIS (Barnens Rätt I Samhället) - för barn och unga upp till 18 år:
		• Telefon: 116 111 (kostnadsfritt, öppet varje dag kl 9-21)
		• Chatt: www.bris.se
		• Du kan vara anonym och allt du säger är hemligt

		📞 Friends - mot mobbning:
		• Telefon: 116 123 (kostnadsfritt)
		• friends.se

		📞 Mind - för unga med psykisk ohälsa:
		• Chatt: www.mind.se

		📞 112 - vid akut fara eller hot

		Försök INTE agera terapeut, ge medicinska råd eller lösa sådana problem själv.

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

    // Detektera känsligt innehåll - spara inte meddelanden där AI:n ger hjälpnummer
    const isSensitiveContent = aiResponse && (
      aiResponse.includes('116 111') || // BRIS
      aiResponse.includes('116 123') || // Friends
      aiResponse.includes('BRIS') ||
      aiResponse.includes('Friends') ||
      aiResponse.includes('Mind') 
    );

    // Detektera "endast läxor/skolarbete"-svar - spara inte dessa heller
    const isNonSchoolContent = aiResponse && (
      aiResponse.includes('Jag är här för att hjälpa dig med läxor och skolarbete!')
    );

    // Spara endast till databas om det INTE är känsligt innehåll eller icke-skolrelaterat
    if (!isSensitiveContent && !isNonSchoolContent) {
      const sessionResult = await db.send(new GetCommand({
        TableName: tableName,
        Key: {
          pk,
          sk: sessionSk
        }
      }));

      const startedAt = typeof sessionResult.Item?.startedAt === 'string'
        ? sessionResult.Item.startedAt
        : timestamp;

      const subjectValue = subject || (
        typeof sessionResult.Item?.subject === 'string'
          ? sessionResult.Item.subject
          : 'Okänt'
      );

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk,
          sk: sessionSk,
          startedAt,
          subject: subjectValue
        }
      }));

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
    } else {
     
    }

    // Hämta session för att uppdatera stats (även för känsliga meddelanden)
    const sessionResult = await db.send(new GetCommand({
      TableName: tableName,
      Key: {
        pk,
        sk: sessionSk
      }
    }));

    const startedAt = typeof sessionResult.Item?.startedAt === 'string'
      ? sessionResult.Item.startedAt
      : timestamp;

    const durationMinutes = Math.max(
      0,
      Math.round((new Date(timestamp).getTime() - new Date(startedAt).getTime()) / 60000)
    );

    // Uppdatera stats endast om det INTE är känsligt innehåll
    if (!isSensitiveContent) {
      await db.send(new UpdateCommand({
        TableName: tableName,
        Key: {
          pk,
          sk: `${sessionSk}#STATS`
        },
        UpdateExpression: 'SET durationMinutes = :durationMinutes, quizScore = if_not_exists(quizScore, :quizScore) ADD questionCount :questionIncrement',
        ExpressionAttributeValues: {
          ':durationMinutes': durationMinutes,
          ':quizScore': null,
          ':questionIncrement': 1
        }
      }));
    }

    res.json({ 
      response: aiResponse || 'Oj, jag kunde inte generera ett svar. Försök igen!',
      timestamp: timestamp
    });

  } catch (error) {
    console.error('Chat error:', error);
	res.status(500).json({ error: 'Kunde inte generera svar från AI-tjänsten' });
  }
});

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
	res.json(ParentMessagesResponseSchema.parse({
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
router.get('/sessions', async (req: Request<{}, SessionsResponse | ErrorMessage, {}, SessionsQuery>, res: Response<SessionsResponse | ErrorMessage>) => {
  try {

    const payload = requireAuth(req, res);
    if (!payload) {
      return;
    }

    const parsedQuery = sessionsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ error: 'Invalid request query' });
    }

    //hämtar familyId och userId från req query
    const { familyId, userId } = parsedQuery.data;

    if (!requireSameUser(payload, userId, familyId, res)) {
      return;
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
    
    
    // Går igenom alla items och plockar ut:sessionId från sk via regex, timestamp från sk och message(text)
    result.Items?.forEach((item: any) => {
      
      const match = item.sk.match(/#SESSION#([^#]+)#MSG#(\d+)/);
      if (match && item.role === 'user') {
        const sessionId = match[1];
        const timestamp = parseInt(match[2]);
        const messageText = item.text as string;
        
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

    res.json(sessionsResponseSchema.parse(sessions));
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Kunde inte hämta sessioner' });
  }
});


export default router;
