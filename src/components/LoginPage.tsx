import React, { useState, useMemo } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Building2,
  AlertCircle,
  Boxes,
  FileSpreadsheet,
  Compass,
  Layers,
} from 'lucide-react';
import { IngeodronLogo } from './IngeodronLogo.tsx';
import { AppUser } from '../types.ts';
import { localDataStore } from '../utils/localDataStore.ts';

interface LoginPageProps {
  onLoginSuccess: (user: AppUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberSession, setRememberSession] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Load live accounts from localDataStore so any admin-edited or created user appears immediately
  const quickAccounts = useMemo(() => {
    const users = localDataStore.getUsers().filter((u) => u.active !== false);
    const clients = localDataStore.getClients();
    const quarries = localDataStore.getQuarries();

    return users.slice(0, 5).map((u) => {
      const client = u.clientId ? clients.find((c) => c.id === u.clientId) : undefined;
      const clientQuarries = client
        ? quarries.filter((q) => q.clientId === client.id).map((q) => q.name)
        : [];
      const isAdmin = u.role === 'admin';
      return {
        id: `user-${u.id}`,
        isAdmin,
        title: isAdmin
          ? u.displayName || 'Administración Técnica INGEODRON'
          : client?.name || u.displayName || u.email,
        subtitle: isAdmin
          ? 'Acceso global a clientes, usuarios y explotaciones'
          : clientQuarries.length > 0
          ? clientQuarries.join(' · ')
          : client?.contactName || 'Portal de Cliente',
        email: u.email,
        pass: u.password || '',
        logoUrl: !isAdmin ? client?.logoUrl : undefined,
        accentClass: isAdmin
          ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
          : u.clientId === 2
          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
          : 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      };
    });
  }, []);

