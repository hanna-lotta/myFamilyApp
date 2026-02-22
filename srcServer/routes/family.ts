import express from 'express'
import type { Router, Request, Response } from 'express'
import { validateJwt } from '../data/auth.js';
import type { ErrorMessage } from '../data/types.js'
import { ChildInviteLookupItemSchema, inviteCodeResponseSchema, childInviteRequestSchema, childInviteResponseSchema, FamilyMetadataSchema } from '../validation.js'
import type { ChildInviteRequest, ChildInviteResponse, InviteCodeResponse } from '../validation.js'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'

const router: Router = express.Router();

/**
 * GET /api/family/invite-code
 * 
 * Hämtar invite-koden för användarens familj.
 * Alla familjemedlemmar kan hämta koden för att bjuda in nya medlemmar.
 * 
 * Header: Authorization: Bearer: <token>
 * Response: { inviteCode: string } | { error: string }
 */

router.get('/invite-code', async (req: Request<{}, {}, {}>, res: Response<InviteCodeResponse | ErrorMessage>) => {
	// Validera JWT-token
	const payload = validateJwt(req.headers.authorization);
	if (!payload) {
		res.status(401).send({ error: 'Unauthorized' });
		return;
	}

	try {
		// Hämta familje-metadata
		const familyMetadata = await db.send(new GetCommand({
			TableName: tableName,
			Key: {
				pk: `family#${payload.familyId}`,
				sk: 'META'
			}
		}));

		if (!familyMetadata.Item) {
			res.status(404).send({ error: 'Family not found' }); // Not found
			return;
		}

		const familyMeta = FamilyMetadataSchema.parse(familyMetadata.Item);

		const responseObj = {
			inviteCode: familyMeta.inviteCode,
			familyName: familyMeta.name
		};

		// Validera innan vi skickar
		inviteCodeResponseSchema.parse(responseObj);
		res.send(responseObj);

	} catch (error) {
		console.log('family.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' }); // Internal server error - något gick fel på servern, t.ex. problem med databasen eller annan intern logik
	}
});

/**
 * POST /api/family/child-invite
 *
 * Förälder skapar en invite-kod för sitt barn
 *
 * Header: Authorization: Bearer: <token>
 * Body: { birthDate: string (YYYY-MM-DD) }
 * Response: { childInviteCode: string } | { error: string }
 */
router.post('/child-invite', async (req: Request<{}, ChildInviteResponse | ErrorMessage, ChildInviteRequest>, res: Response<ChildInviteResponse | ErrorMessage>) => {
	// Validera JWT-token
	const payload = validateJwt(req.headers.authorization);
	if (!payload) {
		res.status(401).send({ error: 'Unauthorized' });
		return;
	}

	if (payload.role !== 'parent') {
		res.status(403).send({ error: 'Only parents can create child invites' });
		return;
	}

	// Validera request body
	const validation = childInviteRequestSchema.safeParse(req.body);
	if (!validation.success) {
		return res.status(400).send({ error: 'Invalid request body', issues: validation.error.issues });
	}

	const { birthDate } = validation.data;

	try {
		// Generera en unik child_invite kod
		const childInviteCode = crypto.randomUUID().split('-')[0]!.toUpperCase();

		const childInviteItem = {
			pk: `CHILD_INVITE#${childInviteCode}`,
			sk: 'LOOKUP',
			familyId: `family#${payload.familyId}`,
			parentUsername: payload.username,
			birthDate: birthDate,
			createdAt: new Date().toISOString(),
			used: false
		};

		// Validera med Zod innan vi sparar
		const validatedItem = ChildInviteLookupItemSchema.parse(childInviteItem);

		// Skapa child_invite lookup-item
		await db.send(new PutCommand({
			TableName: tableName,
			Item: validatedItem
		}));

		const responseObj = { childInviteCode };

		// Validera innan vi skickar
		childInviteResponseSchema.parse(responseObj);
		res.send(responseObj);

	} catch (error) {
		console.log('family.ts POST child-invite error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router
