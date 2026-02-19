export interface ErrorMessage {
  error: string;
  issues?: unknown; 
}

export interface UserBody {
  username: string;
  password: string;
  inviteCode?: string; // Optional invite-kod för att gå med i befintlig familj
  role?: 'parent' | 'child'; // Optional roll-val när invite-kod används
}

export interface JwtResponse {
	success?: boolean;
	token?: string;  // JWT
	username?: string; 
	color?: string; // Användarens personliga färg
	familyId?: string; 
	role?: string; 
	inviteCode?: string; // Invite-kod för nya familjer (endast vid registrering)
	response?: string; // Chat-svar från AI
	quiz?: unknown[]; // Quiz-data
	timestamp?: string; // ISO timestamp
	items?: unknown[]; // Array av meddelanden
	deletedCount?: number; // Antal raderade items
}

// Lookup-item för snabb username -> familyId/userId mapping
export interface UserLookupItem {
	pk: string; // USERNAME#username
	sk: string; // LOOKUP
	username: string;
	password: string; // Hashat lösenord
	familyId: string; // family#UUID
	userId: string; // user#UUID
}

// Lookup-item för barnets invite-kod -> familj + metadata mapping
export interface ChildInviteLookupItem {
	pk: string; // CHILD_INVITE#code
	sk: string; // LOOKUP
	familyId: string; // family#UUID
	parentUsername: string; // Föräldern som skapade invite-koden
	birthDate: string; // YYYY-MM-DD
	createdAt: string; // ISO timestamp
	used: boolean; // true när barnet registrerar sig
}

// Familje-metadata
export interface FamilyMetadata {
	pk: string; // family#UUID
	sk: string; // META
	name: string; // Familjens namn
	createdAt: string; // ISO timestamp
	inviteCode: string; // Unik invite-kod för familjen
}

// Användare i en familj
export interface FamilyUserItem {
	pk: string; // family#UUID
	sk: string; // user#UUID
	username: string;
	role: 'parent' | 'child'; 
	color: string; 
	createdAt: string; // ISO timestamp
}
