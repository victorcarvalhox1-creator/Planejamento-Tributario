
import React, { useState, useRef, useEffect } from 'react';
import { parseFinancialDocument, FileInput } from '../services/geminiService';
import { FinancialData, StoredFile, DRELineItem } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: FinancialData, files: StoredFile[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Paste Event (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (loading) return; // Don't accept paste while processing

      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        const newFiles: File[] = [];
        let foundFile = false;

        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') {
            const file = items[i].getAsFile();
            if (file) {
              foundFile = true;
              // Rename generic pasted images to avoid duplicates/confusion
              if (file.name === 'image.png') {
                const timestamp = new Date().getTime();
                const newFile = new File([file], `print_colado_${timestamp}.png`, { type: file.type });
                newFiles.push(newFile);
              } else {
                newFiles.push(file);
              }
            }
          }
        }

        if (foundFile && newFiles.length > 0) {
          e.preventDefault();
          setSelectedFiles(prev => [...prev, ...newFiles]);
          setError(null);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [loading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
      // Reset input so selecting the same file again triggers change if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcessFiles = async () => {
    if (selectedFiles.length === 0) {
      setError("Por favor, selecione pelo menos um arquivo.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const processedFiles: FileInput[] = [];
      const filesForDisplay: StoredFile[] = [];

      // Process all files concurrently
      const filePromises = selectedFiles.map(file => {
        return new Promise<{ input: FileInput, display: StoredFile }>((resolve, reject) => {
          const lowerName = file.name.toLowerCase();
          
          // Fallback para MIME Types se o navegador não detectar
          let mimeType = file.type;
          if (!mimeType) {
             if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
             else if (lowerName.endsWith('.png')) mimeType = 'image/png';
             else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
             else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
             else if (lowerName.endsWith('.csv')) mimeType = 'text/csv';
             else if (lowerName.endsWith('.txt')) mimeType = 'text/plain';
          }

          // Handle Text/CSV
          if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
             const reader = new FileReader();
             reader.readAsText(file);
             reader.onload = () => {
                 const text = reader.result as string;
                 resolve({
                     input: { content: text, mimeType: 'text/plain' },
                     display: { name: file.name, content: '', type: 'text/plain' }
                 });
             };
             reader.onerror = () => reject(new Error(`Erro ao ler arquivo de texto ${file.name}`));
          }
          // Handle Excel
          else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = (evt) => {
              try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                // @ts-ignore
                const XLSX = (window as any).XLSX;
                if (!XLSX) throw new Error("Biblioteca Excel não carregada. Verifique sua conexão.");
                
                const workbook = XLSX.read(data, { type: 'array' });
                let fullText = "";
                workbook.SheetNames.forEach((sheetName: string) => {
                  const sheet = workbook.Sheets[sheetName];
                  const sheetText = XLSX.utils.sheet_to_csv(sheet);
                  if (sheetText && sheetText.trim().length > 0) {
                     fullText += `\n--- PLANILHA: ${sheetName} ---\n${sheetText}`;
                  }
                });

                // Se o texto estiver vazio, provavelmente é um Excel com imagem (print) colada dentro
                if (!fullText.trim()) {
                   throw new Error(`O arquivo Excel "${file.name}" parece não conter dados nas células (está vazio). Se ele contém uma imagem/print da DRE, por favor salve como PDF ou Imagem e tente novamente.`);
                }
                
                resolve({ 
                  input: { content: fullText, mimeType: 'text/plain' },
                  display: { name: file.name, content: '', type: 'application/vnd.ms-excel' } 
                });
              } catch (err) { reject(err); }
            };
            reader.onerror = () => reject(new Error(`Erro ao ler ${file.name}`));
          } 
          // Handle Images/PDF
          else {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
              const result = reader.result as string;
              // Extract base64 part
              const base64 = result.split(',')[1]; 
              
              if (!mimeType) {
                 reject(new Error(`Tipo de arquivo desconhecido para: ${file.name}. Tente converter para PDF ou PNG.`));
                 return;
              }

              resolve({ 
                input: { content: base64, mimeType: mimeType },
                display: { name: file.name, content: result, type: mimeType }
              });
            };
            reader.onerror = () => reject(new Error(`Erro ao ler ${file.name}`));
          }
        });
      });

      const results = await Promise.all(filePromises);
      
      results.forEach(r => {
        processedFiles.push(r.input);
        filesForDisplay.push(r.display);
      });

      // Send to AI
      const extractedData = await parseFinancialDocument(processedFiles);
      onDataLoaded(extractedData, filesForDisplay);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao processar arquivos. Verifique se são válidos e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white p-8 rounded-xl shadow-md border border-gray-200">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800">Importar Dados Financeiros</h2>
        <p className="text-gray-500 mt-2">
          Carregue a imagem do <strong>DRE</strong> e do <strong>Balancete</strong> (PDF, Excel, Imagem ou Texto).
        </p>
      </div>

      {/* File Drop Area */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors relative mb-6">
        <input 
          type="file" 
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,application/pdf,.xlsx,.xls,.csv,.txt"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={loading}
        />
        <div className="flex flex-col items-center">
          <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-700 font-medium">Adicionar Documentos</p>
          <p className="text-sm text-gray-400 mt-1">Arraste, clique ou <strong>cole (Ctrl+V)</strong> imagens/arquivos</p>
          <p className="text-xs text-gray-300 mt-2">Suporta: PDF, Excel, CSV, Texto, PNG, JPG</p>
        </div>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Arquivos Selecionados ({selectedFiles.length})</h4>
          <ul className="space-y-2">
            {selectedFiles.map((file, index) => (
              <li key={index} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 shadow-sm text-sm">
                <div className="flex items-center truncate mr-2">
                  <svg className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate text-gray-700">{file.name}</span>
                </div>
                <button 
                  onClick={() => removeFile(index)}
                  disabled={loading}
                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">
          {error}
        </div>
      )}
      
      {/* Action Button */}
      <div className="flex flex-col space-y-4">
        <button
          onClick={handleProcessFiles}
          disabled={loading || selectedFiles.length === 0}
          className={`w-full py-3 px-4 rounded-lg font-bold text-white shadow transition-all ${
            loading || selectedFiles.length === 0
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processando e Analisando...
            </span>
          ) : (
            'Processar Arquivos com IA'
          )}
        </button>
      </div>
    </div>
  );
};

export default FileUpload;