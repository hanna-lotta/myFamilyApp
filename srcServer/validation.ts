import * as z from 'zod'
import { en } from 'zod/locales';

const familyIdSchema = z.string().regex(/^family#.+$/, 'Invalid familyId format');
const userIdSchema = z.string().regex(/^user#.+$/, 'Invalid userId format');
const usernameLookupPkSchema = z.string().regex(/^USERNAME#.+$/, 'Invalid username lookup key format');
const childInviteLookupPkSchema = z.string().regex(/^CHILD_INVITE#.+$/, 'Invalid child invite key format');

export const PayloadSchema = z.object({
  userId: z.string(),
  username: z.string(),
  role: z.enum(['parent', 'child']),
  familyId: familyIdSchema
});
export type Payload = z.infer<typeof PayloadSchema>; // extrahera datatyp (type signature)

export const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  inviteCode: z.string().optional(), // Optional invite-kod
  role: z.enum(['parent', 'child']).optional(), // Optional roll-val
  childBirthdate: z.string().optional() // Barnets födelsedatum (YYYY-MM-DD) när man registrerar sig med child_invite
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

export const ChildInviteLookupItemSchema = z.object({
  pk: childInviteLookupPkSchema,
  sk: z.literal('LOOKUP'),
  familyId: familyIdSchema,
  parentUsername: z.string(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string(),
  used: z.boolean()
});

export const FamilyUserItemSchema = z.object({
  pk: familyIdSchema,
  sk: userIdSchema,
  username: z.string(),
  role: z.enum(['parent', 'child']),
  color: z.string(),
  createdAt: z.string()
});

export const FamilyMetadataSchema = z.object({
  pk: familyIdSchema,
  sk: z.literal('META'),
  name: z.string(),
  createdAt: z.string(),
  inviteCode: z.string()
});

export const UserLookupItemSchema = z.object({
  pk: usernameLookupPkSchema,
  sk: z.literal('LOOKUP'),
  username: z.string(),
  password: z.string(),
  familyId: familyIdSchema,
  userId: userIdSchema
});

export const JwtResponseSchema = z.object({
  success: z.boolean(),
  token: z.string(),
  username: z.string(),
  color: z.string(),
  familyId: z.string(),
  role: z.enum(['parent', 'child']),
  inviteCode: z.string().optional(),
  response: z.string().optional(),
  quiz: z.array(z.unknown()).optional(),
  timestamp: z.string().optional(),
  items: z.array(z.unknown()).optional(),
  deletedCount: z.number().optional()
});

export type JwtResponseType = z.infer<typeof JwtResponseSchema>; // extraherar datatypen (type signature) från JwtResponseSchema, vilket ger oss en TypeScript-typ som matchar strukturen i JwtResponseSchema. Detta är användbart för att säkerställa typ-säkerhet i resten av koden när vi arbetar med JWT-responsobjekt. Genom att använda JwtResponseType kan vi få autokomplettering och typkontroll i TypeScript när vi skapar eller hanterar JWT-responsobjekt, vilket minskar risken för fel och förbättrar utvecklarupplevelsen.
//Källa av sanning: Schemat är den enda källan — typen härledas från det.
//Ingen drift: Interface och schema kan inte bli osynkade.
//Mindre kod: En sak istället för två.

export type ItemSchema = z.infer<typeof ItemSchema>
export type ItemsSchema = z.infer<typeof ItemsSchema>
export type ColorUpdateSchema = z.infer<typeof colorUpdateSchema>

// Family routes schemas
export const inviteCodeResponseSchema = z.object({
  inviteCode: z.string(),
  familyName: z.string()
});
export type InviteCodeResponse = z.infer<typeof inviteCodeResponseSchema>;

export const childInviteRequestSchema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid birthDate format. Use YYYY-MM-DD')
});
export type ChildInviteRequest = z.infer<typeof childInviteRequestSchema>;

export const childInviteResponseSchema = z.object({
  childInviteCode: z.string()
});
export type ChildInviteResponse = z.infer<typeof childInviteResponseSchema>;