/**
 * Hämtar Authorization-headern med JWT-token från localStorage.
 * Används för att autentisera API-anrop.
 * 
 * @returns Authorization header string eller null om ingen token finns
 */
export const getAuthHeader = (): string | null => {
  const token = localStorage.getItem('jwt');
  return token ? `Bearer: ${token}` : null;
};

/**
 * Dekoderar JWT-payload från token.
 * 
 * @param token - JWT token string
 * @returns Decoded payload eller null om dekodning misslyckas
 */

/*Skapat auth.ts med:
getAuthHeader() - centraliserad auth header funktion
decodeJwt() - JWT-dekodning
JwtPayload interface
Uppdaterat alla filer att använda den centrala funktionen:

useQuiz.ts ✓
chatBot.tsx ✓
Login.tsx ✓
Header.tsx ✓ */

export interface JwtPayload {
  userId: string;
  username: string;
  role: 'parent' | 'child';
  familyId: string;
}

export const decodeJwt = (token: string): JwtPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};