  const submitCredentials = async (userInput: string, passInput: string) => {
    if (!userInput.trim()) {
      setErrorMessage('Introduce tu correo electrónico o usuario de cliente.');
      return;
    }
    if (!passInput.trim()) {
      setErrorMessage('Introduce tu contraseña de acceso.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      let authenticatedUser: AppUser | null = null;
      let sessionToken: string | null = null;

      // 1. Authenticate with backend API for cryptographic session token & client isolation cookie
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: userInput, password: passInput }),
        });
        if (resp.ok) {
          const payload = await resp.json();
          if (payload?.ok && payload?.user) {
            authenticatedUser = payload.user;
            sessionToken = payload.token || null;
          }
        } else if (resp.status === 401) {
          setErrorMessage('Credenciales incorrectas o cuenta desactivada. Verifica tu correo y contraseña.');
          setIsLoading(false);
          return;
        }
      } catch {
        // Fallback to local data store when server endpoint is unavailable (e.g. offline dev)
      }

      // 2. Fallback to localDataStore if server was offline
      if (!authenticatedUser) {
        authenticatedUser = localDataStore.authenticate(userInput, passInput);
      }

      if (!authenticatedUser) {
        setErrorMessage('Credenciales incorrectas o cuenta desactivada. Verifica tu correo y contraseña.');
        setIsLoading(false);
        return;
      }

      if (sessionToken) {
        localStorage.setItem('ingeodron_token', sessionToken);
      }

      if (rememberSession) {
        localStorage.setItem('ingeodron_session', JSON.stringify(authenticatedUser));
      } else {
        localStorage.removeItem('ingeodron_session');
      }
      onLoginSuccess(authenticatedUser);
    } catch {
      setErrorMessage('No se pudo iniciar sesión en este momento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCredentials(username, password);
  };

  const handleSelectAccount = (email: string, pass: string, autoLogin = false) => {
    setUsername(email);
    setPassword(pass);
    setErrorMessage('');
    if (autoLogin) {
      submitCredentials(email, pass);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a10] text-gray-200 flex flex-col justify-center selection:bg-blue-600 selection:text-white relative overflow-hidden">

      <div className="relative z-10 w-full max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
          {/* Left Column: Portal Context & Capabilities */}
          <div className="lg:col-span-6 space-y-6 sm:space-y-8">
            <div className="space-y-4 sm:space-y-5">
              <IngeodronLogo
                size="lg"
                subtitleText="Fotogravimetria con dron"
                containerClassName="gap-4 sm:gap-5"
                iconClassName="w-20 h-14 sm:w-28 sm:h-[72px]"
                brandSpanClassName="text-3xl sm:text-4xl lg:text-[42px]"
                subtitleClassName="text-xs sm:text-sm text-gray-300 font-semibold tracking-wider uppercase mt-1"
              />

              <div className="space-y-2.5 sm:space-y-3 pt-1 sm:pt-2">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Portal de Clientes y Control Volumétrico de Explotaciones
                </h2>
                <p className="text-sm sm:text-base text-gray-400 leading-relaxed max-w-xl">
                  Consulta los levantamientos fotogramétricos con dron RTK, revisa la evolución por zona y fecha de vuelo, verifica las densidades y tonelajes de cada acopio y descarga tus informes técnicos oficiales.
                </p>
              </div>
            </div>

            {/* Key engineering modules */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="glass-panel border border-gray-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs uppercase tracking-wider">
                  <Boxes className="w-4 h-4 shrink-0" /> Cubicación por Densidad
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Control de relleno, desmonte y cálculo directo de toneladas según la densidad específica (t/m³) de cada acopio.
                </p>
              </div>

              <div className="glass-panel border border-gray-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                  <Layers className="w-4 h-4 shrink-0" /> Histórico Multi-Vuelo
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Seguimiento jerárquico por explotación, zona, vuelo y acopios individuales con comparativa de campañas.
                </p>
              </div>

              <div className="glass-panel border border-gray-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 shrink-0" /> Entregables Oficiales
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Descarga directa de informes técnicos PDF multi-fecha, libros Excel detallados, curvas DXF, ortomosaicos y LAZ.
                </p>
              </div>

              <div className="glass-panel border border-gray-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
                  <Compass className="w-4 h-4 shrink-0" /> Georreferenciación RTK
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Cartografía en sistema oficial ETRS89 UTM Huso 30N (EPSG:25830) con apoyo GNSS/RTK centimétrico.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                Acceso privado segmentado por explotación y cliente
              </span>
              <span className="code-font text-[11px] text-gray-400">Ver: 5.50</span>
            </div>
          </div>

          {/* Right Column: Client Authentication Form */}
          <div className="lg:col-span-6 min-w-0">
            <div className="glass-panel border border-gray-800 rounded-2xl p-4 sm:p-8 shadow-2xl space-y-5 sm:space-y-6">
              <div className="space-y-1 border-b border-gray-800 pb-4">
                <h3 className="text-xl font-bold text-white">Acceso de Clientes</h3>
                <p className="text-xs text-gray-400">
                  Introduce tus credenciales de empresa para acceder a tus canteras y acopios asignados.
                </p>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 bg-red-950/70 border border-red-800 text-red-200 rounded-xl text-xs flex items-center gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-xs font-semibold text-gray-300 block">
                    Correo electrónico o usuario
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="login-email"
                      type="text"
                      autoComplete="username"
                      required
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="ej: cmorales@aridosdelsur.es"
                      className="w-full bg-[#0b0f17] border border-gray-700 focus:border-blue-500 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="text-xs font-semibold text-gray-300 block">
                    Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="••••••••"
                      className="w-full bg-[#0b0f17] border border-gray-700 focus:border-blue-500 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-300 transition cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(e) => setRememberSession(e.target.checked)}
                      className="rounded border-gray-700 bg-[#0b0f17] text-blue-600 focus:ring-blue-500"
                    />
                    <span>Mantener sesión iniciada en este navegador</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? 'Verificando acceso...' : (
                    <>
                      <span>Acceder al Portal</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Dynamic Quick Access Client & Admin Profiles */}
              <div className="pt-4 border-t border-gray-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-300">Cuentas registradas ({quickAccounts.length})</span>
                  <span className="text-[11px] text-gray-500">Haz clic para rellenar o entrar</span>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {quickAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      onClick={() => handleSelectAccount(acc.email, acc.pass, false)}
                      className="p-3 bg-[#0b0f17] hover:bg-gray-800/60 border border-gray-800 hover:border-gray-700 rounded-xl cursor-pointer transition flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg border shrink-0 flex items-center justify-center overflow-hidden ${acc.accentClass}`}>
                          {acc.isAdmin ? (
                            <ShieldCheck className="w-4 h-4" />
                          ) : acc.logoUrl ? (
                            <img
                              src={acc.logoUrl}
                              alt={acc.title}
                              className="w-full h-full object-contain bg-white/95 p-0.5"
                            />
                          ) : (
                            <Building2 className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{acc.title}</div>
                          <div className="text-[11px] text-gray-400 truncate">{acc.subtitle}</div>
                          <div className="code-font text-[10px] text-gray-400 truncate mt-0.5 flex items-center gap-1.5">
                            <span>{acc.email}</span>
                            <span className="text-gray-600">•</span>
                            <span className="text-gray-400 font-sans text-[9px] bg-gray-800/80 px-1.5 py-0.5 rounded border border-gray-700">Acceso demo</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAccount(acc.email, acc.pass, true);
                        }}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-blue-600 text-gray-200 hover:text-white border border-gray-700 hover:border-blue-500 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer"
                      >
                        Entrar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
