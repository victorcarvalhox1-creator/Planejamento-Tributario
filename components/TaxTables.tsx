import React, { useState } from 'react';
import { ALL_ANEXOS } from '../utils/simplesTables';
import { formatBRL } from '../utils/calculations';

const TaxTables: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-bold text-gray-800">Tabelas do Simples Nacional (2024/2025)</h3>
        <p className="text-sm text-gray-500">Limites e Alíquotas Nominais</p>
      </div>
      
      <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-hide">
        {ALL_ANEXOS.map((anexo, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === index 
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {anexo.name}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-x-auto">
        <table className="min-w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
            <tr>
              <th className="px-4 py-3">Faixa</th>
              <th className="px-4 py-3">Receita Bruta em 12 Meses (R$)</th>
              <th className="px-4 py-3">Alíquota Nominal</th>
              <th className="px-4 py-3">Valor a Deduzir (R$)</th>
            </tr>
          </thead>
          <tbody>
            {ALL_ANEXOS[activeTab].ranges.map((range, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{idx + 1}ª Faixa</td>
                <td className="px-4 py-3">
                   {idx === 0 ? 'Até ' : `De ${formatBRL(ALL_ANEXOS[activeTab].ranges[idx-1].limit + 0.01)} até `}
                   {formatBRL(range.limit)}
                </td>
                <td className="px-4 py-3 text-blue-600 font-bold">{range.aliquota}%</td>
                <td className="px-4 py-3">{formatBRL(range.deducao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 text-xs rounded">
          <strong>Atenção:</strong> A partir de R$ 3.600.000,00 o ISS e ICMS são recolhidos separadamente (Sublimite), e acima de R$ 4.800.000,00 a empresa é excluída do regime.
        </div>
      </div>
    </div>
  );
};

export default TaxTables;