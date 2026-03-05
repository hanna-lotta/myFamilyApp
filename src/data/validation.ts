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


// registreringsformulär
export const registerSchema = z.object({
  username: z.string().min(4).max(20),
  password: z.string().min(6).max(30),
  inviteCode: z.string().optional(),
});

// inloggningsformulär
export const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100),
});

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
  role: z.enum(["parent", "child"]), 
});
export type Profile = z.infer<typeof profileSchema>;

