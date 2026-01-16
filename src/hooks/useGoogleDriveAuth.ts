import { useCallback, useEffect, useRef, useState } from 'react';

const GOOGLE_TOKEN_STORAGE_KEY = 'google_access_token';

export const useGoogleDriveAuth = (googleClientId?: string) => {
  const [driveScriptsLoaded, setDriveScriptsLoaded] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() =>
    localStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY)
  );
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    setDriveScriptsLoaded(true);
  }, []);

  useEffect(() => {
    if (googleAccessToken) {
      localStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, googleAccessToken);
    } else {
      localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    }
  }, [googleAccessToken]);

  const handleGoogleLogin = useCallback(() => {
    if (!googleClientId || !driveScriptsLoaded) return;
    setIsLoggingIn(true);
    const google = (window as any).google;

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

      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
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

export { GOOGLE_TOKEN_STORAGE_KEY };
