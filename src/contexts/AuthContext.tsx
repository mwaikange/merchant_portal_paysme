import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { merchantUrl } from '@/lib/portalDomains';

type Merchant = Database['public']['Tables']['merchants']['Row'];
export type AccountSessionAccess = 'checking' | 'allowed' | 'blocked' | 'error';
export type MerchantRole = 'owner' | 'admin' | 'staff';

export type MerchantSecurityContext = {
  merchant_id: string;
  actor_role: MerchantRole;
  membership_status: 'pending' | 'active' | 'suspended';
  network_restrictions_enabled: boolean;
  current_ip: string | null;
  network_allowed: boolean;
  mfa_enrolled: boolean;
  current_aal: 'aal1' | 'aal2';
  access_allowed: boolean;
};

type ActiveAccountLock = {
  sessionId: string;
  tabId: string;
  accessToken: string;
};

type BrowserLockManager = {
  request: (
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<void>,
  ) => Promise<void>;
};

const ACCOUNT_TAB_ID_KEY = 'paysme-account-tab-id';
const SELECTED_MERCHANT_KEY = 'paysme-selected-merchant';
const ACCOUNT_HEARTBEAT_MS = 25_000;

const getAuthSessionId = (accessToken?: string | null) => {
  if (!accessToken) return null;

  try {
    const encodedPayload = accessToken.split('.')[1];
    if (!encodedPayload) return null;
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(window.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    const sessionId = String(payload?.session_id || '');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
      ? sessionId
      : null;
  } catch {
    return null;
  }
};

const getOrCreateTabId = () => {
  const existing = window.sessionStorage.getItem(ACCOUNT_TAB_ID_KEY);
  if (existing) return existing;

  const tabId = window.crypto.randomUUID();
  window.sessionStorage.setItem(ACCOUNT_TAB_ID_KEY, tabId);
  return tabId;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  merchant: Merchant | null;
  merchantSecurity: MerchantSecurityContext | null;
  loading: boolean;
  accountSessionAccess: AccountSessionAccess;
  signUp: (email: string, password: string, metadata?: any) => Promise<{ error: any }>;
  signIn: (email: string, password: string, merchantId?: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshMerchant: () => Promise<void>;
  refreshMerchantSecurity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [merchantSecurity, setMerchantSecurity] = useState<MerchantSecurityContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountSessionAccess, setAccountSessionAccess] = useState<AccountSessionAccess>('checking');
  const lastActivityRef = useRef<number>(Date.now());
  const activeAccountLockRef = useRef<ActiveAccountLock | null>(null);

  const authSessionId = getAuthSessionId(session?.access_token);

  const fetchMerchant = async (_userId: string) => {
    try {
      // Resolve the organisation from the authenticated identity. The backend
      // derives merchant and role; the browser never supplies either value.
      await supabase.rpc('activate_my_staff_membership');
      const selectedMerchant = window.sessionStorage.getItem(SELECTED_MERCHANT_KEY);
      let { data: contextRows, error: contextError } = await supabase
        .rpc('get_my_merchant_security_context', { p_merchant_identifier: selectedMerchant || null });
      let context = (Array.isArray(contextRows) ? contextRows[0] : contextRows) as MerchantSecurityContext | null;

      // A cached merchant identifier (e.g. from sessionStorage) can go stale if the
      // merchant was deleted/recreated, or the identifier no longer matches this
      // account. Self-heal by re-resolving from the authenticated identity alone
      // instead of permanently locking the user out.
      if (!contextError && !context && selectedMerchant) {
        window.sessionStorage.removeItem(SELECTED_MERCHANT_KEY);
        const retry = await supabase
          .rpc('get_my_merchant_security_context', { p_merchant_identifier: null });
        contextRows = retry.data;
        contextError = retry.error;
        context = (Array.isArray(contextRows) ? contextRows[0] : contextRows) as MerchantSecurityContext | null;
        if (context) {
          window.sessionStorage.setItem(SELECTED_MERCHANT_KEY, context.merchant_id);
        }
      }

      if (contextError || !context) {
        if (contextError) console.error('Error fetching merchant security context:', contextError);
        setMerchantSecurity(null);
        setMerchant(null);
        return;
      }

      setMerchantSecurity(context);
      const { data, error } = await supabase
        .from('merchants')
        .select('*')
        .eq('merchant_id', context.merchant_id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching merchant:', error);
        setMerchant(null);
        return;
      }

      setMerchant(data || null);
    } catch (error) {
      console.error('Error fetching merchant:', error);
      setMerchantSecurity(null);
      setMerchant(null);
    }
  };

  const refreshMerchant = async () => {
    if (user) {
      await fetchMerchant(user.id);
    }
  };

  const refreshMerchantSecurity = async () => {
    if (user) await fetchMerchant(user.id);
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Keep the already-loaded merchant during token refreshes. Clearing it
          // here made merchant-dependent portal cards briefly disappear.
          setMerchant(current => current);
          // Defer merchant fetch to avoid auth state callback issues
          setTimeout(async () => {
            await fetchMerchant(session.user.id);
            setLoading(false);
          }, 0);
        } else {
          setMerchant(null);
          setMerchantSecurity(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setMerchant(current => current);
        setTimeout(async () => {
          await fetchMerchant(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setMerchant(null);
        setMerchantSecurity(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !session?.access_token || !authSessionId) {
      activeAccountLockRef.current = null;
      setAccountSessionAccess('checking');
      return;
    }

    let disposed = false;
    let heartbeatTimer: number | null = null;
    let releaseBrowserLock: (() => void) | null = null;
    let heartbeatFailures = 0;
    const tabId = getOrCreateTabId();
    const accessToken = session.access_token;

    const claimLease = async () => {
      const { data, error } = await supabase.rpc('claim_account_session', {
        p_session_id: authSessionId,
        p_tab_id: tabId,
      });

      if (disposed) return false;
      if (error) {
        console.error('Unable to verify the account session lock:', error);
        setAccountSessionAccess('error');
        return false;
      }
      if (!data) {
        setAccountSessionAccess('blocked');
        return false;
      }

      activeAccountLockRef.current = { sessionId: authSessionId, tabId, accessToken };
      setAccountSessionAccess('allowed');

      heartbeatTimer = window.setInterval(async () => {
        const { data: heartbeatAccepted, error: heartbeatError } = await supabase.rpc('claim_account_session', {
          p_session_id: authSessionId,
          p_tab_id: tabId,
        });

        if (disposed) return;
        if (heartbeatError || !heartbeatAccepted) {
          heartbeatFailures += 1;
          if (heartbeatFailures >= 2) {
            activeAccountLockRef.current = null;
            setAccountSessionAccess(heartbeatError ? 'error' : 'blocked');
            if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
          }
          return;
        }

        heartbeatFailures = 0;
      }, ACCOUNT_HEARTBEAT_MS);

      return true;
    };

    const holdAccountLock = async () => {
      setAccountSessionAccess('checking');
      const lockManager = (window.navigator as Navigator & { locks?: BrowserLockManager }).locks;

      if (!lockManager?.request) {
        await claimLease();
        return;
      }

      await lockManager.request(
        `paysme-account-${user.id}`,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (disposed) return;
          if (!lock) {
            setAccountSessionAccess('blocked');
            return;
          }

          const claimed = await claimLease();
          if (!claimed || disposed) return;

          await new Promise<void>((resolve) => {
            releaseBrowserLock = resolve;
            if (disposed) resolve();
          });
        },
      );
    };

    const releaseOnPageExit = () => {
      const activeLock = activeAccountLockRef.current;
      if (!activeLock || activeLock.sessionId !== authSessionId || activeLock.tabId !== tabId) return;

      void fetch(`${SUPABASE_URL}/rest/v1/rpc/release_account_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${activeLock.accessToken}`,
        },
        body: JSON.stringify({
          p_session_id: activeLock.sessionId,
          p_tab_id: activeLock.tabId,
        }),
        keepalive: true,
      });
    };

    window.addEventListener('beforeunload', releaseOnPageExit);
    void holdAccountLock().catch((error) => {
      if (!disposed) {
        console.error('Unable to establish the account session lock:', error);
        setAccountSessionAccess('error');
      }
    });

    return () => {
      disposed = true;
      window.removeEventListener('beforeunload', releaseOnPageExit);
      if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
      releaseBrowserLock?.();
    };
  }, [authSessionId, user?.id]);

  useEffect(() => {
    if (activeAccountLockRef.current && session?.access_token) {
      activeAccountLockRef.current.accessToken = session.access_token;
    }
  }, [session?.access_token]);

  // Auto-logout after 15 minutes of inactivity
  useEffect(() => {
    if (!user || accountSessionAccess !== 'allowed') return;

    // Reset activity timestamp when this effect runs (e.g. on login)
    lastActivityRef.current = Date.now();

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click', 'focus'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Also count tab visibility changes as activity
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityRef.current;
      if (inactiveTime > 15 * 60 * 1000) {
        signOut();
      }
    }, 60000); // Check every 60 seconds

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [accountSessionAccess, user]);

  const signUp = async (email: string, password: string, metadata?: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Email confirmation must return to sign-in. Recovery links have their
        // own /reset-password destination and must never share this callback.
        emailRedirectTo: merchantUrl('/auth?confirmed=true'),
        data: metadata || {}
      }
    });

    if (!error && data.user?.id) {
      const { error: notificationError } = await supabase.functions.invoke("merchant-waitlist", {
        body: {
          action: "merchant_account_signup",
          merchant_id: data.user.id,
        },
      });
      if (notificationError) {
        console.error("Merchant signup notification failed", notificationError);
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string, merchantId?: string) => {
    window.sessionStorage.removeItem(SELECTED_MERCHANT_KEY);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error };
    }

    // TEMPORARY: Do not require or enforce the Merchant/USV ID to log in.
    // We still attempt to resolve the merchant (so the dashboard loads when
    // possible), but we NEVER sign the user out and NEVER block login when
    // the identifier does not resolve. This restores the old email+password
    // login behavior so we can confirm authentication itself works, and lets
    // fetchMerchant/PortalDesktopGuard drive access afterwards.
    await supabase.rpc('activate_my_staff_membership');

    const trimmedMerchantId = merchantId?.trim();
    let resolved: any = null;

    if (trimmedMerchantId) {
      const { data: contextRows } = await supabase.rpc('get_my_merchant_security_context', { p_merchant_identifier: trimmedMerchantId });
      resolved = Array.isArray(contextRows) ? contextRows[0] : contextRows;
    }

    // Always fall back to resolving purely from the authenticated identity
    // (owner/staff lookup) when the typed identifier is missing or does not
    // match. Never fall back to a placeholder id.
    if (!resolved?.merchant_id) {
      const { data: fallbackRows } = await supabase.rpc('get_my_merchant_security_context', { p_merchant_identifier: null });
      resolved = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
    }

    if (resolved?.merchant_id) {
      window.sessionStorage.setItem(SELECTED_MERCHANT_KEY, resolved.merchant_id);
    }

    if (signInData.user) await fetchMerchant(signInData.user.id);

    return { error: null };
  };

  const signOut = async () => {
    const activeLock = activeAccountLockRef.current;
    if (activeLock) {
      await supabase.rpc('release_account_session', {
        p_session_id: activeLock.sessionId,
        p_tab_id: activeLock.tabId,
      });
      activeAccountLockRef.current = null;
    }
    await supabase.auth.signOut({ scope: 'local' });
    setMerchant(null);
    setMerchantSecurity(null);
    window.sessionStorage.removeItem(SELECTED_MERCHANT_KEY);
    setAccountSessionAccess('checking');
  };

  const value = {
    user,
    session,
    merchant,
    merchantSecurity,
    loading,
    accountSessionAccess,
    signUp,
    signIn,
    signOut,
    refreshMerchant,
    refreshMerchantSecurity,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
