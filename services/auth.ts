
import { supabase } from './supabaseClient';
import { User } from '../types';

export const authService = {
  /**
   * Converte o usuário do Supabase para o tipo User da aplicação
   */
  _mapUser(sbUser: any): User | null {
    if (!sbUser) return null;
    return {
      uid: sbUser.id,
      email: sbUser.email,
      displayName: sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0],
      photoURL: null
    };
  },

  async login(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("Erro Login:", error.message);
      if (error.message.includes("Invalid login")) {
        throw new Error("E-mail ou senha incorretos.");
      }
      throw new Error(error.message);
    }

    return this._mapUser(data.user) as User;
  },

  async register(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          // Usa a parte antes do @ como nome inicial
          full_name: email.split('@')[0], 
        }
      }
    });

    if (error) {
      console.error("Erro Cadastro:", error.message);
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error("Erro ao criar usuário. Tente novamente.");
    }

    return this._mapUser(data.user) as User;
  },

  async getCurrentUser(): Promise<User | null> {
    const { data } = await supabase.auth.getUser();
    return this._mapUser(data.user);
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    window.location.reload();
  },

  subscribe(callback: (user: User | null) => void): () => void {
    // Estado inicial
    this.getCurrentUser().then(callback);

    // Listener de mudanças
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        callback(this._mapUser(session.user));
      } else {
        callback(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }
};
