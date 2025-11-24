
import { ActivityType, FinancialData, TaxSimulationResult, TaxRateConfig, ReformConfig, ReformSimulationResult, DRELineItem } from "../types";
import { ANEXO_I, ANEXO_II, ANEXO_III, ANEXO_IV, ANEXO_V, SIMPLES_LIMIT } from "./simplesTables";

export const formatBRL = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const THRESHOLD_ADICIONAL_IRPJ = 240000;

// --- SIMPLES NACIONAL ---
export const calculateSimples = (data: FinancialData, activity: ActivityType): TaxSimulationResult => {
  const emptyDetailed = {
      pis: 0, cofins: 0, irpj: 0, irpjAdicional: 0, csll: 0, ipi: 0, iss: 0, icms: 0, rat: 0, cpp: 0, inssTerceiros: 0, fgts: 0, simplesDAS: 0, pisFinancial: 0, cofinsFinancial: 0
  };

  if (data.revenueAnnual > SIMPLES_LIMIT) {
    return {
      regime: 'Simples Nacional',
      totalTax: 0,
      effectiveRate: 0,
      breakdown: { taxSales: 0, taxIncome: 0, taxPayroll: 0, charges: 0 },
      detailed: emptyDetailed,
      details: [],
      isBlocked: true,
      notes: [`Faturamento de ${formatBRL(data.revenueAnnual)} excede limite de ${formatBRL(SIMPLES_LIMIT)}.`]
    };
  }

  let annex = ANEXO_III;
  let factorR = 0;
  const CHARGES_LABOR_ONLY_PCT = 0.1911; 
  const payrollTotalEst = data.payrollBase * (1 + CHARGES_LABOR_ONLY_PCT); 

  switch (activity) {
    case ActivityType.COMERCIO: annex = ANEXO_I; break;
    case ActivityType.INDUSTRIA: annex = ANEXO_II; break;
    case ActivityType.SERVICO_ANEXO_III: annex = ANEXO_III; break;
    case ActivityType.SERVICO_ANEXO_IV: annex = ANEXO_IV; break;
    case ActivityType.SERVICO_ANEXO_V: 
      factorR = data.revenueAnnual > 0 ? payrollTotalEst / data.revenueAnnual : 0;
      annex = factorR >= 0.28 ? ANEXO_III : ANEXO_V; 
      break;
  }

  const rbt12 = data.revenueAnnual;
  const range = annex.ranges.find(r => rbt12 <= r.limit) || annex.ranges[annex.ranges.length - 1];
  
  let nominalRate = 0;
  if (rbt12 > 0) {
    nominalRate = ((rbt12 * (range.aliquota / 100)) - range.deducao) / rbt12;
  }
  
  const dasTax = data.revenueAnnual * nominalRate;
  let cppAmount = 0; 
  
  const fgtsAmount = data.payrollBase * 0.08; 

  if (activity === ActivityType.SERVICO_ANEXO_IV) {
     cppAmount = data.payrollBase * 0.278; 
  }

  const totalTax = dasTax + cppAmount + fgtsAmount;

  const detailed = {
      ...emptyDetailed,
      simplesDAS: dasTax,
      cpp: cppAmount,
      fgts: fgtsAmount
  };

  return {
    regime: 'Simples Nacional',
    totalTax: dasTax + cppAmount + fgtsAmount, 
    effectiveRate: ((dasTax + cppAmount + fgtsAmount) / data.revenueAnnual) * 100,
    breakdown: {
      taxSales: dasTax,
      taxIncome: 0,
      taxPayroll: cppAmount, 
      charges: fgtsAmount + cppAmount
    },
    detailed,
    details: [
      { label: `Anexo: ${annex.name}`, value: 0 },
      { label: `DAS (Guia Única)`, value: dasTax },
      { label: 'FGTS', value: fgtsAmount },
      activity === ActivityType.SERVICO_ANEXO_IV 
        ? { label: 'INSS Patronal (Externo ao DAS)', value: cppAmount } 
        : { label: 'INSS Patronal (Incluso no DAS)', value: 0 }
    ],
    notes: factorR >= 0.28 && activity === ActivityType.SERVICO_ANEXO_V 
      ? ['Enquadrado no Anexo III pelo Fator R'] 
      : []
  };
};

