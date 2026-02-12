import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { QueryCommand, BatchWriteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { db, tableName } from '../data/dynamoDb.js'

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

// Initiera OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Konfigurera multer för bilduppladdning
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // Max 5MB
});

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { message, familyId, userId, sessionId, mode } = req.body;
    const imageFile = req.file;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!familyId || !userId || !sessionId) {
      return res.status(400).json({ error: 'familyId, userId, sessionId krävs' });
    }

    const timestamp = new Date().toISOString();
    const pk = `family#${familyId}`;

    //Quiz delen

  if (mode === 'quiz') {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY saknas' });
    }

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
        temperature: 0.7
      });
      // Försök parsa JSON även om modellen råkar lägga till text
      const quizResponse = quizCompletion.choices[0]?.message?.content || "[]";
      const jsonMatch = quizResponse.match(/\[[\s\S]*\]/);
      const quizData = JSON.parse(jsonMatch ? jsonMatch[0] : quizResponse);

      //returnera quiz til lfrontend
      return res.json({ quiz: quizData, timestamp });
    } catch (error) {
      console.error('Quiz error:', error);
      return res.status(500).json({ error: 'Kunde inte generera quiz' });
    }
  }

    // Om API-nyckel saknas, använd mock-svar
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not found, using mock response');
      const mockResponse = generateMockResponse(message);
      
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
      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: pk,
          sk: `user#${userId}#SESSION#${sessionId}#MSG#${new Date(new Date(timestamp).getTime() + 1000).toISOString()}`,
          role: 'assistant',
          text: mockResponse
        }
      }));

      return res.json({ 
        response: mockResponse,
        timestamp: timestamp
      });
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

    // Använd OpenAI för riktiga svar
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "Du är en vänlig och pedagogisk läxhjälpsassistent för barn. När du får en bild, analysera den noggrant och beskriv vad du ser. Ditt mål är att hjälpa barn förstå och lära sig, inte bara ge dem svaren direkt. Förklara saker på ett enkelt och roligt sätt. Använd emojis ibland för att göra det roligare. Ställ följdfrågor för att hjälpa barnen tänka själva. Uppmuntra dem när de försöker."
      },
      {
        role: "user",
        content: userContent
      }
    ];

    // API-anrop (använd gpt-4o för bildanalys)
    const completion = await openai.chat.completions.create({
      model: imageFile ? "gpt-4o" : "gpt-4o-mini",
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const responseMessage = completion.choices[0]?.message;

    if (!responseMessage) {
      throw new Error('No response from AI');
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
    
    // Fallback till mock-svar vid fel
    const mockResponse = generateMockResponse(req.body.message);
    res.json({ 
      response: mockResponse + ' (OBS: AI-tjänsten är inte tillgänglig just nu)',
      timestamp: new Date().toISOString()
    });
  }
});

// GET endpoint, hämta alla meddelanden i en specifik session
router.get('/chat/messages', async (req, res) => {
  try {
    const { familyId, userId, sessionId } = req.query;

    if (!familyId || !userId || !sessionId) {
      return res.status(400).json({ error: 'familyId, userId, sessionId krävs' });
    }

    // pk: family#001
    // sk börjar med: user#456#SESSION#sess01#MSG#
    const pk = `family#${familyId}`;
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

    res.json({ items: result.Items || [] });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Kunde inte hämta meddelanden' });
  }
});

// Delete endpoint, ta bort alla meddelanden i en session
router.delete('/chat/session', async (req, res) => {
  const { familyId, userId, sessionId } = req.query;

  if (!familyId || !userId || !sessionId) {
    return res.status(400).json({ error: 'familyId, userId, sessionId krävs' });
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
});

// Hjälpfunktion för mock-svar (ta bort när du integrerar riktig AI)
function generateMockResponse(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('matte') || lowerMessage.includes('matematik')) {
    return 'Jag kan hjälpa dig med matte! Vad undrar du över? Addition, subtraktion, multiplikation, division eller något annat? 🔢';
  } else if (lowerMessage.includes('svenska')) {
    return 'Svenska är kul! Vill du ha hjälp med grammatik, stavning, läsförståelse eller att skriva berättelser? 📖';
  } else if (lowerMessage.includes('engelska')) {
    return 'Great! I can help you with English! What would you like to practice - vocabulary, grammar, or reading? 🌍';
  } else if (lowerMessage.includes('hej') || lowerMessage.includes('hallå')) {
    return 'Hej på dig! Vad roligt att du är här. Vilken läxa behöver du hjälp med idag? 😊';
  } else if (lowerMessage.includes('tack')) {
    return 'Varsågod! Kom tillbaka när du vill ha mer hjälp. Lycka till med läxorna! 🌟';
  } else {
    return 'Det låter intressant! Kan du berätta lite mer om vad du behöver hjälp med? Ju mer du berättar, desto bättre kan jag hjälpa dig! 💡';
  }
}

// Delete endpoint, raderar Rendast ett användarmeddelande och AI-svar, 2 items totalt
router.delete('/chat/message', async (req, res) => {
  const { familyId, userId, sessionId, timestamp } = req.query;

  if (!familyId || !userId || !sessionId || !timestamp) {
    return res.status(400).json({ error: 'familyId, userId, sessionId, timestamp krävs' });
  }

  const pk = `family#${familyId}`;
  const userSk = `user#${userId}#SESSION#${sessionId}#MSG#${timestamp}`;
  const assistantSk = `user#${userId}#SESSION#${sessionId}#MSG#${new Date(new Date(timestamp as string).getTime() + 1000).toISOString()}`;

  try {
    await db.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: [
          { DeleteRequest: { Key: { pk, sk: userSk } } },
          { DeleteRequest: { Key: { pk, sk: assistantSk } } }
        ]
      }
    }));

    res.json({ deletedCount: 2 });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Kunde inte ta bort meddelandet' });
  }
});

export default router;
