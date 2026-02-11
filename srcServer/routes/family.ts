import express from 'express'
import type { Router, Request, Response } from 'express'
import { validateJwt } from '../data/auth.js';
import type { ErrorMessage, FamilyMetadata } from '../data/types.js'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'

const router: Router = express.Router();

/**
 * GET /api/family/invite-code
 * 
 * Hämtar invite-koden för användarens familj.
 * Alla familjemedlemmar kan hämta koden för att bjuda in nya medlemmar.
 * 
 * Header: Authorization: Bearer <token>
 * Response: { inviteCode: string } | { error: string }
 */
router.get('/invite-code', async (req: Request, res: Response) => {
	// Validera JWT-token
	const payload = validateJwt(req.headers.authorization);
	if (!payload) {
		res.status(401).send({ error: 'Unauthorized' } as ErrorMessage);
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
			res.status(404).send({ error: 'Family not found' } as ErrorMessage);
			return;
		}

		const familyMeta = familyMetadata.Item as FamilyMetadata;

		res.send({ 
			inviteCode: familyMeta.inviteCode,
			familyName: familyMeta.name
		});

	} catch (error) {
		console.log('family.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' } as ErrorMessage);
	}
});

export default router
