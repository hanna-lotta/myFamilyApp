import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCamera } from '@fortawesome/free-solid-svg-icons';
import './PlusButton.css';

interface PlusButtonProps {
  disabled?: boolean;
  onAttachClick: () => void;
  onEmojiClick: () => void;
  onSendClick: () => void;          
  sendDisabled?: boolean; 
}

export const PlusButton: React.FC<PlusButtonProps> = ({ disabled, onAttachClick, onEmojiClick }) => {
  const [showExtraButtons, setShowExtraButtons] = useState(false);

  return (
    <div className='plus-button-box' >
      <button
        type="button"
        className="plus-button"
        onClick={() => setShowExtraButtons((v) => !v)}
        disabled={disabled}
        title="Visa fler val"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
      {showExtraButtons && (
        <div className='emoji-box'>
          <button
            onClick={() => { onAttachClick(); setShowExtraButtons(false); }}
            disabled={disabled}
            className="attach-button"
            title="Ta foto, välj från galleri eller klistra in bild"
          >
            <FontAwesomeIcon icon={faCamera} />
          </button>
          <button
            type="button"
            className="emoji-button"
            title="Infoga emoji"
            onClick={() => { onEmojiClick(); setShowExtraButtons(false); }}
          >
            <span role="img" aria-label="emoji">😊</span>
          </button>
        </div>
      )}
    </div>
  );
};
