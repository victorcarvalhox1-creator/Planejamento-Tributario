import { SimplesAnnex } from "../types";

export const SIMPLES_LIMIT = 4800000;

// Dados vigentes 2024/2025
export const ANEXO_I: SimplesAnnex = {
  name: "Anexo I - Comércio",
  ranges: [
    { limit: 180000, aliquota: 4.0, deducao: 0 },
    { limit: 360000, aliquota: 7.3, deducao: 5940 },
    { limit: 720000, aliquota: 9.5, deducao: 13860 },
    { limit: 1800000, aliquota: 10.7, deducao: 22500 },
    { limit: 3600000, aliquota: 14.3, deducao: 87300 },
    { limit: 4800000, aliquota: 19.0, deducao: 378000 },
  ]
};

export const ANEXO_II: SimplesAnnex = {
  name: "Anexo II - Indústria",
  ranges: [
    { limit: 180000, aliquota: 4.5, deducao: 0 },
    { limit: 360000, aliquota: 7.8, deducao: 5940 },
    { limit: 720000, aliquota: 10.0, deducao: 13860 },
    { limit: 1800000, aliquota: 11.2, deducao: 22500 },
    { limit: 3600000, aliquota: 14.7, deducao: 85500 },
    { limit: 4800000, aliquota: 30.0, deducao: 720000 },
  ]
};

export const ANEXO_III: SimplesAnnex = {
  name: "Anexo III - Serviços (Geral)",
  ranges: [
    { limit: 180000, aliquota: 6.0, deducao: 0 },
    { limit: 360000, aliquota: 11.2, deducao: 9360 },
    { limit: 720000, aliquota: 13.5, deducao: 17640 },
    { limit: 1800000, aliquota: 16.0, deducao: 35640 },
    { limit: 3600000, aliquota: 21.0, deducao: 125640 },
    { limit: 4800000, aliquota: 33.0, deducao: 648000 },
  ]
};

export const ANEXO_IV: SimplesAnnex = {
  name: "Anexo IV - Serviços (Limpeza, Advocacia, Obras)",
  ranges: [
    { limit: 180000, aliquota: 4.5, deducao: 0 },
    { limit: 360000, aliquota: 9.0, deducao: 8100 },
    { limit: 720000, aliquota: 10.2, deducao: 12420 },
    { limit: 1800000, aliquota: 14.0, deducao: 39780 },
    { limit: 3600000, aliquota: 22.0, deducao: 183780 },
    { limit: 4800000, aliquota: 33.0, deducao: 828000 },
  ]
};

export const ANEXO_V: SimplesAnnex = {
  name: "Anexo V - Serviços (Intelectuais, Tecnologia)",
  ranges: [
    { limit: 180000, aliquota: 15.5, deducao: 0 },
    { limit: 360000, aliquota: 18.0, deducao: 4500 },
    { limit: 720000, aliquota: 19.5, deducao: 9900 },
    { limit: 1800000, aliquota: 20.5, deducao: 17100 },
    { limit: 3600000, aliquota: 23.0, deducao: 62100 },
    { limit: 4800000, aliquota: 30.5, deducao: 540000 },
  ]
};

export const ALL_ANEXOS = [ANEXO_I, ANEXO_II, ANEXO_III, ANEXO_IV, ANEXO_V];