// --- LUCRO PRESUMIDO ---
export const calculatePresumido = (
  data: FinancialData, 
  activity: ActivityType, 
  config: TaxRateConfig
): TaxSimulationResult => {
  const fgtsRate = config.fgts / 100;
  
  const cppVal = data.payrollBase * (config.cpp / 100);
  const ratVal = data.payrollBase * (config.rat / 100);
  const terceirosVal = data.payrollBase * (config.inssTerceiros / 100);
  const fgtsVal = data.payrollBase * fgtsRate;
  
  const cppAmount = cppVal + ratVal + terceirosVal;
  const chargesAmount = cppAmount + fgtsVal;

  const isComercioIndustria = activity === ActivityType.COMERCIO || activity === ActivityType.INDUSTRIA;
  const calculationBase = data.revenueAnnual;

  const percentualPresuncaoIRPJ = config.presuncaoIRPJ / 100;
  const percentualPresuncaoCSLL = config.presuncaoCSLL / 100;

  const baseIRPJ = (calculationBase * percentualPresuncaoIRPJ) + data.financialRevenues;
  const baseCSLL = (calculationBase * percentualPresuncaoCSLL) + data.financialRevenues;

  const irpjBasico = baseIRPJ * (config.irpj / 100);
  const irpjAdicional = Math.max(0, baseIRPJ - THRESHOLD_ADICIONAL_IRPJ) * (config.irpjAdicional / 100);
  const totalIRPJ = irpjBasico + irpjAdicional;
  const totalCSLL = baseCSLL * (config.csll / 100);

  const pis = calculationBase * (config.pis / 100);
  const cofins = calculationBase * (config.cofins / 100);
  const ipi = calculationBase * (config.ipi / 100);
  
  const iss = !isComercioIndustria ? calculationBase * (config.iss / 100) : 0;
  const icms = isComercioIndustria ? calculationBase * (config.icms / 100) : 0;

  const totalSalesTax = pis + cofins + iss + icms + ipi;
  const totalTax = totalIRPJ + totalCSLL + totalSalesTax + cppAmount + fgtsVal;

  const detailed = {
    pis,
    cofins,
    irpj: irpjBasico,
    irpjAdicional,
    csll: totalCSLL,
    ipi,
    iss,
    icms,
    cpp: cppVal,
    rat: ratVal,
    inssTerceiros: terceirosVal,
    fgts: fgtsVal,
    simplesDAS: 0,
    pisFinancial: 0,
    cofinsFinancial: 0
  };

  return {
    regime: 'Lucro Presumido',
    totalTax,
    effectiveRate: (totalTax / data.revenueAnnual) * 100,
    breakdown: {
      taxSales: totalSalesTax,
      taxIncome: totalIRPJ + totalCSLL,
      taxPayroll: cppAmount,
      charges: chargesAmount
    },
    detailed,
    details: [
      { label: 'PIS/COFINS', value: pis + cofins },
      { label: 'IRPJ/CSLL', value: totalIRPJ + totalCSLL },
      { label: 'ISS/ICMS/IPI', value: iss + icms + ipi },
      { label: 'INSS Patronal', value: cppAmount },
      { label: 'FGTS', value: fgtsVal }
    ]
  };
};

