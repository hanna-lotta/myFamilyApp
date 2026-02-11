import * as z from "zod";

export const RegisterResponseSchema = z.object({
	success: z.boolean(),
	token: z.string().optional(),
	username: z.string().optional(),
	color: z.string().optional(),
	familyId: z.string().optional(),
	role: z.string().optional(),
	inviteCode: z.string().optional(), // Invite-kod när ny familj skapas
})

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>
