
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ActivityType, FinancialData, StoredFile, TaxRateConfig, DRELineItem, SavedSimulation, LineTag, LalurAdjustment, ReformConfig, ReformSimulationResult } from '../types';
import { calculateSimples, calculatePresumido, calculateReal, calculateReform, formatBRL } from '../utils/calculations';
import TaxTables from './TaxTables';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { storageService } from '../services/storage';

interface DashboardProps {
  data: FinancialData;
  files: StoredFile[];
  onReset: () => void;
  loadedSimulationId: string | null;
}

type TaxCategory = 'ISS' | 'ICMS';
type ViewTab = 'DRE' | 'BALANCO' | 'EBITDA';
type SystemMode = 'CURRENT' | 'REFORM'; // Toggle Principal

// Fluxo de 4 Etapas
enum DashboardStep {
  DATA_ENTRY = 1,    // Edição Livre (Inline)
  DATA_CONFIRM = 2,  // Confirmação (Leitura)
  PARAMS = 3,        // Parametrização
  RESULT = 4         // Simulação
}

const DEFAULT_PRESUMIDO_CONFIG: TaxRateConfig = {
  pis: 0.65, cofins: 3.00, irpj: 15.00, irpjAdicional: 10.00, csll: 9.00,
  ipi: 0.00, iss: 5.00, icms: 18.00, rat: 2.00, cpp: 20.00, inssTerceiros: 5.80, fgts: 8.00,
  presuncaoIRPJ: 32.00, presuncaoCSLL: 32.00, 
  pisFinancial: 0, cofinsFinancial: 0
};

const DEFAULT_REAL_CONFIG: TaxRateConfig = {
  pis: 1.65, cofins: 7.60, irpj: 15.00, irpjAdicional: 10.00, csll: 9.00,
  ipi: 0.00, iss: 5.00, icms: 18.00, rat: 2.00, cpp: 20.00, inssTerceiros: 5.80, fgts: 8.00,
  presuncaoIRPJ: 0, presuncaoCSLL: 0,
  pisFinancial: 0.65, cofinsFinancial: 4.00
};

const DEFAULT_REFORM_CONFIG: ReformConfig = {
  ibsRate: 17.5, // Estimativa Estado/Município
  cbsRate: 9.0,  // Estimativa Federal
  selectiveTaxRate: 0,
  standardCreditRate: 100 // 100% de aproveitamento por padrão se marcado
};

