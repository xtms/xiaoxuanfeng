import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthContextType {
  isLoggedIn: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoggedIn: false,
  username: null,
  login: () => false,
  logout: () => {},
});

// 模拟用户数据
const MOCK_USERS: Record<string, string> = {
  admin: 'admin123',
  user: '123456',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('auth_loggedIn') === 'true';
  });
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem('auth_username');
  });

  const login = useCallback((user: string, pwd: string): boolean => {
    if (MOCK_USERS[user] && MOCK_USERS[user] === pwd) {
      setIsLoggedIn(true);
      setUsername(user);
      localStorage.setItem('auth_loggedIn', 'true');
      localStorage.setItem('auth_username', user);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setUsername(null);
    localStorage.removeItem('auth_loggedIn');
    localStorage.removeItem('auth_username');
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}