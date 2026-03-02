import { useState } from 'react';
import Tesseract from 'tesseract.js';

export function useOcr() {
  const [ocrText, setOcrText] = useState('');
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [showOcrEditor, setShowOcrEditor] = useState(false);

  // OCR-funktion med Tesseract.js
  const performOCR = async (imageFile: File) => {
    setIsOcrProcessing(true);
    setShowOcrEditor(false);
    setOcrText('');

    try {
      const imageUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(imageFile);
      });

      // Använd Tesseract.js för att extrahera text
      const result = await Tesseract.recognize(
        imageUrl,
        'swe+eng', // Svenska och engelska
        {
          logger: (m) => console.log('OCR progress:', m.status, m.progress),
        }
      );

      const extractedText = result.data.text;
      setOcrText(extractedText);
      setShowOcrEditor(true);
      setIsOcrProcessing(false);
    } catch (error) {
      console.error('OCR error:', error);
      setIsOcrProcessing(false);
      alert('Kunde inte extrahera text från bilden. Prova en annan bild.');
    }
  };

  return {
    ocrText,
    setOcrText,
    isOcrProcessing,
    setIsOcrProcessing,
    showOcrEditor,
    setShowOcrEditor,
    performOCR,
  };
}