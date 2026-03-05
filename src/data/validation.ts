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




// toDo formulär
export const todoSchema = z.object({
  text: z.string().min(1).max(200),
});
export type TodoInput = z.infer<typeof todoSchema>;

// quiz svar
export const quizAnswerSchema = z.object({
  answer: z.string().min(1).max(100), 
});

// Profilinställningar
export const profileSchema = z.object({
	username: z.string().min(1),
});
export type Profile = z.infer<typeof profileSchema>;

