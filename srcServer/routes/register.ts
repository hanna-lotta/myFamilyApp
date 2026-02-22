import express from 'express'
import type { Router, Request, Response } from 'express'
import { db, tableName } from '../data/dynamoDb.js';
import { createToken } from '../data/auth.js';
import { genSalt, hash } from 'bcrypt'
import { registerSchema, ChildInviteLookupItemSchema, UserLookupItemSchema, JwtResponseSchema } from '../validation.js';
import type { JwtResponseType } from '../validation.js';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { JwtResponse, UserBody, ErrorMessage, FamilyMetadata, UserLookupItem, ChildInviteLookupItem, RegisterResponse } from '../data/types.js';

/**
 * Ny familje-struktur med invite-system:
 * 
 * Alternativ 1: Skapa ny familj (utan invite-kod)
 * - Första användaren registrerar sig utan kod
 * - Skapa en ny familj med unikt ID (t.ex. family#abc123)
 * - Ge användaren rollen "parent"
 * - Generera en inbjudningskod (t.ex. "A1B2C3D4")
 * - Användaren kan dela koden med familjemedlemmar
 * 
 * Alternativ 2: Gå med i befintlig familj (med invite-kod)
 * - Andra familjemedlemmar anger koden vid registrering
 * - De hamnar i samma familj
 * - förälder kan välja att ge "child" eller "parent" roll till nya medlemmar som går med via 	invite. Förälder registrerar barnets fördelsedatum (valfritt) som sparas i familje-strukturen
 * 
 * Lookup-item struktur för snabb inloggning:
 * - pk: USERNAME#username, sk: LOOKUP
 * - Innehåller password, familyId, userId
 */

const router: Router = express.Router();

// Färgpalette för användare - olika snygga färger
const userColorPalette = [
	'#9B7EBD', // Lila
	'#82a6cf', // Blå
	'#E89B7E', // Persika/orange
	'#6B9FA3', // Turkos
	'#C77B8A', // Rosa
	'#8BA366', // Olivgrön
	'#9B8EC4', // Lavendel
	'#D4A373', // Beige/guld
	'#7EB09B', // Mintgrön
	'#B07E9E', // Plommon
	'#7EA1B0', // Stålblå
	'#C9A77C', // Sand
];

// Funktion för att välja en random färg
const getRandomUserColor = (): string => {
	const randomIndex = Math.floor(Math.random() * userColorPalette.length); // Math.random() ger ett tal mellan 0 (inklusive) och 1 (exklusive). Genom att multiplicera med array-längden och sedan använda Math.floor() får vi ett heltal index som är giltigt för arrayen. 
	return userColorPalette[randomIndex]!; //! för att säga till TypeScript att värdet aldrig kommer vara undefined (eftersom index alltid är mellan 0 och array-längden). [randomIndex] hämtar färgen på det slumpmässiga indexet.
};

// Generera en unik invite-kod (8 tecken)
const generateInviteCode = (): string => {
	return crypto.randomUUID().split('-')[0]!.toUpperCase(); // Använder första delen av en UUID (8 tecken) som invite-kod, och gör den versal. Exempel: "A1B2C3D4". 
};

// Request; 1. P = route params (t.ex. { userId: string })
// 2. ResBody = det förväntade response-body-typen (vad res.send(...) returnerar)
// 3. ReqBody = request body (vad klienten POST:ar)
// 4. ReqQuery = query-string typen
// man kan ha unknown istället för JwtResponse för det är redan typad

