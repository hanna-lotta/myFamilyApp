import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';

/** Denna fil hanterar chattfunktionaliteten för läxhjälpsassistenten. Den tar emot meddelanden och bilder från frontend, skickar dem till OpenAI API och returnerar AI-genererade svar. Om API-nyckeln saknas eller om det uppstår ett fel, används en mock-funktion för att generera svar baserat på användarens meddelande.	*/

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

router.post('/chat', upload.single('image'), async (req, res) => {
  try {
    const { message } = req.body;
    const imageFile = req.file;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Om API-nyckel saknas, använd mock-svar
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OpenAI API key not found, using mock response');
      const mockResponse = generateMockResponse(message);
      return res.json({ 
        response: mockResponse,
        timestamp: new Date().toISOString()
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

    //hämta alla meddelanden i en specifik session
    router.get('/chat/messages', async (req, res) => {
      const { familyId, userId, sessionId } = req.query;

      if (!familyId || !userId || !sessionId) {
        return res.status(400).json({ error: 'familyId, userId, sessionId krävs' });
      }

      // Exempel: bygg PK och SK-prefix från dina värden
      // PK: FAMILY#001
      // SK börjar med: USER#456#SESSION#sess01#MSG#
      const pk = `FAMILY#${familyId}`;
      const sk = `USER#${userId}#SESSION#${sessionId}#MSG#`;

      // Här skulle du göra din DynamoDB query med pk + skPrefix
      // (ingen kod här eftersom du bara bad om GET‑endpoint)

      res.json({ pk, sk});
    });

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

    res.json({ 
      response: aiResponse || 'Oj, jag kunde inte generera ett svar. Försök igen!',
      timestamp: new Date().toISOString()
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

export default router;
