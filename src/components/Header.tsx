import { NavLink, useNavigate } from 'react-router';
import useUserStore from '../store/userStore';
import './Header.css';
import { useState, useEffect, useRef } from 'react';
import { getAuthHeader } from '../utils/auth';


const colorPalette = [
	'#9B7EBD', '#82a6cf', '#E89B7E', '#6B9FA3', 
	'#C77B8A', '#8BA366', '#9B8EC4', '#D4A373', 
	'#7EB09B', '#B07E9E', '#7EA1B0', '#C9A77C'
];

const Header = () => {
	const username = useUserStore((s) => s.user?.username)
	const userColor = useUserStore((s) => s.user?.color) || '#9B7EBD'
	const logout = useUserStore((s) => s.logout)
	const setUser = useUserStore((s) => s.setUser)
	const [showDropdown, setShowDropdown] = useState(false)
	const [showColorPicker, setShowColorPicker] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)
	
	const navigate = useNavigate()

	// Stäng dropdown när man klickar utanför
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowDropdown(false)
			}
		}

		if (showDropdown) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showDropdown])

	const handleLogout = () => {
		logout()
		navigate('/')
	}

	const handleDeleteAccount = async () => {
		if (!confirm('Är du säker på att du vill radera ditt konto? Detta går inte att ångra.')) {
			return
		}

		const authHeader = getAuthHeader()
		if (!authHeader) return

		try {
			const response = await fetch('/api/user/delete', {
				method: 'DELETE',
				headers: {
					'Authorization': authHeader
				}
			})

			if (response.ok) {
				logout()
				navigate('/')
			} else {
				alert('Kunde inte radera kontot. Försök igen.')
			}
		} catch (error) {
			console.error('Failed to delete account:', error)
			alert('Något gick fel. Försök igen.')
		}
	}

	const handleColorChange = async (newColor: string) => {
		const authHeader = getAuthHeader()
		if (!authHeader) return

		try {
			const response = await fetch('/api/user/color', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': authHeader
				},
				body: JSON.stringify({ color: newColor })
			})

			if (response.ok) {
				setUser({ username: username!, color: newColor })
				setShowColorPicker(false)
				setShowDropdown(false)
			} else {
				alert('Kunde inte uppdatera färg. Försök igen.')
			}
		} catch (error) {
			console.error('Failed to update color:', error)
			alert('Något gick fel. Försök igen.')
		}
	}
	
return (
<header className='nav'>
	<div className='nav-content'>
		<h1 className='appName'>Lexi chatbot</h1>
		<nav className='links'>
			<NavLink to="/my-profile">Min Profil</NavLink>
			<NavLink to="/chat">Chat</NavLink>
			<div className="username-wrapper" ref={dropdownRef}>
				{username ? (
					<div className="username" onClick={() => setShowDropdown(!showDropdown)}>
						<h4 style={{ 
							color: userColor,
							textShadow: '0 0 4px #000, 0 0 4px #000'
						}}>{username}</h4>
						{showDropdown && (
							<div className="dropdown-menu">
								<button onClick={() => setShowColorPicker(!showColorPicker)}>
									{showColorPicker ? 'Stäng färgval' : 'Byt färg'}
								</button>
								{showColorPicker && (
									<div className="color-picker">
										{colorPalette.map(color => (
											<div
												key={color}
												className="color-option"
												style={{ 
													backgroundColor: color,
													border: color === userColor ? '3px solid #000' : '1px solid #ddd'
												}}
												onClick={() => handleColorChange(color)}
												title={color}
											/>
										))}
									</div>
								)}
								<button onClick={handleLogout}>Logga ut</button>
								<button onClick={handleDeleteAccount} className="delete-btn">Radera konto</button>
							</div>
						)}
					</div>
				) : (
					<h4 >{'Gäst'}</h4>
				)}
			</div>
		</nav>
	</div>
</header>
	);
};

export default Header;