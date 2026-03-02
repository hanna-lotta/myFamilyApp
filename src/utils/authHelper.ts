import { decodeJwt } from './auth';

// funktion för att få userId och familyId från JWT
  export const getAuthParams = (): { userId: string; familyId: string } | null => { // Denna funktion hämtar JWT-token från localStorage, dekodar den och returnerar userId och familyId som behövs för att autentisera API-anropen. Om token inte finns eller inte kan dekodas, returnerar den null, vilket indikerar att användaren inte är inloggad. 
    const token = localStorage.getItem('jwt');
    if (!token) return null;
    
    const payload = decodeJwt(token); // Använder vår decodeJwt-funktion för att få ut payloaden från JWT-token, som innehåller userId och familyId. 
    if (!payload) 
        return null;
    
    return {
      userId: payload.userId,
      familyId: payload.familyId
    };
  };