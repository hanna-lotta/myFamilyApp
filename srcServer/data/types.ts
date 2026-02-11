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
	success: boolean;
	token?: string;  // JWT
	username?: string; // Användarnamn för inloggad användare
	color?: string; // Användarens personliga färg
	familyId?: string; // Familjens ID
	role?: string; // Användarens roll i familjen
	inviteCode?: string; // Invite-kod för nya familjer (endast vid registrering)
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

// Lookup-item för snabb invite-kod -> familyId mapping
export interface InviteLookupItem {
	pk: string; // INVITE#code
	sk: string; // LOOKUP
	familyId: string; // family#UUID
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
	role: 'parent' | 'child' | 'member'; // Användarens roll
	color: string; // Användarens personliga färg
	createdAt: string; // ISO timestamp
}

// Deprecated - för bakåtkompatibilitet
export interface UserItem {
	pk: string;
	sk: string;
	username: string;
	password: string;
	accessLevel: string;
	color?: string; // Användarens personliga färg
}