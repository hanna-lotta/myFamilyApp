import { evaluate } from 'mathjs'; // Math.js för matematiska beräkningar
import * as deepl from 'deepl-node'; // DeepL API
import wiki from 'wikipedia'; // Wikipedia API
import multer from 'multer'; // För bilduppladdning
import type { OpenAI } from 'openai';

// Typdeklaration för globalThis.openai för att undvika TypeScript-fel
declare global {
  // Minimalt interface för det som används
  var openai: {
    createChatCompletion: (args: any) => Promise<any>;
  } | undefined;
}

// Alias för wikipedia
const wikipedia = wiki;

// Definiera tools som AI:n kan använda
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Utför exakta matematiska beräkningar. Använd detta för att räkna ut matematiska uttryck.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Matematiskt uttryck att beräkna, t.ex. '2+2', '5*8', 'sqrt(16)', '(10+5)*2'"
          }
        },
        required: ["expression"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_spelling",
      description: "Kontrollera stavning av svenska ord och ge förslag på rätt stavning",
      parameters: {
        type: "object",
        properties: {
          word: {
            type: "string",
            description: "Ord att kontrollera stavningen på"
          }
        },
        required: ["word"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_information",
      description: "Sök efter faktainformation inom NO-ämnen (naturvetenskap), historia, geografi etc.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Fråga eller sökterm att hitta information om"
          },
          subject: {
            type: "string",
            enum: ["naturvetenskap", "biologi", "fysik", "kemi", "historia", "geografi", "samhällskunskap"],
            description: "Ämnesområde för sökningen"
          }
        },
        required: ["query", "subject"]
      }
    }
  }
];


// Tool-implementationer
async function executeTool(toolName: string, args: any): Promise<string> {
  switch (toolName) {
    case "calculate":
      try {
        const result = evaluate(args.expression);
        return `Beräkning av "${args.expression}" = ${result}`;
      } catch (error) {
        return `Kunde inte beräkna uttrycket "${args.expression}". Kontrollera att det är ett giltigt matematiskt uttryck.`;
      }

    case "check_spelling": {
      // Låt AI-modellen själv föreslå rätt stavning och feedback
      // Prompten är på svenska och anpassad för barn
      const prompt = `Du är en snäll svensklärare för barn. Kontrollera stavningen på ordet "${args.word}". Om det är felstavat, ge en vänlig förklaring och rätt stavning. Om det är rätt, beröm barnet.`;
      // Här används OpenAI:s API direkt om det finns tillgängligt i din miljö
      if (typeof globalThis.openai === 'object' && globalThis.openai.createChatCompletion) {
        const completion = await globalThis.openai.createChatCompletion({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'Du är en hjälpsam svensklärare för barn.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 60,
          temperature: 0.2
        });
        return completion.choices?.[0]?.message?.content || `Jag kunde inte kontrollera stavningen just nu.`;
      } else {
        // Fallback om ingen AI-modell finns tillgänglig
        return `Jag kan inte kontrollera stavningen just nu, men AI:n kan ofta hjälpa till om du frågar direkt i chatten!`;
      }
    }

    case "search_information":
      try {
        // Sätt språk baserat på ämne (använd svenska Wikipedia som standard)
        // @ts-ignore
        await wikipedia.setLang('sv');
        
        // Sök efter artiklar
        // @ts-ignore
        const searchResults = await wikipedia.search(args.query, { limit: 1 });
        
        if (!searchResults.results || searchResults.results.length === 0) {
          return `Hittade ingen information om "${args.query}" inom ${args.subject}. Försök omformulera frågan.`;
        }
        
        // Hämta sammanfattning av första artikeln
        // @ts-ignore
        const page = await wikipedia.page(searchResults.results[0].title);
        const summary = await page.summary();
        
        // Returnera en kortare version av sammanfattningen (första 500 tecken)
        const shortSummary = summary.extract.length > 500 
          ? summary.extract.substring(0, 500) + '...' 
          : summary.extract;
        
        return `Information om "${args.query}" (${args.subject}):\n\n${shortSummary}\n\nKälla: Wikipedia`;
      } catch (error) {
        console.error('Wikipedia search error:', error);
        return `Kunde inte hitta information om "${args.query}". Försök med en annan fråga.`;
      }

    default:
      return "Okänd funktion";
  }
}

export { tools, executeTool };