router.post('/', async (req: Request<{}, JwtResponse, UserBody>, res: Response<JwtResponse | ErrorMessage>) => {
	const validation = registerSchema.safeParse(req.body); 
	if (!validation.success) {
		res.status(400).send({error: "Invalid request body"}); // Bad request
		return;
	}

	const { username, password, inviteCode, childBirthdate } = validation.data; // Destrukturera de validerade fälten från request body. username och password är obligatoriska, medan inviteCode och childBirthdate är valfria.
	
	// Behandla tom sträng som undefined
	const cleanInviteCode = inviteCode?.trim() || undefined; // Om inviteCode finns, trimma den och om det resulterar i en tom sträng, sätt den till undefined.
	const birthDate = childBirthdate?.trim() || undefined; // Samma för childBirthdate - lagras som birthDate internt

	console.log('Registration attempt:', { username, hasInviteCode: !!cleanInviteCode, inviteCode: cleanInviteCode, birthDate: birthDate });

	try {
		// Kolla om username redan finns
		const existingUser = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${username}`,
				sk: 'LOOKUP' // kolla om ett användarnamn redan finns utan att behöva skanna hela tabellen.
			}
		}));

		if (existingUser.Item) {
			res.status(409).send({ error: 'Username already exists' }); // Conflict - användarnamnet är redan taget
			return;
		}

		// Funktion från bcrypt som genererar en "salt"-sträng.
		// Genom att anropa utan argument används ett standardantal rounds (ofta 10) — du kan ange ett tal: genSalt(12).
		// Den returnerar en Promise (därav await) som ger en string, t.ex. "$2b$10$Kix...".
		const salt = await genSalt();
		// Tar lösenordet (plain text) och saltet, kör bcrypt-algoritmen och returnerar en Promise som ger den hashade strängen.
		const hashedPassword = await hash(password, salt);
		const userId = crypto.randomUUID(); // Genererar ett unikt ID för användaren. Detta används både i familje-strukturen och i lookup-itemet för att koppla ihop användaren med deras familj och inloggningsuppgifter.
		const userColor = getRandomUserColor(); // Välj en random färg för användaren

		let familyId: string;
		let role: 'parent' | 'child' = 'parent'; // Default-rollen är "parent" för den som skapar en ny familj, men om de går med i en befintlig familj kan de välja "child" eller "parent" (om de inte väljer något defaultas det till "child").
		let familyInviteCode: string | undefined; // Denna variabel kommer bara att sättas om en ny familj skapas, och innehåller den genererade invite-koden som kan delas med andra. Om användaren går med i en befintlig familj, kommer denna variabel förbli undefined och ingen ny kod skapas. Detta gör det tydligt i svaret från API:et om en ny familj skapades eller inte, baserat på om inviteCode returneras eller inte.

		// Scenario 1: Skapa ny familj (ingen invite-kod)
		if (!cleanInviteCode) { // Om ingen invite-kod skickades, antar vi att användaren vill skapa en ny familj. Vi genererar ett nytt familyId och en invite-kod, och skapar sedan både familje-metadata och lookup-item för invite-koden.
			familyId = crypto.randomUUID();
			familyInviteCode = generateInviteCode();

			// Skapa familje-metadata
			await db.send(new PutCommand({
				TableName: tableName,
				Item: {
					pk: `family#${familyId}`,
					sk: 'META',
					name: `${username}s familj`,
					createdAt: new Date().toISOString(),
					inviteCode: familyInviteCode
				}
			}));

			// Skapa lookup-item för invite-koden (snabb sökning)
			await db.send(new PutCommand({
				TableName: tableName,
				Item: {
					pk: `INVITE#${familyInviteCode}`,
					sk: 'LOOKUP',
					familyId: `family#${familyId}`
				}
			}));

		} else {
			// Scenario 2: Gå med i befintlig familj
			// Kolla först om det är en child_invite (barnets invite)
			const childInviteLookup = await db.send(new GetCommand({
				TableName: tableName,
				Key: {
					pk: `CHILD_INVITE#${cleanInviteCode}`,
					sk: 'LOOKUP'
				}
			}));

			if (childInviteLookup.Item) {
				// Det är en barnets invite - validera med Zod
				const childInviteData = ChildInviteLookupItemSchema.parse(childInviteLookup.Item);
				
				if (childInviteData.used) {
					res.status(409).send({ error: 'Child invite code already used' });
					return;
				}

				familyId = childInviteData.familyId.split('#')[1]!; // Extrahera familyId
				role = 'child'; // Barnet får automatiskt child-rollen
			} else {
				// Prova parent invite (vanlig invite för familj-medlemmar)
				const inviteLookup = await db.send(new GetCommand({
					TableName: tableName,
					Key: {
						pk: `INVITE#${cleanInviteCode}`,
						sk: 'LOOKUP'
					}
				}));

				if (!inviteLookup.Item) {
					res.status(404).send({ error: 'Invalid invite code' });
					return;
				}

				familyId = inviteLookup.Item.familyId.split('#')[1]!; // Extrahera själva ID:t från strängen "family#<id>"
			// Vanlig invite ger alltid parent-rollen
			role = 'parent';
			}
		}

		// Skapa användare i familjen
		await db.send(new PutCommand({
			TableName: tableName,
			Item: {
				pk: `family#${familyId}`,
				sk: `user#${userId}`,
				username,
				role,
				color: userColor,
				createdAt: new Date().toISOString(),
				...(birthDate && role === 'child' ? { birthDate: birthDate } : {}) // Om det är ett barn och vi har ett födelsedatum, spara det
			}
		}));
		//as const gör att TypeScript behandlar sk som den exakta strängen 'LOOKUP' istället för en generisk string.
		// Skapa lookup-item för snabb inloggning
		const lookupItem: UserLookupItem = {
			pk: `USERNAME#${username}`,
			sk: 'LOOKUP',
			username,
			password: hashedPassword,
			familyId: `family#${familyId}`,
			userId: `user#${userId}`
		};

		// Validera med Zod innan vi sparar
		const validatedLookupItem = UserLookupItemSchema.parse(lookupItem);

		await db.send(new PutCommand({
			TableName: tableName,
			Item: validatedLookupItem
		}));

		// Skapa JWT-token
		const token = createToken(userId, username, role, familyId);

		// Om det var en child_invite, markera den som använd
		if (cleanInviteCode && role === 'child') {
			await db.send(new PutCommand({
				TableName: tableName,
				Item: {
					pk: `CHILD_INVITE#${cleanInviteCode}`,
					sk: 'LOOKUP',
					used: true
				}
			}));
		}
		
		const responseObj: RegisterResponse = { // RegisterResponse är samma som JwtResponse men med inviteCode som optional, vilket passar både scenario 1 (ny familj) och scenario 2 (gå med i befintlig familj).
			success: true,
			token,
			username,
			color: userColor,
			familyId: `family#${familyId}`,
			role
		};

		if (familyInviteCode) { // Om en ny familj skapades, inkludera invite-koden i svaret så att klienten kan visa den för användaren att dela med familjemedlemmar. Om användaren gick med i en befintlig familj, kommer denna kod att vara undefined och inte inkluderas i svaret.
			responseObj.inviteCode = familyInviteCode; 
		}

		
		JwtResponseSchema.parse(responseObj);
		res.send(responseObj);

		console.log(`User registered: ${username} in family ${familyId} with role ${role}`);

	} catch(error) {
		console.log(`register.ts error:`, (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router