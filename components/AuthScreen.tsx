import React, { useState } from 'react';
import { authService } from '../services/auth';

interface AuthScreenProps {
  onLoginSuccess: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // URLs das imagens
  const REGISTER_LOGO = "https://ijmnswgftotcekzkioyp.supabase.co/storage/v1/object/public/Logomarca/Captura%20de%20Tela%20(2).png";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (isRegistering && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setLoading(true);

    try {
      if (isRegistering) {
        await authService.register(email, password);
        setSuccessMsg("Cadastro realizado! Verifique seu e-mail para confirmar a conta antes de entrar.");
        setIsRegistering(false);
        setPassword('');
        setConfirmPassword('');
      } else {
        await authService.login(email, password);
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error(err);
      let msg = err.message || "Erro desconhecido";
      
      if (msg.includes("User already registered")) msg = "Este e-mail já está cadastrado.";
      else if (msg.includes("Invalid login")) msg = "E-mail ou senha incorretos.";
      else if (msg.includes("Email not confirmed")) msg = "E-mail não confirmado. Verifique sua caixa de entrada.";
      else if (msg.includes("Password should be")) msg = "A senha é muito fraca.";

      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f3f4f6] p-4">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row max-w-4xl w-full">
        
        {/* Left Side - Image */}
        <div className="md:w-1/2 bg-blue-600 relative overflow-hidden flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-indigo-900 z-10"></div>
          {isRegistering && (
             <img src={REGISTER_LOGO} alt="Logo" className="relative z-20 w-3/4 object-contain animate-fade-in" />
          )}
          
          <div className="relative z-20 p-8 text-white text-center">
            <h2 className="text-3xl font-bold mb-2">Planejamento Tributário</h2>
            <p className="text-blue-100">Ferramenta inteligente para análise de regimes tributários.</p>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="md:w-1/2 p-8 md:p-12 flex flex-col justify-center">
          <div className="mb-6 text-center md:text-left">
            <h3 className="text-2xl font-bold text-gray-800">
              {isRegistering ? 'Crie sua conta' : 'Bem-vindo de volta'}
            </h3>
            <p className="text-gray-500 text-sm mt-1">
              {isRegistering ? 'Preencha os dados para começar' : 'Insira suas credenciais para acessar'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm flex items-center">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm flex items-center">
              <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input 
                type="password" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {isRegistering && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label>
                <input 
                  type="password" 
                  required 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className={`w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors shadow-lg transform active:scale-95 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processando...
                </span>
              ) : (
                isRegistering ? 'Criar Conta' : 'Entrar'
              )}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-600">
              {isRegistering ? 'Já tem uma conta?' : 'Ainda não tem conta?'}
              <button 
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="ml-2 font-bold text-blue-600 hover:text-blue-800 transition-colors"
              >
                {isRegistering ? 'Fazer Login' : 'Cadastre-se grátis'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;