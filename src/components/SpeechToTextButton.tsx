import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faCircleStop } from '@fortawesome/free-solid-svg-icons';

type SpeechToTextButtonProps = {

    //onResult tar emot texten när röstigenkänningen är klar
  onResult: (text: string) => void;
  lang?: string;  //språk
};

export const SpeechToTextButton: React.FC<SpeechToTextButtonProps> = ({
  onResult,
  lang = 'sv-SE'
}) => {
    //listening håller koll på om vi lyssnar.
  const [listening, setListening] = useState(false);

  //lagrar SpeechRecognition‑instansen så vi kan starta/stoppa den. 
  const recognitionRef = useRef<any>(null);

  //useEffect hämtar SpeechRecognition från webbläsaren
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      //om det inte finns stöd, sätt recognitionRef till null och avsluta.
    if (!SpeechRecognition) {
      recognitionRef.current = null;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang; //det språk vi lyssnar på
    recognition.interimResults = false; //bara färdiga resultat
    recognition.continuous = false; //stoppar automatiskt efter en fras.

    //när vi får ett resultat, skicka texten till onResult
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };
//när lyssning avslutas, onend sätter listening till false
    recognition.onend = () => {
      setListening(false);
    };
//onerror stoppar lyssningen genom att sätta listening till false.
    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [lang, onResult]);


  //Om vi lyssnar- stop, om vi inte lyssnar-start och uppdat. listening
  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  return (
    <button className="speech-button" onClick={toggleListening} title="Tala in text">
      {listening ? <FontAwesomeIcon icon={faCircleStop} /> : <FontAwesomeIcon icon={faMicrophone} />}
    </button>
  );
};