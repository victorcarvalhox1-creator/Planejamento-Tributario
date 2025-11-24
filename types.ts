
export enum ActivityType {
  COMERCIO = 'COMERCIO',
  INDUSTRIA = 'INDUSTRIA',
  SERVICO_ANEXO_III = 'SERVICO_ANEXO_III',
  SERVICO_ANEXO_IV = 'SERVICO_ANEXO_IV',
  SERVICO_ANEXO_V = 'SERVICO_ANEXO_V'
}

export type LineTag = 'RECEITA' | 'DEDUCAO' | 'IMPOSTO_VENDA' | 'IRPJ_CSLL' | 'FOLHA' | 'CUSTO' | 'DESPESA' | 'REC_FIN' | 'DESP_FIN' | 'OUTROS' | 'IGNORE';

export type LineType = 'ANALYTICAL' | 'SYNTHETIC';

export type LalurAdjustment = 'ADDITION' | 'EXCLUSION' | null;

export interface DRELineItem {
  description: string;
  value: number;
  isTotal: boolean;
  section: 'DRE' | 'BALANCO' | 'EBITDA';
  level: number;
  tag?: LineTag;
  lineType: LineType;
  useForCredit?: boolean; // Para PIS/COFINS Lucro Real (Binário)
  reformCreditRate?: number; // Para IBS/CBS Reforma (% específico de crédito 0-100)
  lalurAdjustment?: LalurAdjustment;
}

export interface CompositionItem {
  accountName: string;
  value: number;
}

export interface CompositionData {
  revenue: CompositionItem[];
  deductions: CompositionItem[];
  cogs: CompositionItem[];
  payroll: CompositionItem[];
  expenses: CompositionItem[];
  financialRevenues: CompositionItem[];
  financialExpenses: CompositionItem[];
}

export interface FinancialData {
  revenueAnnual: number;
  revenueCurrent: number;
  deductions: number;
  taxesOnSales: number;
  taxesIncome: number;
  payrollBase: number;
  expenses: number;
  financialRevenues: number;
  financialExpenses: number;
  cogs: number;
  profitBeforeTax: number;
  realCreditBase?: number;
  originalLines: DRELineItem[];
  composition: CompositionData;
}

export interface StoredFile {
  name: string;
  content: string;
  type: string;
}

export interface TaxRateConfig {
  pis: number;
  cofins: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
  ipi: number;
  iss: number;
  icms: number;
  rat: number;
  cpp: number;
  inssTerceiros: number;
  fgts: number;
  presuncaoIRPJ: number; 
  presuncaoCSLL: number;
  pisFinancial: number;
  cofinsFinancial: number;
}

// Configuração Específica da Reforma
export interface ReformConfig {
  ibsRate: number; // Imposto sobre Bens e Serviços (Estados/Municipios)
  cbsRate: number; // Contribuição sobre Bens e Serviços (Federal)
  selectiveTaxRate: number; // Imposto Seletivo (se aplicável)
  standardCreditRate: number; // Taxa padrão de crédito para despesas não especificadas
}

export interface TaxBreakdown {
  taxSales: number;
  taxIncome: number;
  taxPayroll: number;
  charges: number;
}

export interface TaxDetailedBreakdown {
  pis: number;
  cofins: number;
  irpj: number;
  irpjAdicional: number;
  csll: number;
  ipi: number;
  iss: number;
  icms: number;
  rat: number;
  cpp: number;
  inssTerceiros: number;
  fgts: number;
  simplesDAS: number;
  pisFinancial: number;
  cofinsFinancial: number;
  // Campos Reforma
  ibs?: number;
  cbs?: number;
  selectiveTax?: number;
}

export interface TaxSimulationResult {
  regime: 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'Reforma Tributária';
  totalTax: number;
  effectiveRate: number;
  breakdown: TaxBreakdown;
  detailed: TaxDetailedBreakdown;
  details: {
    label: string;
    value: number;
  }[];
  notes?: string[];
  isBlocked?: boolean;
}

// Resultado Comparativo da Reforma
export interface ReformSimulationResult extends TaxSimulationResult {
  totalCredits: number; // Total de créditos tomados
  debitIBS: number;
  debitCBS: number;
  creditIBS: number;
  creditCBS: number;
}

export interface SimplesTableRange {
  limit: number;
  aliquota: number;
  deducao: number;
}

export interface SimplesAnnex {
  name: string;
  ranges: SimplesTableRange[];
}

export interface SavedSimulation {
  id: string;
  ownerId?: string;
  name: string;
  lastModified: number;
  financialData: FinancialData;
  displayLines: DRELineItem[];
  activityType: ActivityType;
  taxCategory: 'ISS' | 'ICMS';
  presumidoConfig: TaxRateConfig;
  realConfig: TaxRateConfig;
  // Nova config salva
  reformConfig?: ReformConfig;
  regimeResult?: string;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
