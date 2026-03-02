import { NavLink, useNavigate } from 'react-router';
import useUserStore from '../store/userStore';
import './Header.css';
import { useState, useRef, useEffect } from 'react';
import { getAuthHeader, decodeJwt } from '../utils/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';


const Header = () => {
  const username = useUserStore((s) => s.user?.username);
  const userColor = useUserStore((s) => s.user?.color) || '#9B7EBD';
  const logout = useUserStore((s) => s.logout);


  const navigate = useNavigate();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);


  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Kolla användarroll
  const authHeader = getAuthHeader();
  const userRole = authHeader ? decodeJwt(authHeader.replace('Bearer: ', ''))?.role : null;
  const isParent = userRole === 'parent';

  // Klick utanför dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
     
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Är du säker på att du vill radera ditt konto? Detta går inte att ångra.')) return;
    const authHeader = getAuthHeader();
    if (!authHeader) return;

    try {
      const response = await fetch('/api/user/delete', {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });
      if (response.ok) {
        logout();
        navigate('/');
      } else {
        alert('Kunde inte radera kontot. Försök igen.');
      }
    } catch (error) {
      console.error(error);
      alert('Något gick fel. Försök igen.');
    }
  };


  return (
    <header className="nav">
      <div className="nav-content">
        <h1 className="appName" onClick={() => navigate('/')}>
          Lexi chatbot
        </h1>

        {/* Desktop länkar */}
        <nav className="links desktop-links">
          <NavLink to="/my-profile">Profil</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          {username && (
            <div className="username-wrapper" ref={dropdownRef}>
              <div className="username" onClick={() => setShowDropdown(!showDropdown)}>
                <h4 style={{ color: userColor, textShadow: '0 0 4px #000, 0 0 4px #000' }}>
                  {username}
                </h4>
              </div>

              {showDropdown && (
                <div className="dropdown-menu">
                  {isParent && (
									<>
										<button onClick={() => {
											navigate('/parent');
											setShowDropdown(false);
										}}>
											Föräldraöversikt
										</button>
	                    <button onClick={() => {
	                      navigate('/family');
	                      setShowDropdown(false);
	                    }}>
	                      Bjud in familj
	                    </button>
									</>
                  )}
                
                  
                  <button onClick={handleLogout}>Logga ut</button>
                  <button onClick={handleDeleteAccount} className="delete-btn">Radera konto</button>
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Hamburger icon for mobile */}
        <FontAwesomeIcon
          icon={faBars}
          className="menu-icon"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        />

      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="dropdown-menu mobile-menu" ref={menuRef}>
          <NavLink to="/my-profile" onClick={() => setIsMenuOpen(false)}>Profil</NavLink>
          <NavLink to="/chat" onClick={() => setIsMenuOpen(false)}>Chat</NavLink>

          {username && (
            <>
              {isParent && (
                <button onClick={() => {
                  navigate('/family');
                  setIsMenuOpen(false);
                }}>
                  Bjud in familj
                </button>
              )}
             
              <button onClick={handleLogout}>Logga ut</button>
              <button onClick={handleDeleteAccount} className="delete-btn">Radera konto</button>
            </>
          )}
          {!username && (
            <NavLink to="/" onClick={() => setIsMenuOpen(false)}>Logga in</NavLink>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;