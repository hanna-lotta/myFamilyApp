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

export const RegisterFormSchema = z.object({
  username: z.string().min(3, 'Minst 3 tecken').max(20, 'Max 20 tecken'),
  password: z.string().min(6, 'Minst 6 tecken'),
  email: z.string().email('Ogiltig e-post').optional(),
  inviteCode: z.string().optional(),
});

export type RegisterForm = z.infer<typeof RegisterFormSchema>;
