import express from 'express'
import type { Router, Request, Response } from 'express'
import { validateJwt } from '../data/auth.js';
import type { ErrorMessage, DeleteAccountRes } from '../data/types.js'
import { DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { db, tableName } from '../data/dynamoDb.js'

const router: Router = express.Router();


//Delete endpoint för att radera konto. Response kan vara antingen DeleteAccountRes (success) eller ErrorMessage (error)

router.delete('/delete', async (req: Request<{}, DeleteAccountRes | ErrorMessage>, res: Response<DeleteAccountRes | ErrorMessage>) => {
	
	const payload = validateJwt(req.headers.authorization);
	if (!payload) {
		res.status(401).send({ error: 'Unauthorized' });
		return;
	}

	try {
		// Ta bort användaren från family-tabellen (pk: family#UUID dvs familje identifieraren, sk: user#UUID dvs användarens indifierare)
		await db.send(new DeleteCommand({
			TableName: tableName,
			Key: {
				pk: `family#${payload.familyId}`,
				sk: payload.userId
			}
		}));


        // Lookup, en teknik Dynamobd har som fung. som en snabbväg för att hitta en användare. både user och user i family tabellen  måste raderas för att helt ta bort en användare.
		await db.send(new DeleteCommand({
			TableName: tableName,
			Key: {
				pk: `USERNAME#${payload.username}`,
				sk: 'LOOKUP'
			}
		}));

		res.send({ success: true });
		console.log(`User deleted: ${payload.username} (${payload.userId})`);

	} catch (error) {
		console.log('user.ts error:', (error as any)?.message);
		res.status(500).send({ error: 'Internal server error' });
	}
});

export default router
