import { evaluate } from 'mathjs'; // Math.js för matematiska beräkningar
import * as deepl from 'deepl-node'; // DeepL API
import wiki from 'wikipedia'; // Wikipedia API
import multer from 'multer'; // För bilduppladdning
import type { OpenAI } from 'openai';

// Initiera DeepL translator (om API-nyckel finns)
const translator = process.env.DEEPL_API_KEY 
  ? new deepl.Translator(process.env.DEEPL_API_KEY)
  : null;

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
      name: "translate",
      description: "Översätt text mellan svenska och engelska",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text att översätta"
          },
          from_language: {
            type: "string",
            enum: ["svenska", "engelska"],
            description: "Språk att översätta från"
          },
          to_language: {
            type: "string",
            enum: ["svenska", "engelska"],
            description: "Språk att översätta till"
          }
        },
        required: ["text", "from_language", "to_language"]
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
/**Färdiga verktyg:
Kalkylator - Exakta matematiska beräkningar (mathjs)
Översättare - Professionella översättningar (DeepL) 
Wikipedia-sökning - Faktainformation från svenska Wikipedia 
Stavningskontroll - Grundläggande stavningskontroll */

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

    case "translate":
      if (!translator) {
        return `Översättning från ${args.from_language} till ${args.to_language}: "${args.text}" (DeepL ej konfigurerad)`;
      }
      try {
        const sourceLang = args.from_language === 'svenska' ? 'sv' : 'en';
        const targetLang = args.to_language === 'svenska' ? 'sv' : 'en';
        const result = await translator.translateText(args.text, sourceLang, targetLang as deepl.TargetLanguageCode);
        const translatedText = Array.isArray(result) ? result[0]?.text : result.text;
        return `Översättning: "${translatedText || args.text}"`;
      } catch (error) {
        return `Kunde inte översätta texten. Försök igen.`;
      }

    case "check_spelling":
      // Enkel stavningskontroll - i produktion kan du använda ett rättstavnings-API
      return `Stavningskontroll för ordet "${args.word}"`;

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