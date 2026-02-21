import { useCallback, useEffect, useRef, useState } from 'react';

export const useGoogleDriveAuth = (googleClientId?: string) => {
  const [driveScriptsLoaded, setDriveScriptsLoaded] = useState(false);
  // Do NOT persist the token to localStorage — Google OAuth tokens expire after 1 hour.
  // Persisting them causes stale 401 errors when the user returns to the app.
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    setDriveScriptsLoaded(true);
  }, []);

  const handleGoogleLogin = useCallback(() => {
    if (!googleClientId) {
      console.warn('[DriveAuth] Google Drive is disabled because VITE_GOOGLE_CLIENT_ID is missing.');
      return;
    }
    if (!driveScriptsLoaded) return;
    setIsLoggingIn(true);
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      setIsLoggingIn(false);
      console.warn('[DriveAuth] Google OAuth client SDK is not loaded yet.');
      return;
    }

    try {
      if (!tokenClientRef.current) {
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
          callback: (response: any) => {
            setIsLoggingIn(false);
            if (response.access_token) setGoogleAccessToken(response.access_token);
          }
        });
      }

      // Use empty prompt so returning users don't have to re-consent every time.
      // The browser will show a minimal account picker if needed.
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    } catch (error) {
      setIsLoggingIn(false);
    }
  }, [googleClientId, driveScriptsLoaded]);

  const handleGoogleLogout = useCallback(() => {
    const google = (window as any).google;
    if (google && google.accounts && googleAccessToken) {
      google.accounts.oauth2.revoke(googleAccessToken, () => setGoogleAccessToken(null));
    } else {
      setGoogleAccessToken(null);
    }
  }, [googleAccessToken]);

  return {
    driveScriptsLoaded,
    googleAccessToken,
    isLoggingIn,
    handleGoogleLogin,
    handleGoogleLogout,
    setGoogleAccessToken
  };
};
