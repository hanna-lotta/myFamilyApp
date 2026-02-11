import * as z from 'zod'

export const PayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(['parent', 'child', 'member']),
  familyId: z.string()
});
export type Payload = z.infer<typeof PayloadSchema>; // extrahera datatyp (type signature)

export const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  inviteCode: z.string().optional(), // Optional invite-kod
  role: z.enum(['parent', 'child']).optional() // Optional roll-val
})

export type RegisterSchema = z.infer<typeof registerSchema>

export const ItemSchema = z.object({
  pk: z.string(),
  sk: z.string(),
  username: z.string(),
  password: z.string(),
  accessLevel: z.string(),
})

export const ItemsSchema = z.array(ItemSchema) //z.array(ItemSchema)
//Skapar ett Zod-schema som beskriver "en array där varje element matchar ItemSchema". ItemSchema är ett tidigare definierat Zod‑schema (för ett enskilt user/item).

export const colorUpdateSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color format') // Hex-färgformat, t.ex. #A1B2C3 - ändra error
})

export type ItemSchema = z.infer<typeof ItemSchema>
export type ItemsSchema = z.infer<typeof ItemsSchema>
export type ColorUpdateSchema = z.infer<typeof colorUpdateSchema>