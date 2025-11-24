
import { supabase } from './supabaseClient';
import { SavedSimulation } from '../types';
import { authService } from './auth';

export const storageService = {
  async getAll(): Promise<SavedSimulation[]> {
    try {
      const user = await authService.getCurrentUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('simulations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error("Erro Supabase:", error);
        return [];
      }

      // Maps the database format (JSONB payload) to the application format
      return data.map((row: any) => ({
        id: row.id,
        ownerId: row.user_id,
        name: row.name,
        lastModified: new Date(row.updated_at).getTime(),
        ...row.payload // Spreads financialData, displayLines, configs, etc.
      }));
    } catch (e) {
      console.error("Erro ao buscar simulações:", e);
      return [];
    }
  },

  async save(simulation: SavedSimulation): Promise<string> {
    const user = await authService.getCurrentUser();
    if (!user) throw new Error("Usuário não autenticado");

    // Separate metadata from heavy content
    // We do NOT send 'id' inside the payload or the top level update for existing rows unless it's the matcher
    const { id, name, lastModified, ownerId, ...restPayload } = simulation;

    // Check if it is new based on ID format (UUID is 36 chars, timestamps are shorter)
    const isNew = !id || id.length < 30; 

    const upsertData = {
      user_id: user.uid,
      name: name,
      updated_at: new Date().toISOString(),
      payload: restPayload
    };

    if (!isNew) {
        // Update existing record
        const { error } = await supabase
            .from('simulations')
            .update(upsertData)
            .eq('id', id);
        
        if(error) throw error;
        return id;
    } else {
        // Insert new record - Return the generated UUID
        const { data, error } = await supabase
            .from('simulations')
            .insert(upsertData)
            .select('id')
            .single();
        
        if(error) throw error;
        return data.id;
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('simulations')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
