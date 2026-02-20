export interface ErrorMessage {
  error: string;
  issues?: unknown; 
}

// Template literal types for type-safe prefixes (used in register.ts when building objects)
export type FamilyId = `family#${string}`;
export type UserId = `user#${string}`;

export interface UserBody {
  username: string;
  password: string;
  inviteCode?: string; // Optional invite-kod för att gå med i befintlig familj
  role?: 'parent' | 'child'; // Optional roll-val när invite-kod används
}

export interface JwtResponse {
	success: boolean;
	token: string;  // JWT
	username: string; 
	color: string; // Användarens personliga färg
	familyId: string; // family#UUID (validated by Zod regex at runtime)
	role: 'parent' | 'child'; 
	inviteCode?: string; // Invite-kod för nya familjer (endast vid registrering)
	response?: string; // Chat-svar från AI
	quiz?: unknown[]; // Quiz-data
	timestamp?: string; // ISO timestamp
	items?: unknown[]; // Array av meddelanden
	deletedCount?: number; // Antal raderade items
}

// RegisterResponse är JwtResponse men garanterar inviteCode kan vara undefined
//Ta alla fält från JwtResponse
//Ta bort inviteCode
//Lägg tillbaka det som inviteCode?: string (optional)
export type RegisterResponse = Omit<JwtResponse, 'inviteCode'> & { inviteCode?: string };

// Lookup-item för snabb username -> familyId/userId mapping
// Runtime validation via Zod regex ensures format, compile-time type is string for flexibility
export interface UserLookupItem {
	pk: string; // USERNAME#username (validated by Zod regex)
	sk: 'LOOKUP'; // literal type
	username: string;
	password: string; // Hashat lösenord
	familyId: string; // family#UUID (validated by Zod regex)
	userId: string; // user#UUID (validated by Zod regex)
}

// Lookup-item för barnets invite-kod -> familj + metadata mapping
export interface ChildInviteLookupItem {
	pk: string; // CHILD_INVITE#code (validated by Zod regex)
	sk: 'LOOKUP'; // literal type
	familyId: string; // family#UUID (validated by Zod regex)
	parentUsername: string; // Föräldern som skapade invite-koden
	birthDate: string; // YYYY-MM-DD
	createdAt: string; // ISO timestamp
	used: boolean; // true när barnet registrerar sig
}

// Familje-metadata
export interface FamilyMetadata {
	pk: string; // family#UUID (validated by Zod regex)
	sk: 'META'; // literal type
	name: string; // Familjens namn
	createdAt: string; // ISO timestamp
	inviteCode: string; // Unik invite-kod för familjen
}

// Användare i en familj
export interface FamilyUserItem {
	pk: string; // family#UUID (validated by Zod regex)
	sk: string; // user#UUID (validated by Zod regex)
	username: string;
	role: 'parent' | 'child'; 
	color: string; 
	createdAt: string; // ISO timestamp
}