// Componente para Input Monetário (1.000,00)
const MoneyInput = ({ value, onChange, className, disabled, ...props }: any) => {
  const [displayVal, setDisplayVal] = useState('');

  useEffect(() => {
    let val = value;
    if (typeof val === 'string') val = parseFloat(val);
    if (isNaN(val)) val = 0;

    if (val !== undefined && val !== null) {
        setDisplayVal(val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setDisplayVal(e.target.value);
  };

  const handleBlur = () => {
      let clean = displayVal.replace(/\./g, '').replace(',', '.');
      if (!clean || clean === '-') { 
          onChange(0); 
          setDisplayVal('0,00');
          return; 
      }
      
      const num = parseFloat(clean);
      if (!isNaN(num)) {
          onChange(num);
          setDisplayVal(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } else {
          let val = value || 0;
          setDisplayVal(val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
  };

  return (
      <input
        type="text"
        value={displayVal}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className={className}
        {...props}
      />
  );
};

const Dashboard: React.FC<DashboardProps> = ({ data, files, onReset, loadedSimulationId }) => {
  // -- ESTADOS --
  const [displayLines, setDisplayLines] = useState<DRELineItem[]>([]);
  const [editableData, setEditableData] = useState<FinancialData>(data);
  
  const [currentStep, setCurrentStep] = useState<DashboardStep>(DashboardStep.DATA_ENTRY);
  const [taxCategory, setTaxCategory] = useState<TaxCategory>('ISS');
  const [activityType, setActivityType] = useState<ActivityType>(ActivityType.SERVICO_ANEXO_III);
  
  // Configurações
  const [presumidoConfig, setPresumidoConfig] = useState<TaxRateConfig>(DEFAULT_PRESUMIDO_CONFIG);
  const [realConfig, setRealConfig] = useState<TaxRateConfig>(DEFAULT_REAL_CONFIG);
  const [reformConfig, setReformConfig] = useState<ReformConfig>(DEFAULT_REFORM_CONFIG);
  
  // Modos de Visualização
  const [mode, setMode] = useState<SystemMode>('CURRENT');
  const [activeViewTab, setActiveViewTab] = useState<ViewTab>('DRE');
  
  const [simName, setSimName] = useState<string>('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [simId, setSimId] = useState<string>(loadedSimulationId || Date.now().toString());
  
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  // -- INICIALIZAÇÃO --
  useEffect(() => {
    const init = async () => {
      if (loadedSimulationId) {
        const sims = await storageService.getAll();
        const found = sims.find(s => s.id === loadedSimulationId);
        if (found) {
          setSimName(found.name);
          setActivityType(found.activityType);
          setTaxCategory(found.taxCategory);
          setPresumidoConfig(found.presumidoConfig);
          setRealConfig(found.realConfig);
          if (found.reformConfig) setReformConfig(found.reformConfig);
          setSimId(found.id);
          setDisplayLines(found.displayLines);
          setEditableData(found.financialData);
        }
      } else {
        const initialLines = data.originalLines.map(line => {
          const inferredType = line.lineType || (line.isTotal ? 'SYNTHETIC' : 'ANALYTICAL');
          let tag: LineTag = line.tag || 'OUTROS';
          const desc = line.description.toUpperCase();

          if (tag === 'OUTROS' || !line.tag) {
              if (desc.includes('RECEITA BRUTA') || desc.includes('VENDAS') || desc.includes('SERVIÇOS PRESTADOS')) tag = 'RECEITA';
              else if (desc.includes('DEVOLU') || desc.includes('CANCELAMENTO') || desc.includes('ABATIMENTO')) tag = 'DEDUCAO';
              else if (desc.includes('SIMPLES') || desc.includes('PIS') || desc.includes('COFINS') || desc.includes('ICMS') || desc.includes('ISS')) tag = 'IMPOSTO_VENDA';
              else if (desc.includes('IMPOSTO DE RENDA') || desc.includes('IRPJ') || desc.includes('CSLL')) tag = 'IRPJ_CSLL';
              else if (desc.includes('FOLHA') || desc.includes('SALÁRIOS') || desc.includes('PRÓ-LABORE')) tag = 'FOLHA';
              else if (desc.includes('CUSTO') || desc.includes('CMV') || desc.includes('CSP')) tag = 'CUSTO';
              else if (desc.includes('FINANCEIRA') || desc.includes('JUROS')) {
                  tag = line.value > 0 ? 'REC_FIN' : 'DESP_FIN';
              }
              else if (line.value < 0 && !line.isTotal) tag = 'DESPESA';
          }
          
          let lalurAdjustment: LalurAdjustment = line.lalurAdjustment || null;

          return { ...line, tag, lineType: inferredType, lalurAdjustment, reformCreditRate: 0 };
        });
        setDisplayLines(initialLines);
        recalcTotals(initialLines);
      }
    };
    init();
  }, [loadedSimulationId, data]);

  // -- HANDLERS --
  const recalcTotals = (lines: DRELineItem[]) => {
    const newData = { ...data };
    
    const sumByTag = (tag: LineTag) => lines
      .filter(l => l.tag === tag && l.lineType === 'ANALYTICAL')
      .reduce((acc, curr) => acc + Math.abs(curr.value), 0);
    
    newData.revenueAnnual = sumByTag('RECEITA');
    newData.deductions = sumByTag('DEDUCAO');
    newData.taxesOnSales = sumByTag('IMPOSTO_VENDA');
    newData.taxesIncome = sumByTag('IRPJ_CSLL');
    newData.payrollBase = sumByTag('FOLHA');
    newData.cogs = sumByTag('CUSTO');
    newData.expenses = sumByTag('DESPESA');
    newData.financialRevenues = sumByTag('REC_FIN');
    newData.financialExpenses = sumByTag('DESP_FIN');
    
    const creditBase = lines
      .filter(l => l.useForCredit && (l.tag === 'DESPESA' || l.tag === 'CUSTO') && l.lineType === 'ANALYTICAL')
      .reduce((acc, curr) => acc + Math.abs(curr.value), 0);
      
    newData.realCreditBase = creditBase;
    setEditableData(newData);
  };

  const handleLineChange = (index: number, field: keyof DRELineItem, value: any) => {
    const newLines = [...displayLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setDisplayLines(newLines);
    if (field !== 'reformCreditRate' && field !== 'lalurAdjustment') {
       recalcTotals(newLines);
    }
  };

  // -- CÁLCULOS PRINCIPAIS --
  const results = useMemo(() => {
    const lalurAdjustments = displayLines
      .filter(l => l.lineType === 'ANALYTICAL' && l.lalurAdjustment)
      .reduce((acc, curr) => {
          if (curr.lalurAdjustment === 'ADDITION') acc.additions += Math.abs(curr.value);
          if (curr.lalurAdjustment === 'EXCLUSION') acc.exclusions += Math.abs(curr.value);
          return acc;
      }, { additions: 0, exclusions: 0 });

    const simples = calculateSimples(editableData, activityType);
    const presumido = calculatePresumido(editableData, activityType, presumidoConfig);
    const real = calculateReal(editableData, activityType, realConfig, lalurAdjustments);
    
    // Identificar melhor cenário atual para servir de base para reforma
    const allCurrent = [simples, presumido, real].filter(r => !r.isBlocked);
    const bestCurrent = allCurrent.length > 0 ? allCurrent.reduce((prev, curr) => prev.totalTax < curr.totalTax ? prev : curr) : real;

    const reform = calculateReform(editableData, displayLines, reformConfig, bestCurrent);
    
    return { simples, presumido, real, reform, allCurrent, bestCurrent, lalurAdjustments };
  }, [editableData, activityType, presumidoConfig, realConfig, reformConfig, displayLines]);

  const handleGeneratePDF = async () => {
    if (!dashboardRef.current) return;
    setIsGeneratingPDF(true);
    setTimeout(async () => {
        const element = dashboardRef.current;
        const opt = {
            margin: [5, 5, 5, 5],
            filename: `Planejamento_${simName || 'SemTitulo'}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        const win = window as any;
        if (win.html2pdf) await win.html2pdf().set(opt).from(element).save();
        setIsGeneratingPDF(false);
    }, 100);
  };

  const handleSaveSimulation = async (isSilent = false) => {
    if (!simName && !isSilent) {
       setShowSaveModal(true);
       return;
    }
    const nameToSave = simName || `Rascunho ${new Date().toLocaleDateString()}`;
    const newSim: SavedSimulation = {
      id: simId, 
      name: nameToSave, 
      lastModified: Date.now(),
      financialData: editableData, 
      displayLines: displayLines,
      activityType, 
      taxCategory, 
      presumidoConfig, 
      realConfig,
      reformConfig,
      regimeResult: mode === 'CURRENT' ? results.bestCurrent.regime : 'Comparativo Reforma'
    };
    try {
        const savedId = await storageService.save(newSim);
        setSimId(savedId); 
        if(showSaveModal) { setShowSaveModal(false); alert("Salvo com sucesso!"); } 
        else if (!isSilent) alert("Salvo com sucesso!");
    } catch (error) {
        console.error("Erro ao salvar:", error);
    }
  };

  // --- RENDERIZADORES ---
  const renderLineColumnReform = (line: DRELineItem, index: number) => {
      const isExpense = (line.tag === 'DESPESA' || line.tag === 'CUSTO') && line.lineType === 'ANALYTICAL';
      if (!isExpense) return <span className="text-gray-300">-</span>;

      return (
         <div className="flex items-center space-x-1">
            <input 
              type="number" 
              min="0" max="100"
              value={line.reformCreditRate || 0}
              onChange={(e) => handleLineChange(index, 'reformCreditRate', parseFloat(e.target.value))}
              className="w-12 text-center text-xs border border-purple-300 rounded p-1 focus:ring-1 focus:ring-purple-500 font-bold text-purple-700 bg-purple-50"
            />
            <span className="text-xs text-purple-600">%</span>
         </div>
      );
  };
  
  // Nova Função: Renderiza DRE Comparativa da Reforma (Atual, Presumido, Real, Reforma)
  const renderReformDRE = () => {
      const { reform, presumido, real } = results;
      const r = editableData;
      
      const renderRow = (label: string, actual: number, pres: number, realVal: number, ref: number, isHeader = false, isTotal = false, isHigh = false) => {
          const rev = r.revenueAnnual || 1;
          const pAct = (Math.abs(actual) / rev) * 100;
          const pPres = (Math.abs(pres) / rev) * 100;
          const pReal = (Math.abs(realVal) / rev) * 100;
          const pRef = (Math.abs(ref) / rev) * 100;

          return (
             <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isHeader ? 'bg-purple-50 font-bold text-purple-900' : ''} ${isTotal ? 'bg-purple-50/30 font-bold' : ''} ${isHigh ? 'bg-purple-100 text-purple-900' : ''}`}>
                 <td className="px-3 py-2 text-left">{label}</td>
                 
                 {/* Atual */}
                 <td className={`px-2 py-2 text-right font-mono ${actual < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                     {!isHeader && (actual < 0 ? `(${formatBRL(Math.abs(actual))})` : formatBRL(actual))}
                 </td>
                 <td className="px-1 py-2 text-right text-[9px] text-gray-400 bg-gray-50/20">{!isHeader && `${pAct.toFixed(1)}%`}</td>

                 {/* Presumido */}
                 <td className={`px-2 py-2 text-right font-mono border-l border-gray-100 ${pres < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                     {!isHeader && (pres < 0 ? `(${formatBRL(Math.abs(pres))})` : formatBRL(pres))}
                 </td>
                 <td className="px-1 py-2 text-right text-[9px] text-gray-400 bg-gray-50/20">{!isHeader && `${pPres.toFixed(1)}%`}</td>

                 {/* Real */}
                 <td className={`px-2 py-2 text-right font-mono border-l border-gray-100 ${realVal < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                     {!isHeader && (realVal < 0 ? `(${formatBRL(Math.abs(realVal))})` : formatBRL(realVal))}
                 </td>
                 <td className="px-1 py-2 text-right text-[9px] text-gray-400 bg-gray-50/20">{!isHeader && `${pReal.toFixed(1)}%`}</td>

                 {/* Reforma */}
                 <td className={`px-2 py-2 text-right font-mono border-l border-purple-200 bg-purple-50/20 ${ref < 0 ? 'text-red-600' : 'text-purple-700'}`}>
                     {!isHeader && (ref < 0 ? `(${formatBRL(Math.abs(ref))})` : formatBRL(ref))}
                 </td>
                 <td className="px-1 py-2 text-right text-[9px] text-gray-400 bg-gray-50/20">{!isHeader && `${pRef.toFixed(1)}%`}</td>
             </tr>
          );
      };

      // Cálculos para as linhas
      const receita = r.revenueAnnual;
      const deducoes = -Math.abs(r.deductions);
      
      // Impostos Venda
      const impVendaAtual = -Math.abs(r.taxesOnSales);
      const impVendaPres = -Math.abs(presumido.breakdown.taxSales);
      const impVendaReal = -Math.abs(real.breakdown.taxSales);
      const impVendaRef = -Math.abs(reform.breakdown.taxSales);

      // Receita Líquida
      const recLiqAtual = receita + deducoes + impVendaAtual;
      const recLiqPres = receita + deducoes + impVendaPres;
      const recLiqReal = receita + deducoes + impVendaReal;
      const recLiqRef = receita + deducoes + impVendaRef;

      // Custos/Despesas (Inclui Folha e Encargos calculados)
      const opExpAtual = -(r.cogs + r.expenses + r.payrollBase);
      const opExpPres = -(r.cogs + r.expenses + r.payrollBase + presumido.breakdown.charges + presumido.breakdown.taxPayroll);
      const opExpReal = -(r.cogs + r.expenses + r.payrollBase + real.breakdown.charges + real.breakdown.taxPayroll);
      const opExpRef = -(r.cogs + r.expenses + r.payrollBase + reform.breakdown.charges + reform.breakdown.taxPayroll);

      // Resultado Financeiro
      const resFinAtual = r.financialRevenues - r.financialExpenses;
      const resFinPres = r.financialRevenues - r.financialExpenses;
      const pisCofinsFinReal = -(real.detailed.pisFinancial + real.detailed.cofinsFinancial);
      const resFinReal = resFinAtual + pisCofinsFinReal;
      const resFinRef = resFinAtual; // Assumindo isenção ou não cumulatividade plena na reforma

      // LAIR
      const lairAtual = recLiqAtual + opExpAtual + resFinAtual;
      const lairPres = recLiqPres + opExpPres + resFinPres;
      const lairReal = recLiqReal + opExpReal + resFinReal;
      const lairRef = recLiqRef + opExpRef + resFinRef;

      // IRPJ/CSLL
      const irpjAtual = -Math.abs(r.taxesIncome);
      const irpjPres = -Math.abs(presumido.breakdown.taxIncome);
      const irpjReal = -Math.abs(real.breakdown.taxIncome);
      const irpjRef = -Math.abs(reform.breakdown.taxIncome);

      // Lucro Líquido
      const llAtual = lairAtual + irpjAtual;
      const llPres = lairPres + irpjPres;
      const llReal = lairReal + irpjReal;
      const llRef = lairRef + irpjRef;

      return (
          <div className="bg-white rounded-2xl shadow-sm border border-purple-200 overflow-hidden mt-6 page-break">
               <div className="bg-purple-100 px-6 py-4 flex justify-between items-center border-b border-purple-200">
                   <h3 className="font-bold text-purple-900">DRE Comparativa Completa (Vigente vs Reforma)</h3>
               </div>
               <div className="overflow-x-auto">
                   <table className="w-full text-sm whitespace-nowrap">
                       <thead>
                           <tr className="bg-purple-50 text-purple-900 font-bold text-xs uppercase">
                               <th className="px-3 py-3 text-left w-64">Descrição</th>
                               <th className="px-2 py-3 text-right">DRE Atual</th>
                               <th className="px-1 py-3 w-8"></th>
                               <th className="px-2 py-3 text-right border-l border-purple-100 text-indigo-700">Presumido</th>
                               <th className="px-1 py-3 w-8"></th>
                               <th className="px-2 py-3 text-right border-l border-purple-100 text-blue-700">Lucro Real</th>
                               <th className="px-1 py-3 w-8"></th>
                               <th className="px-2 py-3 text-right border-l border-purple-200 text-purple-700 bg-purple-100/50">Reforma</th>
                               <th className="px-1 py-3 w-8 bg-purple-100/50"></th>
                           </tr>
                       </thead>
                       <tbody>
                           {renderRow("Receita Operacional Bruta", receita, receita, receita, receita, false, true)}
                           {renderRow("(-) Deduções", deducoes, deducoes, deducoes, deducoes)}
                           {renderRow("(-) Impostos s/ Vendas", impVendaAtual, impVendaPres, impVendaReal, impVendaRef)}
                           {renderRow("(=) Receita Líquida", recLiqAtual, recLiqPres, recLiqReal, recLiqRef, false, true)}
                           
                           {renderRow("(-) Custos/Despesas/Encargos", opExpAtual, opExpPres, opExpReal, opExpRef)}
                           {renderRow("(+/-) Resultado Financeiro", resFinAtual, resFinPres, resFinReal, resFinRef)}
                           
                           {renderRow("(=) LAIR", lairAtual, lairPres, lairReal, lairRef, false, true)}
                           {renderRow("(-) IRPJ / CSLL", irpjAtual, irpjPres, irpjReal, irpjRef)}
                           
                           {renderRow("(=) Lucro Líquido Final", llAtual, llPres, llReal, llRef, false, true, true)}
                       </tbody>
                   </table>
               </div>
          </div>
      );
  };

  const renderCurrentVsReformTable = () => {
      const current = results.bestCurrent;
      const reform = results.reform;
      const diff = reform.totalTax - current.totalTax;
      const isSaving = diff < 0;

      return (
         <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="bg-gradient-to-r from-purple-900 to-indigo-800 text-white px-6 py-4 flex justify-between items-center">
                 <h3 className="font-bold text-lg">Reforma Tributária: Análise de Impacto</h3>
                 <span className="text-xs bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider">Cenário Projetado</span>
             </div>
             
             <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                 {/* Current Scenario Card */}
                 <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                     <h4 className="text-gray-500 font-bold text-xs uppercase mb-2">Cenário Vigente ({current.regime})</h4>
                     <div className="text-2xl font-extrabold text-gray-800 mb-4">{formatBRL(current.totalTax)}</div>
                     <div className="space-y-2 text-sm">
                         <div className="flex justify-between"><span>PIS/COFINS/ISS/ICMS:</span> <span className="font-bold">{formatBRL(current.breakdown.taxSales)}</span></div>
                         <div className="flex justify-between"><span>IRPJ/CSLL:</span> <span className="font-bold">{formatBRL(current.breakdown.taxIncome)}</span></div>
                         <div className="flex justify-between"><span>Encargos Folha:</span> <span className="font-bold">{formatBRL(current.breakdown.charges + current.breakdown.taxPayroll)}</span></div>
                     </div>
                 </div>

                 {/* Reform Scenario Card */}
                 <div className="bg-purple-50 rounded-xl p-5 border border-purple-200 relative overflow-hidden">
                     <div className="absolute top-0 right-0 bg-purple-200 text-purple-800 text-[10px] font-bold px-2 py-1 rounded-bl">IVA DUAL</div>
                     <h4 className="text-purple-600 font-bold text-xs uppercase mb-2">Cenário Reforma (IBS + CBS)</h4>
                     <div className="text-2xl font-extrabold text-purple-900 mb-4">{formatBRL(reform.totalTax)}</div>
                     <div className="space-y-2 text-sm text-purple-900/80">
                         <div className="flex justify-between"><span>IBS ({reformConfig.ibsRate}%):</span> <span className="font-bold">{formatBRL(reform.detailed.ibs || 0)}</span></div>
                         <div className="flex justify-between"><span>CBS ({reformConfig.cbsRate}%):</span> <span className="font-bold">{formatBRL(reform.detailed.cbs || 0)}</span></div>
                         <div className="flex justify-between"><span>Créditos Tomados:</span> <span className="font-bold text-green-600">-{formatBRL(reform.totalCredits)}</span></div>
                         <div className="border-t border-purple-200 pt-1 flex justify-between"><span>IRPJ/CSLL (Est.):</span> <span className="font-bold">{formatBRL(reform.breakdown.taxIncome)}</span></div>
                     </div>
                 </div>

                 {/* Comparison Card */}
                 <div className={`rounded-xl p-5 border flex flex-col justify-center items-center text-center ${isSaving ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                     <h4 className={`font-bold text-xs uppercase mb-2 ${isSaving ? 'text-green-600' : 'text-red-600'}`}>Impacto Financeiro</h4>
                     <div className={`text-3xl font-extrabold mb-1 ${isSaving ? 'text-green-700' : 'text-red-700'}`}>
                         {isSaving ? '-' : '+'}{formatBRL(Math.abs(diff))}
                     </div>
                     <p className={`text-sm font-medium ${isSaving ? 'text-green-600' : 'text-red-600'}`}>
                         {isSaving ? 'Economia Estimada por Ano' : 'Aumento de Carga Tributária'}
                     </p>
                     <div className="mt-4 text-xs text-gray-500">
                         Carga Efetiva: <span className="font-bold">{current.effectiveRate.toFixed(2)}%</span> ➝ <span className="font-bold">{reform.effectiveRate.toFixed(2)}%</span>
                     </div>
                 </div>
             </div>

             <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                 <h4 className="font-bold text-sm text-gray-700 mb-3">Memória de Cálculo - IVA (IBS/CBS)</h4>
                 <table className="w-full text-xs text-left">
                     <thead>
                         <tr className="text-gray-500 border-b">
                             <th className="pb-2">Descrição</th>
                             <th className="pb-2 text-right">Base de Cálculo</th>
                             <th className="pb-2 text-right">Alíquota</th>
                             <th className="pb-2 text-right">Débito</th>
                             <th className="pb-2 text-right">Crédito</th>
                             <th className="pb-2 text-right">A Pagar</th>
                         </tr>
                     </thead>
                     <tbody className="text-gray-700 font-mono">
                         <tr className="border-b border-gray-100">
                             <td className="py-2">IBS (Estadual/Municipal)</td>
                             <td className="py-2 text-right">{formatBRL(editableData.revenueAnnual - editableData.deductions)}</td>
                             <td className="py-2 text-right">{reformConfig.ibsRate}%</td>
                             <td className="py-2 text-right text-red-600">{formatBRL(reform.debitIBS)}</td>
                             <td className="py-2 text-right text-green-600">({formatBRL(reform.creditIBS)})</td>
                             <td className="py-2 text-right font-bold">{formatBRL(reform.detailed.ibs || 0)}</td>
                         </tr>
                         <tr>
                             <td className="py-2">CBS (Federal)</td>
                             <td className="py-2 text-right">{formatBRL(editableData.revenueAnnual - editableData.deductions)}</td>
                             <td className="py-2 text-right">{reformConfig.cbsRate}%</td>
                             <td className="py-2 text-right text-red-600">{formatBRL(reform.debitCBS)}</td>
                             <td className="py-2 text-right text-green-600">({formatBRL(reform.creditCBS)})</td>
                             <td className="py-2 text-right font-bold">{formatBRL(reform.detailed.cbs || 0)}</td>
                         </tr>
                     </tbody>
                 </table>
             </div>
         </div>
      );
  };
  
  // Função Render DRE Row (Reused from Current)
  const renderDRERow = (
      label: string, 
      actual: number, 
      real: number, 
      presumed: number, 
      isHeader = false, 
      isTotal = false,
      indent = 0,
      note?: string
  ) => {
      const revenue = editableData.revenueAnnual || 1; 
      
      const pActual = (Math.abs(actual) / revenue) * 100;
      const pReal = (Math.abs(real) / revenue) * 100;
      const pPresumed = (Math.abs(presumed) / revenue) * 100;

      return (
        <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isHeader ? 'bg-gray-50 font-bold text-gray-600 uppercase text-xs' : ''} ${isTotal ? 'bg-blue-50/50 font-bold' : ''}`}>
            <td className={`px-4 py-2 ${isTotal ? 'text-gray-800' : 'text-gray-600'}`} style={{ paddingLeft: `${indent * 20 + 16}px` }}>
                {label} {note && <span className="text-[10px] text-gray-400 ml-1">({note})</span>}
            </td>
            
            {/* Coluna 1: DRE Atual */}
            <td className={`px-4 py-2 text-right font-mono ${actual < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {!isHeader && (actual < 0 ? `(${formatBRL(Math.abs(actual))})` : formatBRL(actual))}
            </td>
            <td className="px-2 py-2 text-right text-[10px] text-gray-400 w-12 bg-gray-50/30">
                {!isHeader && `${pActual.toFixed(1)}%`}
            </td>

            {/* Coluna 2: Lucro Real */}
            <td className={`px-4 py-2 text-right font-mono border-l border-gray-100 ${real < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                {!isHeader && (real < 0 ? `(${formatBRL(Math.abs(real))})` : formatBRL(real))}
            </td>
            <td className="px-2 py-2 text-right text-[10px] text-gray-400 w-12 bg-gray-50/30">
                 {!isHeader && `${pReal.toFixed(1)}%`}
            </td>

            {/* Coluna 3: Lucro Presumido */}
            <td className={`px-4 py-2 text-right font-mono border-l border-gray-100 ${presumed < 0 ? 'text-red-600' : 'text-indigo-700'}`}>
                 {!isHeader && (presumed < 0 ? `(${formatBRL(Math.abs(presumed))})` : formatBRL(presumed))}
            </td>
            <td className="px-2 py-2 text-right text-[10px] text-gray-400 w-12 bg-gray-50/30">
                 {!isHeader && `${pPresumed.toFixed(1)}%`}
            </td>
        </tr>
      );
  };

  return (
    <div ref={dashboardRef} className="max-w-7xl mx-auto px-4 pb-24 relative font-sans print:p-0 print:pb-0 print:max-w-none">
      
      {/* MODE TOGGLE BAR */}
      <div className="bg-gray-800 text-white p-3 rounded-xl mb-6 flex justify-between items-center shadow-lg print:hidden">
          <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-70">Ambiente de Simulação:</span>
              <div className="flex bg-gray-900 rounded-lg p-1">
                  <button 
                    onClick={() => setMode('CURRENT')}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${mode === 'CURRENT' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-white'}`}
                  >
                    Vigente (Atual)
                  </button>
                  <button 
                    onClick={() => setMode('REFORM')}
                    className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center ${mode === 'REFORM' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Reforma Tributária
                  </button>
              </div>
          </div>
          <div className="flex space-x-3">
             <button onClick={() => handleSaveSimulation(false)} className="text-xs font-bold bg-white/10 hover:bg-white/20 px-4 py-2 rounded transition-colors">Salvar</button>
             <button onClick={onReset} className="text-xs font-bold bg-red-500/80 hover:bg-red-500 px-4 py-2 rounded transition-colors">Fechar</button>
          </div>
      </div>

      {/* Steps Navigation */}
      <div className="max-w-5xl mx-auto mb-8 px-4 print:hidden" style={{ display: isGeneratingPDF ? 'none' : 'block' }}>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10 rounded"></div>
          {[{ step: 1, label: 'Edição' }, { step: 2, label: 'Confirmação' }, { step: 3, label: 'Parâmetros' }, { step: 4, label: 'Simulação' }].map((s) => (
            <button key={s.step} onClick={() => { if(s.step < currentStep) setCurrentStep(s.step as DashboardStep) }} className={`flex flex-col items-center bg-[#f3f4f6] px-4 py-2 rounded-lg transition-all ${s.step <= currentStep ? 'cursor-pointer hover:bg-gray-200' : 'cursor-default opacity-60'}`}>
               <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold transition-colors ${currentStep >= s.step ? (mode === 'REFORM' ? 'bg-purple-600' : 'bg-blue-600') + ' text-white shadow-lg ring-4 ring-white' : 'bg-gray-300 text-gray-500'}`}>{currentStep > s.step ? '✓' : s.step}</div>
               <span className={`text-xs font-bold mt-2 uppercase tracking-wider ${currentStep >= s.step ? (mode === 'REFORM' ? 'text-purple-700' : 'text-blue-700') : 'text-gray-400'}`}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* STEP 1: DATA ENTRY */}
      {currentStep === DashboardStep.DATA_ENTRY && (
        <div className="animate-fade-in">
           {/* Summary Bar */}
           <div className={`border rounded-xl p-4 mb-6 shadow-sm flex flex-wrap gap-4 items-center justify-between sticky top-0 z-20 bg-white ${mode === 'REFORM' ? 'border-purple-200 shadow-purple-100' : 'border-gray-200'}`}>
              <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0 scrollbar-hide w-full md:w-auto">
                 <div className="px-4 py-2 bg-gray-50 rounded-lg"><p className="text-[10px] uppercase font-bold text-gray-400">Receita Total</p><p className="text-lg font-mono font-bold text-blue-600">{formatBRL(editableData.revenueAnnual)}</p></div>
                 <div className="px-4 py-2 bg-gray-50 rounded-lg"><p className="text-[10px] uppercase font-bold text-gray-400">Custos + Despesas</p><p className="text-lg font-mono font-bold text-gray-700">{formatBRL(editableData.cogs + editableData.expenses)}</p></div>
                 {mode === 'REFORM' && (
                     <div className="px-4 py-2 bg-purple-50 rounded-lg border border-purple-100">
                         <p className="text-[10px] uppercase font-bold text-purple-400">Crédito Estimado (Ref.)</p>
                         <p className="text-lg font-mono font-bold text-purple-700">{formatBRL(results.reform.totalCredits)}</p>
                     </div>
                 )}
              </div>
              <button 
                 onClick={() => { handleSaveSimulation(true); setCurrentStep(DashboardStep.DATA_CONFIRM); }}
                 className={`${mode === 'REFORM' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white font-bold py-3 px-6 rounded-lg shadow w-full md:w-auto`}
              >
                 Confirmar Dados →
              </button>
           </div>

           <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px]">
              <div className="flex border-b border-gray-200 bg-gray-50">
                 {['DRE', 'BALANCO'].map(tab => (
                    <button key={tab} onClick={() => setActiveViewTab(tab as ViewTab)} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${activeViewTab === tab ? (mode === 'REFORM' ? 'border-purple-600 text-purple-700' : 'border-blue-600 text-blue-700') + ' bg-white' : 'border-transparent text-gray-500 hover:bg-gray-100'}`}>
                      {tab}
                    </button>
                 ))}
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                   <thead className="bg-gray-100 text-xs text-gray-500 uppercase font-semibold">
                      <tr>
                         <th className="px-4 py-3 text-left w-1/3">Descrição</th>
                         <th className="px-4 py-3 text-left w-24">Tipo</th>
                         <th className="px-4 py-3 text-left w-32">Classificação</th>
                         {mode === 'CURRENT' && <th className="px-4 py-3 text-center w-20" title="Crédito PIS/COFINS (L. Real)">Créd?</th>}
                         {mode === 'CURRENT' && <th className="px-4 py-3 text-left w-32">Ajuste LALUR</th>}
                         {mode === 'REFORM' && <th className="px-4 py-3 text-left w-32 bg-purple-50 text-purple-700">% Crédito (IBS/CBS)</th>}
                         <th className="px-4 py-3 text-right w-32">Valor (R$)</th>
                      </tr>
                   </thead>
                   <tbody>
                      {displayLines.filter(l => l.section === activeViewTab || (activeViewTab === 'DRE' && l.section === 'EBITDA')).map((line, idx) => {
                        const realIndex = displayLines.indexOf(line);
                        const isAnalytical = line.lineType === 'ANALYTICAL';
                        const isExpenseOrCost = line.tag === 'DESPESA' || line.tag === 'CUSTO';
                        
                        return (
                          <tr key={idx} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${line.isTotal ? 'bg-gray-50 font-bold' : ''}`}>
                             <td className="px-4 py-2"><input type="text" value={line.description} onChange={(e) => handleLineChange(realIndex, 'description', e.target.value)} className={`w-full bg-transparent border-b border-transparent focus:border-blue-400 outline-none px-1 py-1 ${line.isTotal ? 'font-bold' : ''}`} style={{ paddingLeft: `${(line.level||0)*15}px` }} /></td>
                             <td className="px-4 py-2">
                                <select value={line.lineType} onChange={(e) => handleLineChange(realIndex, 'lineType', e.target.value)} className="text-[10px] font-bold uppercase rounded border outline-none cursor-pointer bg-gray-100"><option value="SYNTHETIC">Grupo</option><option value="ANALYTICAL">Conta</option></select>
                             </td>
                             <td className="px-4 py-2">
                                {!line.isTotal && isAnalytical && (
                                  <select value={line.tag || 'OUTROS'} onChange={(e) => handleLineChange(realIndex, 'tag', e.target.value)} className={`w-full text-xs border rounded p-1 outline-none ${line.tag === 'RECEITA' ? 'bg-green-50' : line.tag === 'DESPESA' ? 'bg-red-50' : 'bg-white'}`}>
                                    <option value="OUTROS">Outros</option>
                                    <option value="RECEITA">Receita (+)</option>
                                    <option value="DEDUCAO">Dedução (Devol.)</option>
                                    <option value="IMPOSTO_VENDA">Imp. s/ Vendas (-)</option>
                                    <option value="IRPJ_CSLL">IRPJ/CSLL (-)</option>
                                    <option value="FOLHA">Folha</option>
                                    <option value="CUSTO">Custo</option>
                                    <option value="DESPESA">Despesa</option>
                                    <option value="REC_FIN">Rec. Fin</option>
                                    <option value="DESP_FIN">Desp. Fin</option>
                                  </select>
                                )}
                             </td>
                             
                             {/* CURRENT: Checkbox PIS/COFINS */}
                             {mode === 'CURRENT' && (
                                <td className="px-4 py-2 text-center">
                                    {isExpenseOrCost && isAnalytical && <input type="checkbox" checked={!!line.useForCredit} onChange={(e) => handleLineChange(realIndex, 'useForCredit', e.target.checked)} className="w-4 h-4 text-blue-600 rounded cursor-pointer" />}
                                </td>
                             )}

                             {/* CURRENT: LALUR */}
                             {mode === 'CURRENT' && (
                                <td className="px-4 py-2">
                                    {!line.isTotal && isAnalytical && <select value={line.lalurAdjustment || ''} onChange={(e) => handleLineChange(realIndex, 'lalurAdjustment', e.target.value || null)} className="w-full text-xs border rounded p-1"><option value="">-</option><option value="ADDITION">[+] Adição</option><option value="EXCLUSION">[-] Exclusão</option></select>}
                                </td>
                             )}

                             {/* REFORM: Percentage Credit */}
                             {mode === 'REFORM' && (
                                <td className="px-4 py-2 bg-purple-50/30">
                                   {renderLineColumnReform(line, realIndex)}
                                </td>
                             )}

                             <td className="px-4 py-2">
                                <MoneyInput value={line.value} onChange={(val: number) => handleLineChange(realIndex, 'value', val)} className={`w-full text-right bg-transparent border border-transparent focus:border-blue-400 focus:bg-white rounded outline-none px-2 py-1 font-mono ${line.value < 0 ? 'text-red-600' : 'text-gray-800'}`} />
                             </td>
                          </tr>
                        );
                      })}
                   </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {/* STEP 2: CONFIRMATION (Simplified reuse) */}
      {currentStep === DashboardStep.DATA_CONFIRM && (
        <div className="animate-fade-in max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8">
               <div className={`px-6 py-4 flex justify-between items-center text-white ${mode === 'REFORM' ? 'bg-purple-800' : 'bg-gray-800'}`}>
                  <h3 className="font-bold text-lg">DRE Consolidada ({mode === 'REFORM' ? 'Visão Reforma' : 'Visão Vigente'})</h3>
               </div>
               <div className="p-0 max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                     <tbody>
                        {displayLines.filter(l => l.section === 'DRE').map((line, idx) => (
                           <tr key={idx} className={`border-b border-gray-50 ${line.isTotal ? 'bg-gray-50 font-bold' : ''}`}>
                              <td className="px-6 py-2.5 text-gray-700" style={{ paddingLeft: `${(line.level || 0) * 20 + 24}px` }}>{line.description}</td>
                              <td className="px-6 py-2.5 text-right text-gray-900 font-mono">{formatBRL(line.value)}</td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
            <div className="flex justify-center space-x-4">
               <button onClick={() => setCurrentStep(DashboardStep.DATA_ENTRY)} className="px-6 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold rounded-lg border border-gray-300">← Voltar</button>
               <button onClick={() => setCurrentStep(DashboardStep.PARAMS)} className={`px-8 py-3 font-bold rounded-lg shadow-lg text-white ${mode === 'REFORM' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}>Avançar para Parâmetros →</button>
            </div>
        </div>
      )}

      {/* STEP 3: PARAMS */}
      {currentStep === DashboardStep.PARAMS && (
         <div className="animate-fade-in max-w-5xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
               <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">
                   {mode === 'REFORM' ? 'Parâmetros da Reforma (IVA Dual)' : 'Configuração Tributária Vigente'}
               </h2>

               {mode === 'CURRENT' ? (
                   // ... (Existing Current Params Code) ...
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Categoria</label>
                            <div className="flex rounded-lg bg-gray-100 p-1 mb-4">
                                <button onClick={() => setTaxCategory('ISS')} className={`flex-1 py-2 rounded-md text-sm font-medium ${taxCategory === 'ISS' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>Serviços</button>
                                <button onClick={() => setTaxCategory('ICMS')} className={`flex-1 py-2 rounded-md text-sm font-medium ${taxCategory === 'ICMS' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>Comércio/Ind.</button>
                            </div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Simples Nacional</label>
                            <select className="w-full border p-2.5 rounded-lg" value={activityType} onChange={e => setActivityType(e.target.value as ActivityType)}>
                                {taxCategory === 'ICMS' ? (<><option value={ActivityType.COMERCIO}>Anexo I</option><option value={ActivityType.INDUSTRIA}>Anexo II</option></>) : (<><option value={ActivityType.SERVICO_ANEXO_III}>Anexo III</option><option value={ActivityType.SERVICO_ANEXO_IV}>Anexo IV</option><option value={ActivityType.SERVICO_ANEXO_V}>Anexo V</option></>)}
                            </select>
                        </div>
                        <div className="space-y-4">
                            <div className="border p-4 rounded-lg bg-blue-50">
                                <h4 className="font-bold text-blue-800 text-sm mb-2">Lucro Presumido</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div><span>Presunção IRPJ</span><input type="number" value={presumidoConfig.presuncaoIRPJ} onChange={e => setPresumidoConfig({...presumidoConfig, presuncaoIRPJ: parseFloat(e.target.value)})} className="w-full border rounded p-1" /></div>
                                    <div><span>Presunção CSLL</span><input type="number" value={presumidoConfig.presuncaoCSLL} onChange={e => setPresumidoConfig({...presumidoConfig, presuncaoCSLL: parseFloat(e.target.value)})} className="w-full border rounded p-1" /></div>
                                </div>
                            </div>
                             <div className="border p-4 rounded-lg bg-indigo-50">
                                <h4 className="font-bold text-indigo-800 text-sm mb-2">Lucro Real</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div><span>PIS (Rec. Fin)</span><input type="number" value={realConfig.pisFinancial} onChange={e => setRealConfig({...realConfig, pisFinancial: parseFloat(e.target.value)})} className="w-full border rounded p-1" /></div>
                                    <div><span>COFINS (Rec. Fin)</span><input type="number" value={realConfig.cofinsFinancial} onChange={e => setRealConfig({...realConfig, cofinsFinancial: parseFloat(e.target.value)})} className="w-full border rounded p-1" /></div>
                                </div>
                            </div>
                        </div>
                   </div>
               ) : (
                   // ... (REFORM PARAMS) ...
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-8 animate-fade-in">
                       <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                           <h3 className="text-purple-800 font-bold mb-4 flex items-center"><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>Alíquotas de Referência (IVA)</h3>
                           <div className="space-y-4">
                               <div>
                                   <label className="block text-sm font-bold text-gray-700 mb-1">IBS (Estados e Municípios)</label>
                                   <div className="flex items-center">
                                       <input type="number" value={reformConfig.ibsRate} onChange={e => setReformConfig({...reformConfig, ibsRate: parseFloat(e.target.value)})} className="w-24 border border-purple-300 rounded p-2 text-center font-bold text-purple-700 outline-none focus:ring-2 focus:ring-purple-500" />
                                       <span className="ml-2 text-gray-500">% (Estimado: 17-18%)</span>
                                   </div>
                               </div>
                               <div>
                                   <label className="block text-sm font-bold text-gray-700 mb-1">CBS (Federal)</label>
                                   <div className="flex items-center">
                                       <input type="number" value={reformConfig.cbsRate} onChange={e => setReformConfig({...reformConfig, cbsRate: parseFloat(e.target.value)})} className="w-24 border border-purple-300 rounded p-2 text-center font-bold text-purple-700 outline-none focus:ring-2 focus:ring-purple-500" />
                                       <span className="ml-2 text-gray-500">% (Estimado: 9-10%)</span>
                                   </div>
                               </div>
                               <div>
                                   <label className="block text-sm font-bold text-gray-700 mb-1">Imposto Seletivo</label>
                                   <div className="flex items-center">
                                       <input type="number" value={reformConfig.selectiveTaxRate} onChange={e => setReformConfig({...reformConfig, selectiveTaxRate: parseFloat(e.target.value)})} className="w-24 border border-gray-300 rounded p-2 text-center text-gray-700 outline-none focus:ring-2 focus:ring-purple-500" />
                                       <span className="ml-2 text-gray-500">% (Sobretaxa nociva)</span>
                                   </div>
                               </div>
                           </div>
                       </div>
                       <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-100">
                           <h3 className="text-yellow-800 font-bold mb-4 flex items-center"><svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Como funciona o cálculo?</h3>
                           <ul className="text-sm text-yellow-900 space-y-3 opacity-90">
                               <li><strong>1. Base Ampla:</strong> O IVA incide sobre todas as receitas, exceto exportações e algumas isenções específicas.</li>
                               <li><strong>2. Crédito Financeiro:</strong> Diferente do PIS/COFINS físico, você se credita do imposto destacado na nota de todas as aquisições da atividade.</li>
                               <li><strong>3. Não Cumulatividade Plena:</strong> O valor a pagar é (Débitos - Créditos).</li>
                               <li><strong>4. IRPJ/CSLL:</strong> A reforma foca no consumo. A tributação sobre a renda (Lucro Real/Presumido) tende a ser mantida separadamente inicialmente. Esta simulação projeta o cenário mantendo a carga de renda do Lucro Real.</li>
                           </ul>
                       </div>
                   </div>
               )}

               <div className="flex justify-center space-x-4 border-t pt-6">
                  <button onClick={() => setCurrentStep(DashboardStep.DATA_CONFIRM)} className="px-6 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 font-bold rounded-lg border border-gray-300">← Voltar</button>
                  <button onClick={() => { handleSaveSimulation(true); setCurrentStep(DashboardStep.RESULT); }} className={`px-10 py-3 text-white font-bold rounded-lg shadow-lg ${mode === 'REFORM' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-green-600 hover:bg-green-700'}`}>Calcular Simulação</button>
               </div>
            </div>
         </div>
      )}

      {/* STEP 4: RESULTADOS */}
      {currentStep === DashboardStep.RESULT && (
         <div className="animate-fade-in space-y-10">
            {mode === 'CURRENT' ? (
                // --- CURRENT RESULTS (Original) ---
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 page-break">
                        {results.allCurrent.map(res => {
                            const isBest = results.bestCurrent.regime === res.regime && !res.isBlocked;
                            return (
                                <div key={res.regime} className={`relative bg-white p-6 rounded-2xl border-2 ${isBest ? 'border-green-500 shadow-lg ring-1 ring-green-500 transform scale-105 z-10' : 'border-gray-100 shadow-sm'} transition-all`}>
                                    {isBest && <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow-sm">RECOMENDADO</div>}
                                    <h3 className="text-gray-500 font-bold text-sm uppercase tracking-wider mb-2">{res.regime}</h3>
                                    <div className={`text-3xl font-extrabold mb-1 ${res.isBlocked ? 'text-red-400' : 'text-gray-800'}`}>{res.isBlocked ? 'Incompatível' : formatBRL(res.totalTax)}</div>
                                    {!res.isBlocked ? (<div className="text-sm text-gray-500">Carga Efetiva: <span className={`font-bold ${isBest ? 'text-green-600' : 'text-gray-700'}`}>{res.effectiveRate.toFixed(2)}%</span></div>) : (<span className="inline-block mt-2 text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100">Faturamento Excede Limite</span>)}
                                </div>
                            )
                        })}
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 page-break">
                       <h3 className="text-lg font-bold text-gray-800 text-center mb-4">Comparativo de Resultado (DRE)</h3>
                       <div className="overflow-x-auto">
                           <table className="w-full text-sm">
                               <thead>
                                   <tr className="border-b-2 border-gray-100">
                                       <th className="px-4 py-3 text-left w-1/3">Descrição</th>
                                       <th className="px-4 py-3 text-right text-gray-600">DRE Atual</th>
                                       <th className="px-2 py-3 text-right w-12 text-[10px] text-gray-400">%</th>
                                       <th className="px-4 py-3 text-right text-blue-700 border-l border-gray-100">Projetando Real</th>
                                       <th className="px-2 py-3 text-right w-12 text-[10px] text-gray-400">%</th>
                                       <th className="px-4 py-3 text-right text-indigo-700 border-l border-gray-100">Projetando Presumido</th>
                                       <th className="px-2 py-3 text-right w-12 text-[10px] text-gray-400">%</th>
                                   </tr>
                               </thead>
                               <tbody>
                                   {(() => {
                                        const r = editableData;
                                        const s = results.bestCurrent; // Use best current just for taxes ref if needed, but we calculate specific cols
                                        const real = results.real;
                                        const pres = results.presumido;

                                        // 1. Receita Bruta
                                        const receita = r.revenueAnnual;
                                        
                                        // 2. Deduções (Devoluções)
                                        const deductions = -r.deductions;

                                        // 3. Impostos sobre Venda (PIS/COFINS/ISS/ICMS/SIMPLES)
                                        // Atual: O que veio importado
                                        const taxesSaleActual = -r.taxesOnSales;
                                        // Real: Calculado
                                        const taxesSaleReal = -real.breakdown.taxSales;
                                        // Presumido: Calculado
                                        const taxesSalePres = -pres.breakdown.taxSales;

                                        // 4. Receita Líquida
                                        const netRevActual = receita + deductions + taxesSaleActual;
                                        const netRevReal = receita + deductions + taxesSaleReal;
                                        const netRevPres = receita + deductions + taxesSalePres;

                                        // 5. Custos e Despesas (Operacionais)
                                        // Inclui Custo, Despesa, Folha e Encargos da Folha
                                        // Atual: Soma do importado
                                        const opExpActual = -(r.cogs + r.expenses + r.payrollBase); // Encargos? Assumindo inclusos na despesa ou não detalhados no import
                                        // Real: Soma + Encargos Calculados
                                        const opExpReal = -(r.cogs + r.expenses + r.payrollBase + real.breakdown.charges + real.breakdown.taxPayroll); 
                                        // Presumido: Soma + Encargos Calculados
                                        const opExpPres = -(r.cogs + r.expenses + r.payrollBase + pres.breakdown.charges + pres.breakdown.taxPayroll);

                                        // 6. Resultado Financeiro
                                        const finResult = r.financialRevenues - r.financialExpenses;
                                        // No Lucro Real, PIS/COFINS s/ Rec Financeira reduz esse resultado
                                        const pisCofinsFinReal = -(real.detailed.pisFinancial + real.detailed.cofinsFinancial);
                                        const finResultReal = finResult + pisCofinsFinReal;
                                        
                                        // 7. Resultado Operacional (EBITDA approx + Deprec)
                                        const resOpActual = netRevActual + opExpActual + finResult;
                                        const resOpReal = netRevReal + opExpReal + finResultReal;
                                        const resOpPres = netRevPres + opExpPres + finResult;

                                        // 8. IRPJ / CSLL
                                        const taxesIncomeActual = -r.taxesIncome;
                                        const taxesIncomeReal = -real.breakdown.taxIncome;
                                        const taxesIncomePres = -pres.breakdown.taxIncome;

                                        // 9. Lucro Líquido
                                        const netProfitActual = resOpActual + taxesIncomeActual;
                                        const netProfitReal = resOpReal + taxesIncomeReal;
                                        const netProfitPres = resOpPres + taxesIncomePres;

                                        return (
                                            <>
                                                {renderDRERow("Receita Operacional Bruta", receita, receita, receita, true)}
                                                {renderDRERow("(-) Deduções da Receita", deductions, deductions, deductions)}
                                                {renderDRERow("(-) Impostos s/ Vendas (ICMS/ISS/PIS/COF)", taxesSaleActual, taxesSaleReal, taxesSalePres)}
                                                {renderDRERow("(=) Receita Líquida", netRevActual, netRevReal, netRevPres, false, true)}
                                                
                                                {renderDRERow("(-) Custos, Despesas e Folha", opExpActual, opExpReal, opExpPres)}
                                                
                                                {renderDRERow("(+) Receitas Financeiras", r.financialRevenues, r.financialRevenues, r.financialRevenues)}
                                                {renderDRERow("(-) PIS/COFINS s/ Rec. Fin.", 0, pisCofinsFinReal, 0)}
                                                {renderDRERow("(-) Despesas Financeiras", -r.financialExpenses, -r.financialExpenses, -r.financialExpenses)}
                                                
                                                {renderDRERow("(=) Resultado Antes do IRPJ/CSLL", resOpActual, resOpReal, resOpPres, false, true)}
                                                
                                                {renderDRERow("(-) IRPJ / CSLL", taxesIncomeActual, taxesIncomeReal, taxesIncomePres)}
                                                
                                                {renderDRERow("(=) Lucro Líquido do Exercício", netProfitActual, netProfitReal, netProfitPres, false, true, 0)}
                                            </>
                                        );
                                   })()}
                               </tbody>
                           </table>
                       </div>
                    </div>
                </>
            ) : (
                // --- REFORM RESULTS (New) ---
                <>
                    {renderCurrentVsReformTable()}

                    {/* DRE COMPARATIVA DA REFORMA (ATUAL, PRESUMIDO, REAL, REFORMA) */}
                    {renderReformDRE()}
                    
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 page-break">
                        <h3 className="font-bold text-gray-800 mb-6 text-center">Gráfico Comparativo: Vigente vs Reforma</h3>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={[
                                    { name: 'Cenário Vigente', Tax: results.bestCurrent.totalTax, fill: '#4b5563' },
                                    { name: 'Cenário Reforma', Tax: results.reform.totalTax, fill: '#9333ea' }
                                ]} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                                    <YAxis dataKey="name" type="category" width={120} />
                                    <Tooltip formatter={(value:any) => formatBRL(value)} />
                                    <Legend />
                                    <Bar dataKey="Tax" name="Carga Tributária Total" barSize={40} radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}

            <div className="flex justify-center space-x-4 pt-6 pb-10 print:hidden">
               <button onClick={() => setCurrentStep(DashboardStep.PARAMS)} className="px-6 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50">← Ajustar Parâmetros</button>
               <button onClick={() => handleSaveSimulation(false)} className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow">Salvar Resultado</button>
               <button onClick={handleGeneratePDF} disabled={isGeneratingPDF} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow flex items-center disabled:opacity-50">
                  {isGeneratingPDF ? 'Gerando...' : 'Gerar PDF'}
               </button>
            </div>
         </div>
      )}

      {/* Modal Salvar Nome */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
           <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-fade-in">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Salvar Planejamento ({mode === 'REFORM' ? 'Reforma' : 'Vigente'})</h3>
              <input type="text" autoFocus placeholder="Nome do Cenário" className="w-full border border-gray-300 rounded-lg p-3 mb-6 focus:ring-2 focus:ring-blue-500 outline-none" value={simName} onChange={e => setSimName(e.target.value)} />
              <div className="flex justify-end space-x-3">
                 <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
                 <button onClick={() => handleSaveSimulation(false)} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">Salvar</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