// --- LUCRO REAL ---
export const calculateReal = (
  data: FinancialData, 
  activity: ActivityType, 
  config: TaxRateConfig,
  lalurAdjustments: { additions: number, exclusions: number } = { additions: 0, exclusions: 0 }
): TaxSimulationResult => {
  const isComercioIndustria = activity === ActivityType.COMERCIO || activity === ActivityType.INDUSTRIA;
  
  const fgtsRate = config.fgts / 100;

  const cppVal = data.payrollBase * (config.cpp / 100);
  const ratVal = data.payrollBase * (config.rat / 100);
  const terceirosVal = data.payrollBase * (config.inssTerceiros / 100);
  const fgtsVal = data.payrollBase * fgtsRate;

  const cppAmount = cppVal + ratVal + terceirosVal;
  const chargesAmount = cppAmount + fgtsVal;

  const pisRate = config.pis / 100;
  const cofinsRate = config.cofins / 100;
  
  const revenueBase = Math.max(0, data.revenueAnnual - data.deductions);
  const debitoPis = revenueBase * pisRate;
  const debitoCofins = revenueBase * cofinsRate;
  
  let creditBase = 0;
  if (data.realCreditBase !== undefined) {
    creditBase = data.realCreditBase;
  } else {
    if (isComercioIndustria) {
      creditBase = data.cogs; 
    } else {
      creditBase = data.expenses * 0.20; 
    }
  }
  
  const creditoPis = creditBase * pisRate;
  const creditoCofins = creditBase * cofinsRate;

  const pisPayable = Math.max(0, debitoPis - creditoPis);
  const cofinsPayable = Math.max(0, debitoCofins - creditoCofins);

  const pisFinRate = (config.pisFinancial || 0) / 100;
  const cofinsFinRate = (config.cofinsFinancial || 0) / 100;
  const pisFinancial = data.financialRevenues * pisFinRate;
  const cofinsFinancial = data.financialRevenues * cofinsFinRate;
  const totalFinancialTaxes = pisFinancial + cofinsFinancial;

  const ipi = data.revenueAnnual * (config.ipi / 100);
  const iss = !isComercioIndustria ? data.revenueAnnual * (config.iss / 100) : 0;
  const icms = isComercioIndustria ? data.revenueAnnual * (config.icms / 100) : 0;

  const totalSalesTax = pisPayable + cofinsPayable + iss + icms + ipi;

  const netRevenue = data.revenueAnnual - data.deductions - totalSalesTax;
  const totalDeductibleExpenses = data.cogs + data.expenses + data.payrollBase + chargesAmount;
  const operationalResult = netRevenue - totalDeductibleExpenses;
  
  const financialResult = data.financialRevenues - totalFinancialTaxes - data.financialExpenses;
  const profitBeforeTax = operationalResult + financialResult;

  const taxableIncome = Math.max(0, profitBeforeTax + lalurAdjustments.additions - lalurAdjustments.exclusions);

  const irpjBasico = taxableIncome * (config.irpj / 100);
  const irpjAdicional = Math.max(0, taxableIncome - THRESHOLD_ADICIONAL_IRPJ) * (config.irpjAdicional / 100);
  const totalIRPJ = irpjBasico + irpjAdicional;
  const totalCSLL = taxableIncome * (config.csll / 100);

  const totalTax = totalIRPJ + totalCSLL + totalSalesTax + totalFinancialTaxes + cppAmount + fgtsVal;

  const detailed = {
    pis: pisPayable,
    cofins: cofinsPayable,
    irpj: irpjBasico,
    irpjAdicional,
    csll: totalCSLL,
    ipi,
    iss,
    icms,
    cpp: cppVal,
    rat: ratVal,
    inssTerceiros: terceirosVal,
    fgts: fgtsVal,
    simplesDAS: 0,
    pisFinancial,
    cofinsFinancial
  };

  return {
    regime: 'Lucro Real',
    totalTax,
    effectiveRate: (totalTax / data.revenueAnnual) * 100,
    breakdown: {
      taxSales: totalSalesTax, 
      taxIncome: totalIRPJ + totalCSLL,
      taxPayroll: cppAmount,
      charges: chargesAmount
    },
    detailed,
    details: [
      { label: 'PIS/COFINS (Liq)', value: pisPayable + cofinsPayable },
      { label: 'PIS/COFINS (Fin)', value: totalFinancialTaxes },
      { label: 'IRPJ/CSLL', value: totalIRPJ + totalCSLL },
      { label: 'ISS/ICMS', value: iss + icms },
      { label: 'INSS Patronal', value: cppAmount },
      { label: 'FGTS', value: fgtsVal }
    ],
    notes: [
      ...(taxableIncome <= 0 ? ['Prejuízo Fiscal projetado'] : []),
      ...(lalurAdjustments.additions > 0 ? [`Adições LALUR: +${formatBRL(lalurAdjustments.additions)}`] : []),
      ...(lalurAdjustments.exclusions > 0 ? [`Exclusões LALUR: -${formatBRL(lalurAdjustments.exclusions)}`] : []),
    ]
  };
};

