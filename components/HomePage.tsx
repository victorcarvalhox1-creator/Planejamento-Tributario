
import React from 'react';
import { SavedSimulation } from '../types';
import { formatBRL } from '../utils/calculations';

interface HomePageProps {
  savedSimulations: SavedSimulation[];
  isLoading: boolean;
  onLoadSimulation: (sim: SavedSimulation) => void;
  onDeleteSimulation: (e: React.MouseEvent, id: string) => void;
  onNewSimulation: () => void;
}

const HomePage: React.FC<HomePageProps> = ({
  savedSimulations,
  isLoading,
  onLoadSimulation,
  onDeleteSimulation,
  onNewSimulation
}) => {
  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="text-center mb-12 mt-8">
         <h1 className="text-3xl font-bold text-gray-800 mb-3">Bem-vindo à CONTRATO CONSULTORIA</h1>
         <p className="text-gray-500 text-lg">Gerencie seus planejamentos tributários ou inicie uma nova análise.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Card Upload */}
         <div className="lg:col-span-1">
           <div 
             onClick={onNewSimulation}
             className="bg-white p-8 rounded-2xl shadow-md border-2 border-dashed border-blue-300 hover:border-blue-600 hover:shadow-xl cursor-pointer transition-all group flex flex-col items-center justify-center h-full min-h-[300px]"
           >
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 group-hover:bg-blue-100 group-hover:scale-110 transition-all">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">Nova Simulação</h3>
              <p className="text-gray-400 text-center text-sm px-4">
                Inicie a partir de DRE, Balancete (PDF/Excel) ou Imagem.
              </p>
           </div>
         </div>

         {/* Lista de Salvos */}
         <div className="lg:col-span-2">
           <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden flex flex-col h-full min-h-[300px]">
              <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-700 flex items-center text-lg">
                   <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                   Meus Projetos
                 </h3>
                 <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">{savedSimulations.length}</span>
              </div>
              
              <div className="flex-grow overflow-y-auto p-4 space-y-3 max-h-[500px]">
                 {isLoading ? (
                   <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                     <svg className="animate-spin h-8 w-8 text-blue-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                       <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                       <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                     <p className="text-sm">Sincronizando...</p>
                   </div>
                 ) : savedSimulations.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
                     <svg className="w-12 h-12 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                     <p>Nenhum projeto encontrado.</p>
                   </div>
                 ) : (
                   savedSimulations.map(sim => (
                     <div 
                       key={sim.id}
                       onClick={() => onLoadSimulation(sim)}
                       className="p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-blue-300 hover:shadow-md cursor-pointer transition-all group relative flex justify-between items-center"
                     >
                        <div className="flex-1 pr-4">
                          <h4 className="font-bold text-gray-800 text-lg group-hover:text-blue-700 mb-1">{sim.name}</h4>
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span className="flex items-center">
                              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {new Date(sim.lastModified).toLocaleDateString()}
                            </span>
                            <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Rec. Anual: {formatBRL(sim.financialData.revenueAnnual)}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                           {sim.regimeResult && (
                             <div className="hidden sm:block text-right mr-4">
                               <span className="block text-[10px] uppercase text-gray-400">Melhor Regime</span>
                               <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{sim.regimeResult}</span>
                             </div>
                           )}
                           
                           <button 
                            type="button"
                            onClick={(e) => {
                                // Parar propagação é crucial aqui
                                e.stopPropagation();
                                onDeleteSimulation(e, sim.id);
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-30 relative isolate"
                            title="Excluir Simulação"
                          >
                            <svg className="w-5 h-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                     </div>
                   ))
                 )}
              </div>
           </div>
         </div>
      </div>
    </div>
  );
};

export default HomePage;
