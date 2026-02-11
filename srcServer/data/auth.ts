import jwt from 'jsonwebtoken'
import { PayloadSchema } from '../validation.js'

const jwtSecret: string = process.env.JWT_SECRET || ''

export function createToken(userId: string, username: string, role: string, familyId: string): string {
	// Tiden sedan 1970-01-01 i sekunder
	const now = Math.floor(Date.now() / 1000)

	// En timme
	const defaultExpiration: number = now + 60 * 60
	return jwt.sign({
		userId: userId,
		username: username,
		role: role || 'child',
		familyId: familyId,
		exp: defaultExpiration
	}, jwtSecret)
}

	interface Payload  {
		userId: string;
		role: string;
		username: string;
		familyId: string;
	}
	
	export function validateJwt(authHeader: string | undefined): Payload | null {
	  // 'Bearer: token'
	  if( !authHeader ) {
		return null
	  }
	  const token: string = authHeader.substring(8)  // alternativ: slice, split, // 'Bearer: 
	  try {
		// Anropar jwt.verify (synchronous i jwt-biblioteket) som verifierar signaturen med hemligheten från env och returnerar det dekodade payload-objektet.
		const decodedPayload = jwt.verify(token, process.env.JWT_SECRET || '') 
		console.log('Decoded JWT', decodedPayload)
	  const validatePayload = PayloadSchema.safeParse(decodedPayload);
	  if (!validatePayload.success) {
		console.log('Decoded JWT payload did not match schema');
		return null;
	  } 
	  return validatePayload.data;
	
	  } catch(error) {
		console.log('JWT verify failed: ', (error as any)?.message)
		return null	
	  }
	}

