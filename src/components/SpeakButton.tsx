import React, { useEffect, useState } from 'react';

type SpeakButtonProps = {
  text: string;
};

export const SpeakButton: React.FC<SpeakButtonProps> = ({ text }) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speak = () => {

    //avbryt om webbläsaren inte stöder text till tal
    if (!('speechSynthesis' in window)) return;

    // Toggla för att stoppa uppläsningen
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // rensa kö/aktiv uppläsning så texten läses en gång
    window.speechSynthesis.cancel();

    //skapar ett “uppläsnings‑objekt” med texten.
    const utter = new SpeechSynthesisUtterance(text);

    //språk, hastighet, tonläge.
    utter.lang = 'sv-SE';
    utter.rate = 1;
    utter.pitch = 1;

    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);

    //startar uppläsningen.
    setIsSpeaking(true);
    window.speechSynthesis.speak(utter);
  };

  return (
    <button
    id='speak-button' 
    onClick={speak} title={isSpeaking ? 'Stoppa uppläsning' : 'Läs upp'}>
      {isSpeaking ? '⏹' : '🔊'}
    </button>
  );
};