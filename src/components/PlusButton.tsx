import React, { useState, useRef } from 'react';
import useClickOutside from '../hooks/useClickOutside';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCamera } from '@fortawesome/free-solid-svg-icons';
import './PlusButton.css';

// Props för PlusButton komponenten
interface PlusButtonProps {
  disabled?: boolean;
  onAttachClick: () => void;
  onEmojiClick: () => void;
  onSendClick?: () => void; 
  sendDisabled?: boolean;
  showEmojiPicker: boolean;   
  EmojiComponent: React.ReactNode; 
}

export const PlusButton: React.FC<PlusButtonProps> = ({ 
  disabled, 
  onAttachClick, 
  onEmojiClick,
  showEmojiPicker,
  EmojiComponent 
}) => {
  const [showExtraButtons, setShowExtraButtons] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Stäng emoji-picker vid klick utanför
  useClickOutside(emojiPickerRef, () => {
    if (showEmojiPicker) {
      onEmojiClick(); // Stänger genom att toggla showEmojiPicker
    }
  }, showEmojiPicker);

  return (
    <div className="plus-button-container">
      
      {showEmojiPicker && (
        <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
          {EmojiComponent}
        </div>
      )}

      <button
        type="button"
        className={`plus-button ${showExtraButtons ? 'active' : ''}`}
        onClick={() => setShowExtraButtons((v) => !v)}
        disabled={disabled}
        title="Visa fler val"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>

      {/* menyn med kamera och emojiikon */}
      {showExtraButtons && (
        <div className='emoji-box'>
          <button
            type="button"
            onClick={() => { 
              onAttachClick(); 
              setShowExtraButtons(false); 
            }}
            disabled={disabled}
            className="attach-button"
            title="Bifoga bild"
          >
            <FontAwesomeIcon icon={faCamera} />
          </button>
          
          <button
            type="button"
            className="emoji-trigger-button"
            title="Öppna väljare"
            onClick={() => {
              onEmojiClick(); // Denna triggar setShowEmojiPicker i ChatBot
              setShowExtraButtons(false); 
            }}
          >
            <span role="img" aria-label="emoji">😊</span>
          </button>
        </div>
      )}
    </div>
  );
};