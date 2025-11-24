
import React, { useState, useEffect } from 'react';
import { MemoryRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import AuthScreen from './components/AuthScreen';
import HomePage from './components/HomePage';
import { FinancialData, StoredFile, SavedSimulation, User } from './types';
import { storageService } from './services/storage';
import { authService } from './services/auth';

const ProtectedRoute = ({ children, user, authLoading }: { children?: React.ReactNode, user: User | null, authLoading: boolean }) => {
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f4f6]">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-2"></div>
          <span className="text-gray-500 text-sm">Carregando...</span>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [sourceFiles, setSourceFiles] = useState<StoredFile[]>([]);
  const [currentSimulationId, setCurrentSimulationId] = useState<string | null>(null);
  
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>([]);
  const [isLoadingSimulations, setIsLoadingSimulations] = useState(false);
  
  useEffect(() => {
    const unsubscribe = authService.subscribe((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadSimulations = async () => {
      if (!user) {
        setSavedSimulations([]);
        return;
      }
      setIsLoadingSimulations(true);
      try {
        const sims = await storageService.getAll();
        setSavedSimulations(sims);
      } catch (e) {
        console.error("Erro ao carregar simulações", e);
        setSavedSimulations([]);
      } finally {
        setIsLoadingSimulations(false);
      }
    };
    
    // Only load if not loading auth and user is present
    if (!authLoading && user) {
      loadSimulations();
    }
  }, [user, authLoading]);

  const handleDataLoaded = (data: FinancialData, files: StoredFile[]) => {
    setFinancialData(data);
    setSourceFiles(files);
    setCurrentSimulationId(null);
    navigate('/dashboard');
  };

  const loadSimulation = (sim: SavedSimulation) => {
    const dataWithLines = {
       ...sim.financialData,
       originalLines: sim.displayLines || sim.financialData.originalLines
    };
    setFinancialData(dataWithLines);
    setCurrentSimulationId(sim.id);
    setSourceFiles([]); 
    navigate('/dashboard');
  };

  const deleteSimulation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (window.confirm("Tem certeza que deseja excluir permanentemente esta simulação?")) {
      try {
        await storageService.delete(id);
        // Só atualiza o estado se o backend confirmar a exclusão sem erros
        setSavedSimulations(prev => prev.filter(s => s.id !== id));
      } catch (error) {
        console.error("Erro ao excluir simulação:", error);
        alert("Não foi possível excluir a simulação. Verifique sua conexão ou tente recarregar a página.");
      }
    }
  };

  const handleReset = () => {
    setFinancialData(null);
    setSourceFiles([]);
    setCurrentSimulationId(null);
    navigate('/');
  };

  const handleLogout = async () => {
    await authService.logout();
    handleReset();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f4f6]">
      {user && !authLoading && (
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
             <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
               <span className="text-gray-500 font-medium text-sm tracking-wide hidden md:block">CONTRATO CONSULTORIA</span>
             </div>
             
             <div className="flex items-center space-x-4">
               <div className="flex items-center">
                  <span className="text-xs text-gray-500 mr-3 hidden sm:block">{user.email}</span>
                  <button 
                    onClick={handleLogout} 
                    className="text-xs font-bold text-red-600 hover:text-red-800 border border-red-100 hover:bg-red-50 px-3 py-1.5 rounded transition-colors"
                  >
                    Sair
                  </button>
               </div>
             </div>
          </div>
        </header>
      )}

      <main className="flex-grow p-4 sm:p-6">
        <Routes>
          <Route path="/login" element={!user && !authLoading ? <AuthScreen onLoginSuccess={() => {}} /> : (user ? <Navigate to="/" replace /> : <div className="flex justify-center mt-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>)} />
          
          <Route path="/" element={
            <ProtectedRoute user={user} authLoading={authLoading}>
              <HomePage 
                savedSimulations={savedSimulations}
                isLoading={isLoadingSimulations}
                onLoadSimulation={loadSimulation}
                onDeleteSimulation={deleteSimulation}
                onNewSimulation={() => navigate('/upload')}
              />
            </ProtectedRoute>
          } />

          <Route path="/upload" element={
            <ProtectedRoute user={user} authLoading={authLoading}>
               <div className="max-w-4xl mx-auto mt-4">
                 <button onClick={() => navigate('/')} className="mb-4 text-gray-500 hover:text-blue-600 flex items-center text-sm font-medium transition-colors">
                   <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                   Voltar para Início
                 </button>
                 <FileUpload onDataLoaded={handleDataLoaded} />
              </div>
            </ProtectedRoute>
          } />

          <Route path="/dashboard" element={
             <ProtectedRoute user={user} authLoading={authLoading}>
                {financialData ? (
                   <Dashboard 
                      data={financialData} 
                      files={sourceFiles} 
                      onReset={handleReset} 
                      loadedSimulationId={currentSimulationId}
                   />
                ) : <Navigate to="/" replace />}
             </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
