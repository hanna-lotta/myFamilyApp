import express from 'express'
import type { Router, Request, Response } from 'express'
import { db, tableName } from '../data/dynamoDb.js';
import { createToken } from '../data/auth.js';
import { genSalt, hash } from 'bcrypt'
import { registerSchema } from '../validation.js';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { JwtResponse, UserBody, ErrorMessage, FamilyMetadata, UserLookupItem } from '../data/types.js';

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
 * - väljer roll (parent/child) eller defaultar till child
 * 
 * Lookup-item struktur för snabb inloggning:
 * - pk: USERNAME#username, sk: LOOKUP
 * - Innehåller password, familyId, userId
 * - Snabbare än GSI och ingen extra kostnad
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
	const randomIndex = Math.floor(Math.random() * userColorPalette.length);
	return userColorPalette[randomIndex]!; //! för att säga till TypeScript att värdet aldrig kommer vara undefined (eftersom index alltid är mellan 0 och array-längden).
};

// Generera en unik invite-kod (8 tecken)
const generateInviteCode = (): string => {
	return crypto.randomUUID().split('-')[0]!.toUpperCase();
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

	const { username, password, inviteCode, role: selectedRole } = validation.data;
	
	// Behandla tom sträng som undefined
	const cleanInviteCode = inviteCode?.trim() || undefined;

	console.log('Registration attempt:', { username, hasInviteCode: !!cleanInviteCode, inviteCode: cleanInviteCode, selectedRole });

	try {
		// Kolla om username redan finns
		const existingUser = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${username}`,
				sk: 'LOOKUP'
			}
		}));

		if (existingUser.Item) {
			res.status(409).send({ error: 'Username already exists' });
			return;
		}

		// Funktion från bcrypt som genererar en "salt"-sträng.
		// Genom att anropa utan argument används ett standardantal rounds (ofta 10) — du kan ange ett tal: genSalt(12).
		// Den returnerar en Promise (därav await) som ger en string, t.ex. "$2b$10$Kix...".
		const salt = await genSalt();
		// Tar lösenordet (plain text) och saltet, kör bcrypt-algoritmen och returnerar en Promise som ger den hashade strängen.
		const hashedPassword = await hash(password, salt);
		const userId = crypto.randomUUID();
		const userColor = getRandomUserColor(); // Välj en random färg för användaren

		let familyId: string;
		let role: 'parent' | 'child' = 'parent';
		let familyInviteCode: string | undefined;

		// Scenario 1: Skapa ny familj (ingen invite-kod)
		if (!cleanInviteCode) {
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
			// Hitta familj via invite-kod lookup (mycket snabbare än Scan!)
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

			familyId = inviteLookup.Item.familyId.split('#')[1]!;
			// Använd vald roll, eller defaulta till 'child' om ingen valdes
			role = selectedRole || 'child';
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
				createdAt: new Date().toISOString()
			}
		}));

		// Skapa lookup-item för snabb inloggning
		await db.send(new PutCommand({
			TableName: tableName,
			Item: {
				pk: `USERNAME#${username}`,
				sk: 'LOOKUP',
				username,
				password: hashedPassword,
				familyId: `family#${familyId}`,
				userId: `user#${userId}`
			} as UserLookupItem
		}));

		// Skapa JWT-token
		const token = createToken(userId, username, role, familyId);

		res.send({ 
			success: true, 
			token, 
			username, 
			color: userColor,
			familyId: `family#${familyId}`,
			role,
			inviteCode: familyInviteCode // Returnera endast om ny familj skapades
		} as JwtResponse);

		console.log(`User registered: ${username} in family ${familyId} with role ${role}`);

	} catch(error) {
		console.log(`register.ts error:`, (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router