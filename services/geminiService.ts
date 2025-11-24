
import { GoogleGenAI } from "@google/genai";
import { FinancialData } from "../types";

const systemInstruction = `
Você é um auditor contábil sênior (CPA) especializado em Planejamento Tributário Brasileiro.
Sua tarefa é extrair dados de **Balancetes de Verificação**, **DREs** ou Relatórios Contábeis para montar um Planejamento Tributário.

**OBJETIVO:**
1. Reconstruir a estrutura de contas (DRE e Balanço) em uma lista plana ('originalLines').
2. Calcular variáveis chaves (Receita, Folha, Despesas) somando apenas contas analíticas.

### 1. REGRAS DE EXTRAÇÃO
*   Use SEMPRE o **Saldo Atual** ou **Saldo Final** do período.
*   Ignore colunas de "Débito" e "Crédito" se houver uma coluna de Saldo Resultante.
*   Converta valores negativos (credoras) para POSITIVO ABSOLUTO.
*   **Hierarquia**:
    *   **SYNTHETIC**: Contas de grupo/subtotal (Ex: "1. ATIVO", "3. RECEITA OPERACIONAL"). NÃO devem ser somadas.
    *   **ANALYTICAL**: Contas finais que recebem lançamentos. DEVEM ser somadas.

### 2. CLASSIFICAÇÃO AUTOMÁTICA (Campo 'tag')
Para cada linha 'ANALYTICAL', tente inferir a tag:
*   'RECEITA': Vendas, Serviços Prestados, Receita Bruta.
*   'DEDUCAO': Devoluções de Vendas, Cancelamentos, Abatimentos, Descontos Incondicionais.
*   'IMPOSTO_VENDA': Impostos incidentes sobre faturamento (ICMS, ISS, PIS, COFINS, SIMPLES NACIONAL).
*   'IRPJ_CSLL': Imposto de Renda Pessoa Jurídica e Contribuição Social sobre Lucro Líquido (Correntes).
*   'FOLHA': Salários, Pró-Labore, Férias, 13º, Ordenados (SEM encargos patronais/INSS se possível, separar em DESPESA se não for salário base).
*   'CUSTO': CMV, CSP, Materiais aplicados.
*   'REC_FIN': Rendimentos de aplicações, Juros recebidos, Descontos obtidos.
*   'DESP_FIN': Juros pagos, Tarifas bancárias, IOF, Multas.
*   'DESPESA': Aluguel, Energia, Água, Material de Uso, Honorários, etc.

### 3. OUTPUT JSON
Retorne APENAS um objeto JSON. Não use markdown.
Estrutura:
{
  "revenueAnnual": number, // Soma de RECEITA (Analytical)
  "deductions": number,    // Soma de DEDUCAO (Analytical)
  "taxesOnSales": number,  // Soma de IMPOSTO_VENDA (Analytical)
  "taxesIncome": number,   // Soma de IRPJ_CSLL (Analytical)
  "payrollBase": number,   // Soma de FOLHA (Analytical)
  "cogs": number,          // Soma de CUSTO (Analytical)
  "expenses": number,      // Soma de DESPESA (Analytical)
  "financialRevenues": number, // Soma de REC_FIN (Analytical)
  "financialExpenses": number, // Soma de DESP_FIN (Analytical)
  "profitBeforeTax": number, // Lucro Contábil antes do IR/CSLL
  "originalLines": [
    {
      "description": string,
      "value": number,
      "isTotal": boolean, // true se for SYNTHETIC ou linha de total
      "section": "DRE" | "BALANCO" | "EBITDA",
      "level": number, // Indentação (0, 1, 2...)
      "lineType": "ANALYTICAL" | "SYNTHETIC",
      "tag": "RECEITA" | "DEDUCAO" | "IMPOSTO_VENDA" | "IRPJ_CSLL" | "FOLHA" | "CUSTO" | "DESPESA" | "REC_FIN" | "DESP_FIN" | "OUTROS"
    }
  ]
}
`;

export interface FileInput {
  content: string; // base64 or text string
  mimeType: string;
}

export const parseFinancialDocument = async (
  files: FileInput[]
): Promise<FinancialData> => {
  // Inicialização com o SDK novo @google/genai
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const parts: any[] = [];

  files.forEach((file, index) => {
    // Validar se há conteúdo
    if (!file.content) return;

    if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json') {
      parts.push({
        text: `DOCUMENTO #${index + 1} (Texto Extraído):\n\n${file.content}`
      });
    } else {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.content, 
        },
      });
    }
  });

  if (parts.length === 0) {
    throw new Error("Não foi possível ler o conteúdo dos arquivos enviados. Verifique se não estão corrompidos.");
  }

  // Adicionar prompt final
  parts.push({
    text: `Analise as imagens/textos fornecidos e extraia os dados para o JSON.`
  });

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.1 // Temperatura baixa para maior precisão em dados
      }
    });

    const jsonText = response.text;
    
    if (!jsonText) throw new Error("A IA não retornou dados válidos.");

    const data = JSON.parse(jsonText);

    return {
      revenueAnnual: Number(data.revenueAnnual) || 0,
      revenueCurrent: (Number(data.revenueAnnual) || 0) / 12,
      deductions: Number(data.deductions) || 0,
      taxesOnSales: Number(data.taxesOnSales) || 0,
      taxesIncome: Number(data.taxesIncome) || 0,
      payrollBase: Number(data.payrollBase) || 0,
      expenses: Number(data.expenses) || 0,
      financialRevenues: Number(data.financialRevenues) || 0,
      financialExpenses: Number(data.financialExpenses) || 0,
      cogs: Number(data.cogs) || 0,
      profitBeforeTax: Number(data.profitBeforeTax) || 0,
      originalLines: Array.isArray(data.originalLines) ? data.originalLines : [],
      composition: data.composition || {
        revenue: [], deductions: [], cogs: [], payroll: [], expenses: [], financialRevenues: [], financialExpenses: []
      }
    };

  } catch (error: any) {
    console.error("Error parsing financial document:", error);
    
    let msg = error.message || "Erro desconhecido.";
    // Tratamento de erros comuns da API
    if (msg.includes("400")) msg = "O arquivo enviado não é suportado ou está corrompido (Erro 400). Tente converter para PDF ou Imagem.";
    else if (msg.includes("429")) msg = "O sistema está sobrecarregado. Aguarde alguns segundos e tente novamente.";
    else if (msg.includes("500")) msg = "Erro interno no servidor de IA. Tente novamente.";
    
    throw new Error(`Falha na leitura inteligente: ${msg}`);
  }
};
