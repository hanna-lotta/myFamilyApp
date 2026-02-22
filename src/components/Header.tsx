import { NavLink, useNavigate } from 'react-router';
import useUserStore from '../store/userStore';
import './Header.css';
import { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons';
import useClickOutside from '../hooks/useClickOutside.ts';

const colorPalette = [
  '#9B7EBD', '#82a6cf', '#E89B7E', '#6B9FA3',
  '#C77B8A', '#8BA366', '#9B8EC4', '#D4A373',
  '#7EB09B', '#B07E9E', '#7EA1B0', '#C9A77C'
];

const Header = () => {
  const username = useUserStore((s) => s.user?.username);
  const userColor = useUserStore((s) => s.user?.color) || '#9B7EBD';
  const logout = useUserStore((s) => s.logout);
  const setUser = useUserStore((s) => s.setUser);
  
  const navigate = useNavigate();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const [isDesktopColorPickerOpen, setIsDesktopColorPickerOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  
  const handleLogout = () => {
    logout();
    navigate('/');
  };
  
  const handleColorChange = async (newColor: string) => {
    if (!username) return;
    
    const token = localStorage.getItem('jwt');
    if (!token) return;
    
    try {
      const response = await fetch('/api/user/color', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ color: newColor })
      });
      
      if (response.ok) {
        setUser({ username, color: newColor });
        setShowColorPicker(false);
        setIsDesktopColorPickerOpen(false);
        setIsDesktopMenuOpen(false);
      } else {
        alert('Kunde inte uppdatera farg. Forsok igen.');
      }
    } catch (error) {
      console.error(error);
      alert('Nagot gick fel. Forsok igen.');
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Ar du saker pa att du vill radera ditt konto? Detta gar inte att angra.')) {
      return;
    }

    const token = localStorage.getItem('jwt');
    if (!token) return;

    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        logout();
        navigate('/');
      } else {
        alert('Kunde inte radera kontot. Forsok igen.');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Nagot gick fel. Forsok igen.');
    }
  };
  
  const handleOpen = () => {
    setIsProfileMenuOpen(false);
    setShowColorPicker(false);
    setIsMenuVisible(true);
    setTimeout(() => setIsMenuOpen(true), 10);
  };
  
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsMenuOpen(false);
      setIsClosing(false);
      setIsMenuVisible(false);
      setIsProfileMenuOpen(false);
      setShowColorPicker(false);
    }, 500);
  };
  //klicka utanför meny
  useClickOutside(menuRef, () => {
    if (isMenuOpen && !isClosing) {
      handleClose();
    }
  }, isMenuVisible);

  useClickOutside(desktopMenuRef, () => {
    if (isDesktopMenuOpen) {
      setIsDesktopMenuOpen(false);
      setIsDesktopColorPickerOpen(false);
    }
  }, isDesktopMenuOpen);
  
  return (
    <header className="nav">
    <div className="nav-content">
    <h1 className="appName" onClick={() => navigate("/")}>
    Lexi chatbot
    </h1>

    <nav className="links">
    <NavLink to="/my-profile"> Profil</NavLink>
    <NavLink to="/chat">Chat</NavLink>
    <div className="username-wrapper" ref={desktopMenuRef}>
      {username ? (
        <div
          className="username"
          onClick={() => setIsDesktopMenuOpen((prev) => !prev)}
        >
          <h4 style={{
            color: userColor,
            textShadow: '0 0 4px #000, 0 0 4px #000'
          }}>{username}</h4>
        </div>
      ) : (
        <h4>Gäst</h4>
      )}

      {username && isDesktopMenuOpen && (
        <div className="desktop-dropdown">
          <div
            className="dropdown-item"
            onClick={() => {
              navigate("/my-profile");
              setIsDesktopMenuOpen(false);
              setIsDesktopColorPickerOpen(false);
            }}
          >
            Profil
          </div>
          <div
            className="dropdown-item"
            onClick={() => setIsDesktopColorPickerOpen((prev) => !prev)}
          >
            {isDesktopColorPickerOpen ? 'Stang fargval' : 'Byt farg'}
          </div>

          {isDesktopColorPickerOpen && (
            <div className="color-picker">
              {colorPalette.map((color) => (
                <div
                  key={color}
                  className="color-option"
                  style={{
                    backgroundColor: color,
                    border: color === userColor ? '3px solid #000' : '1px solid #ddd'
                  }}
                  onClick={() => {
                    void handleColorChange(color);
                    setIsDesktopColorPickerOpen(false);
                    setIsDesktopMenuOpen(false);
                  }}
                  title={color}
                />
              ))}
            </div>
          )}

          <div
            className="dropdown-item"
            onClick={() => {
              logout();
              navigate('/');
              setIsDesktopMenuOpen(false);
              setIsDesktopColorPickerOpen(false);
            }}
          >
            Logga ut
          </div>
          <div
            className="dropdown-item delete-btn"
            onClick={() => {
              void handleDeleteAccount();
              setIsDesktopMenuOpen(false);
              setIsDesktopColorPickerOpen(false);
            }}
          >
            Radera konto
          </div>
        </div>
      )}
    </div>
    </nav>

    <FontAwesomeIcon
    icon={isMenuOpen || isClosing ? faXmark : faBars}
    className="menu-icon"
    onClick={() => {
      if (isClosing) return;
      isMenuOpen ? handleClose() : handleOpen();
    }}
    />
    
    {isMenuVisible && (
      <div
      ref={menuRef}
      className={`dropdown-menu ${
        isClosing ? "hide" : isMenuOpen ? "show" : ""
      }`}
      >
      <div className="dropdown-close-row">
      <button
      type="button"
      className="dropdown-close-btn"
      onClick={handleClose}
      aria-label="Stäng meny"
      >
      <FontAwesomeIcon icon={faXmark} className="dropdown-close-icon" />
      </button>
      </div>
      
      <div className="dropdown-container">
      
      <div
      className="dropdown-item"
      onClick={() => {
        navigate("/chat");
        handleClose();
      }}
      >
      Chat
      </div>

      </div>
      
      <div className="dropdown-bottom">
      {username ? (
        <>
        <div className="dropdown-item dropdown-profile">
        <button
        type="button"
        className="dropdown-profile-btn"
        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
        aria-expanded={isProfileMenuOpen}
        >
        {username}
        </button>
        </div>
        
        <div className={`profile-buttons ${isProfileMenuOpen ? 'show' : ''}`}>
        <div
        id="logout-btn"
        onClick={() => {
          logout();
          navigate("/");
          handleClose();
        }}
        >
        Logga ut
        </div>
        
        <div
        className="dropdown-item"
        onClick={() => {
          navigate("/my-profile");
          handleClose();
        }}
        >
        Profil
        </div>
      
        </div>
        <div
        className="dropdown-item"
        onClick={() => setShowColorPicker((prev) => !prev)}
        >
        {showColorPicker ? 'Stang fargval' : 'Byt farg'}
        </div>

        {showColorPicker && (
          <div className="color-picker">
            {colorPalette.map((color) => (
              <div
                key={color}
                className="color-option"
                style={{
                  backgroundColor: color,
                  border: color === userColor ? '3px solid #000' : '1px solid #ddd'
                }}
                onClick={() => {
                  void handleColorChange(color);
                  setShowColorPicker(false);
                  handleClose();
                }}
                title={color}
              />
            ))}
          </div>
        )}
        </>
      ) : (
        <div
        id="login-btn"
        onClick={() => {
          navigate("/");
          handleClose();
        }}
        >
        Logga in
        </div>
      )}
      </div>
      </div>
    )}
    </div>
    </header>
  );
};

export default Header;