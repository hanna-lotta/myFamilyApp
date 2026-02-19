import React from 'react';

type SpeakButtonProps = {
  text: string;
};

export const SpeakButton: React.FC<SpeakButtonProps> = ({ text }) => {
  const speak = () => {

    //avbryt om webbläsaren inte stöder text till tal
    if (!('speechSynthesis' in window)) return;

    //skapar ett “uppläsnings‑objekt” med texten.
    const utter = new SpeechSynthesisUtterance(text);

    //språk, hastighet, tonläge.
    utter.lang = 'sv-SE';
    utter.rate = 1;
    utter.pitch = 1;

    //startar uppläsningen.
    window.speechSynthesis.speak(utter);
  };

  return (
    <button
    id='speak-button' 
    onClick={speak} title="Läs upp">
      🔊
    </button>
  );
};