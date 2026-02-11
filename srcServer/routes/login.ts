import express from 'express'
import type { Router, Request, Response } from 'express'
import { createToken } from '../data/auth.js';
import type { JwtResponse, UserBody, ErrorMessage, UserLookupItem, FamilyUserItem } from '../data/types.js'
import { registerSchema } from '../validation.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'
import { compare } from 'bcrypt'

const router: Router = express.Router();

router.post('/', async (req: Request<{}, JwtResponse, UserBody>, res: Response<JwtResponse | ErrorMessage>) => {
	const validation = registerSchema.safeParse(req.body);
	if (!validation.success) {
		res.status(400).send({ error: 'Invalid request body' });
		return;
	}

	const { username, password } = validation.data;

	try {
		// Steg 1: Hämta lookup-item för att hitta familyId och userId
		const lookupResult = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${username}`,
				sk: 'LOOKUP'
			}
		}));

		if (!lookupResult.Item) {
			res.status(401).send({ error: 'Invalid credentials' });
			return;
		}

		const lookupItem = lookupResult.Item as UserLookupItem;

		// Steg 2: Validera lösenord
		const passwordMatch = await compare(password, lookupItem.password);
		if (!passwordMatch) {
			res.status(401).send({ error: 'Invalid credentials' });
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
			res.status(500).send({ error: 'User data not found' });
			return;
		}

		const userItem = userResult.Item as FamilyUserItem;
		
		// Extrahera userId från sk (format: "user#UUID")
		const userId = userItem.sk.split('#')[1];
		if (!userId) {
			res.status(500).send({ error: 'Invalid user ID format' });
			return;
		}

		// Extrahera familyId från pk (format: "family#UUID")
		const familyId = userItem.pk.split('#')[1];
		if (!familyId) {
			res.status(500).send({ error: 'Invalid family ID format' });
			return;
		}

		// Steg 4: Skapa JWT-token med alla relevanta värden
		const token = createToken(userId, userItem.username, userItem.role, familyId);

		// Steg 5: Returnera framgångsrikt login
		res.send({ 
			success: true, 
			token, 
			username: userItem.username, 
			color: userItem.color,
			familyId: lookupItem.familyId,
			role: userItem.role
		} as JwtResponse);

		console.log(`User logged in: ${userItem.username} (${userItem.role}) in family ${familyId}`);

	} catch (error) {
		console.log('login.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router