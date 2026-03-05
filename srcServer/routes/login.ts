import express from 'express'
import type { Router, Request, Response } from 'express'
import { createToken } from '../data/auth.js';
import type { JwtResponse, UserBody, ErrorMessage, UserLookupItem, FamilyUserItem } from '../data/types.js'
import { registerSchema, FamilyUserItemSchema, UserLookupItemSchema, JwtResponseSchema } from '../validation.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'
import { compare } from 'bcrypt'

const router: Router = express.Router();

router.post('/', async (req: Request<{}, JwtResponse, UserBody>, res: Response<JwtResponse | ErrorMessage>) => {
	const validation = registerSchema.safeParse(req.body); // Validera request body mot det definierade schemat (username, password, inviteCode, role). Detta säkerställer att vi har alla nödvändiga fält och att de är av rätt typ innan vi fortsätter med inloggningslogiken.
	if (!validation.success) {
		res.status(400).send({ error: 'Invalid request body' }); // Bad request - klienten skickade data som inte matchar det förväntade formatet eller saknar nödvändiga fält.
		return;
	}

	const { username, password } = validation.data; // Destrukturera de validerade fälten från request body. För inloggning behöver vi bara username och password, inviteCode och role används endast vid registrering.

	try {
		// Steg 1: Hämta lookup-item för att hitta familyId och userId
		const lookupResult = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${username}`,
				sk: 'LOOKUP' // Vi använder en lookup-item där pk är USERNAME#username och sk är LOOKUP för att snabbt kunna kolla om ett användarnamn redan finns utan att behöva skanna hela tabellen.
			}
		}));

		if (!lookupResult.Item) {
			res.status(401).send({ error: 'Invalid credentials' }); // Unauthorized - användarnamnet finns inte, eller så är det felaktigt. Vi vill inte avslöja om det är användarnamnet eller lösenordet som är fel, så vi returnerar samma generiska felmeddelande för båda fallen.
			return;
		}

		// Validera med Zod //parse passar Bra för intern data. Om valideringen misslyckas = internt systemfel, inte user error
		const lookupItem = UserLookupItemSchema.parse(lookupResult.Item);

		// Steg 2: Validera lösenord
		const passwordMatch = await compare(password, lookupItem.password);
		if (!passwordMatch) {
			res.status(401).send({ error: 'Invalid credentials' }); // Unauthorized - lösenordet är felaktigt. Vi vill inte avslöja om det är användarnamnet eller lösenordet som är fel, så vi returnerar samma generiska felmeddelande för båda fallen.
			return;
		}

		// Steg 3: Hämta användarens fullständiga data från familjen
		const userResult = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: lookupItem.familyId,
				sk: lookupItem.userId
			}
		}));

		if (!userResult.Item) {
			res.status(500).send({ error: 'User data not found' }); // Internal server error - detta borde inte hända eftersom vi redan har en lookup-item som pekar på denna userId och familyId
			return;
		}

		// Validera med Zod //parse passar Bra för intern data. Om valideringen misslyckas = internt systemfel, inte user error
		const userItem = FamilyUserItemSchema.parse(userResult.Item);
		
		// Extrahera userId från sk (format: "user#UUID")
		const userId = userItem.sk.split('#')[1]; // Eftersom sk i userItem är i formatet "user#<id>", splittrar vi strängen på '#' och tar den andra delen (index 1) för att få själva userId. Detta är viktigt eftersom vi behöver userId för att skapa JWT-token och för andra operationer som kräver en unik identifierare för användaren.
		if (!userId) {
			res.status(500).send({ error: 'Invalid user ID format' }); // Internal server error - detta borde inte hända eftersom sk alltid borde vara i formatet "user#<id>"
			return;
		}

		// Extrahera familyId från pk (format: "family#UUID")
		const familyId = userItem.pk.split('#')[1]; // Eftersom pk i userItem är i formatet "family#<id>", splittrar vi strängen på '#' och tar den andra delen (index 1) för att få själva familyId. Detta är viktigt eftersom vi behöver familyId för att skapa JWT-token och för andra operationer som kräver en unik identifierare för familjen.
		if (!familyId) {
			res.status(500).send({ error: 'Invalid family ID format' }); // Internal server error - detta borde inte hända eftersom pk alltid borde vara i formatet "family#<id>"
			return;
		}

		// Steg 4: Skapa JWT-token med alla relevanta värden
		const token = createToken(userId, userItem.username, userItem.role, familyId); 

		// Steg 5: Returnera framgångsrikt login
		const responseObj: JwtResponse = {
			success: true,
			token,
			username: userItem.username,
			color: userItem.color,
			familyId: lookupItem.familyId,
			role: userItem.role
		};

		// Validera med Zod innan vi skickar
		JwtResponseSchema.parse(responseObj);
		res.send(responseObj);

		console.log(`User logged in: ${userItem.username} (${userItem.role}) in family ${familyId}`);

	} catch (error) {
		console.log('login.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router