// --- REFORMA TRIBUTÁRIA (IVA DUAL - IBS + CBS) ---
export const calculateReform = (
  data: FinancialData,
  displayLines: DRELineItem[],
  reformConfig: ReformConfig,
  currentBestScenario: TaxSimulationResult
): ReformSimulationResult => {
  // 1. Débitos: Incidência sobre Receita Bruta (Deduzindo cancelamentos se houver)
  // A Reforma incide sobre o valor da operação. Assumindo RevenueAnnual - Deductions
  const revenueBase = Math.max(0, data.revenueAnnual - data.deductions);
  
  const ibsDebit = revenueBase * (reformConfig.ibsRate / 100);
  const cbsDebit = revenueBase * (reformConfig.cbsRate / 100);
  const selectiveTax = revenueBase * (reformConfig.selectiveTaxRate / 100);

  // 2. Créditos: Sistema de crédito financeiro amplo
  // Itera sobre as linhas de CUSTO e DESPESA para verificar se possuem taxa de crédito configurada
  let ibsCredit = 0;
  let cbsCredit = 0;

  displayLines.forEach(line => {
    if (line.lineType === 'ANALYTICAL' && (line.tag === 'CUSTO' || line.tag === 'DESPESA')) {
      const creditRate = line.reformCreditRate !== undefined ? line.reformCreditRate : 0;
      
      if (creditRate > 0) {
        // Assume que a proporção IBS/CBS é mantida na taxa de crédito ou usa a taxa cheia se user inputar 100%
        // Para simplificar: O input do usuário (reformCreditRate) é a % da despesa que DÁ DIREITO a crédito.
        // O valor do crédito é Base * Alíquota do Imposto.
        
        const eligibleBase = Math.abs(line.value) * (creditRate / 100);
        
        ibsCredit += eligibleBase * (reformConfig.ibsRate / 100);
        cbsCredit += eligibleBase * (reformConfig.cbsRate / 100);
      }
    }
  });

  const ibsPayable = Math.max(0, ibsDebit - ibsCredit);
  const cbsPayable = Math.max(0, cbsDebit - cbsCredit);
  const totalIVA = ibsPayable + cbsPayable + selectiveTax;

  // 3. IRPJ/CSLL
  // Assume-se que a empresa estará no regime não cumulativo (similar ao Lucro Real) ou mantem o IRPJ do melhor cenário atual para comparação
  // Para ser conservador e comparável, mantemos o IRPJ/CSLL calculado no Lucro Real (pois a reforma foca no consumo)
  // Se o melhor cenário for Simples, a comparação fica difícil, então forçamos a lógica do Real para IRPJ
  const taxIncome = currentBestScenario.breakdown.taxIncome; 

  // 4. Folha de Pagamento
  // A Desoneração da Folha pode acabar, mas por enquanto mantemos a carga atual de Folha do cenário
  const taxPayroll = currentBestScenario.breakdown.taxPayroll;
  const charges = currentBestScenario.breakdown.charges;

  const totalTax = totalIVA + taxIncome + taxPayroll + charges; // Note: Charges includes FGTS/CPP part

  const detailed = {
    pis: 0, cofins: 0, irpj: 0, irpjAdicional: 0, csll: 0, ipi: 0, iss: 0, icms: 0, 
    rat: 0, cpp: 0, inssTerceiros: 0, fgts: 0, simplesDAS: 0, pisFinancial: 0, cofinsFinancial: 0,
    ibs: ibsPayable,
    cbs: cbsPayable,
    selectiveTax
  };

  return {
    regime: 'Reforma Tributária',
    totalTax,
    effectiveRate: (totalTax / data.revenueAnnual) * 100,
    breakdown: {
      taxSales: totalIVA,
      taxIncome: taxIncome,
      taxPayroll: taxPayroll,
      charges: charges
    },
    detailed,
    totalCredits: ibsCredit + cbsCredit,
    debitIBS: ibsDebit,
    debitCBS: cbsDebit,
    creditIBS: ibsCredit,
    creditCBS: cbsCredit,
    details: [
      { label: 'IBS a Pagar', value: ibsPayable },
      { label: 'CBS a Pagar', value: cbsPayable },
      { label: 'Imposto Seletivo', value: selectiveTax },
      { label: 'Créditos Tomados', value: ibsCredit + cbsCredit },
      { label: 'IRPJ/CSLL (Estimado)', value: taxIncome }
    ]
  };
};
