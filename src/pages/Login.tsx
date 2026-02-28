import { useState } from 'react'
import '../App.css'
import './Login.css'
import { RegisterResponseSchema } from '../data/validation'
import { useNavigate } from 'react-router'
import { getAuthHeader } from '../utils/auth'
import useUserStore from '../store/userStore'


interface FormData {
	username: string
	password: string
	inviteCode?: string
}

const Login = () => {
	const [formData, setFormData] = useState<FormData>({username: '', password: ''})
	const [errors, setErrors] = useState<{username?: string, password?: string, general?: string}>({})
	
	const [touched, setTouched] = useState<{username: boolean, password: boolean}>({username: false, password: false}) 
	
	const [registerStep, setRegisterStep] = useState<'none' | 'accountCreated' | 'familySetup'>('none')
	const [inviteCode, setInviteCode] = useState<string>('')
	const [birthDate, setBirthDate] = useState('')
	const [childInvites, setChildInvites] = useState<Array<{code: string, birthDate: string}>>([])
	const [copiedCode, setCopiedCode] = useState<string | null>(null)
	
	const navigate = useNavigate();
	
	const setUser = useUserStore((s) => s.setUser) //hämtar setUser-funktionen från userStore, som vi kommer använda för att spara användarens data i global state efter lyckad login eller registrering. Detta gör att vi kan visa användarnamn och färg i headern och andra delar av appen utan att behöva hämta det från servern varje gång.
	
	const LS_KEY = 'jwt' //nyckel för att spara token i localstorage

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopiedCode(text);
		setTimeout(() => setCopiedCode(null), 2000);
	};
	
	const ValidateForm = () => {
		const newErrors: {username?: string; password?: string} = {}

		if (!formData.username) {
			newErrors.username = 'Avändarnamn krävs'
		} else if (formData.username.length < 3) {
			newErrors.username = 'Avändarnamn måste vara minst 3 tecken'
		}

		if (!formData.password) {
			newErrors.password = 'Lösenord krävs'
		} else if (formData.password.length < 6) {
			newErrors.password = 'Lösenord måste vara minst 6 tecken'
		}
		setErrors(newErrors) // Uppdatera errors state med de nya valideringsfelen. Detta kommer att trigga en omrendering av komponenten, och de fält som har fel kommer att visa sina respektive felmeddelanden under sig, samt få en röd border (genom className={errors.username && touched.username ? 'error' : ''} på input-fälten).
		return Object.keys(newErrors).length === 0 //kollar om newErrors är ett tomt objekt = inga fel = formuläret är OK!
	}

	const handleSubmitLogin = async () => {
		// Markera alla fält som touched vid submit
        setTouched({username: true, password: true}) // När användaren försöker logga in, sätter vi alla fält som "touched" så att eventuella valideringsfel visas direkt. Detta är viktigt eftersom vi inte vill att användaren ska försöka logga in utan att se varför det inte fungerar (t.ex. om de glömde fylla i ett fält eller om lösenordet är för kort). Genom att markera alla fält som touched, kommer ValidateForm att visa alla relevanta felmeddelanden under respektive fält, vilket ger användaren tydlig feedback om vad som behöver åtgärdas innan de kan logga in.
		
		if (!ValidateForm()) {
			return
		}

		setErrors({}) // Rensa tidigare fel innan nätverksanropet(objekt)

		try {
			const response = await fetch('/api/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(formData) // Skicka hela formData, inklusive inviteCode och role, även om de inte används i login-endpointen. Detta gör att vi kan använda samma formData både för login och register, och servern kommer helt enkelt ignorera de fält som inte behövs för login. 
			})

			if (!response.ok) {
				console.log(`Server error: ${response.status}`)
				return
			}

			const data = await response.json()
			const validate = RegisterResponseSchema.safeParse(data)
			if (!validate.success) {
				console.log('Server returned an unexpected response')
				return
			}

			if (data.success) {
				const jwt: string | undefined = data.token
				if (!jwt) {
					console.log('Server did not return a token')
					return
				}
				localStorage.setItem(LS_KEY, jwt)
				// Servern returnerar användarnamn i login-svaret; spara det så headern kan visa det
				if (data.username) {
					localStorage.setItem('username', data.username)
					setUser({ username: data.username, color: data.color })
				}
				// Navigera till personlig profil efter lyckad login
				navigate('/my-profile')
			} else {
				console.log('Login failed')
			}
		} catch (err) {
			console.log('Network or server error')
		}
	}
	
	const handleSubmitRegister = async () => {
		// Markera alla fält som touched vid submit
        setTouched({username: true, password: true})

		if (!ValidateForm()) {
			return
		}

		// Rensa tidigare fel innan nätverksanropet
		setErrors({})
		
		try {
// Förbered registrering - skicka inviteCode (backend auto-detekterar typ)
		const registrationData = {
			username: formData.username,
			password: formData.password,
			...(formData.inviteCode && { inviteCode: formData.inviteCode })
			};

			const response = await fetch('/api/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(registrationData)
			})

			if (!response.ok) {
				console.log(`Server error: ${response.status}`)
				return
			}

			const data = await response.json()


			if (data.success) {
				console.log('Registrering lyckades!')
				const jwt: string | undefined = data.token
				if (!jwt) {
					console.log('Server did not return a token')
					return
				}
				localStorage.setItem(LS_KEY, jwt)
				// Spara username från servern om det returneras
				if (data.username) {
					localStorage.setItem('username', data.username)
					setUser({ username: data.username, color: data.color })
				}
				
				// Visa invite-kod modal om användaren skapade en ny familj
				if (data.inviteCode) {
					// inviteCode skickas av backend endast när registreringen skapade en ny familj
					setInviteCode(data.inviteCode)
					setRegisterStep('accountCreated')
				} else {
					// Om ingen invite-kod (gick med i befintlig familj), navigera direkt
					navigate('/my-profile')
				}
			} else {
				console.log('Registration failed')
			}
		} catch (err) {
			console.log('Network or server error')
		}
	}
	
	return (
		<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
		{registerStep !== 'none' && (
			<div className="modal-overlay" onClick={() => {
				setRegisterStep('none')
				navigate('/my-profile')
			}}>
				<div className="modal-content" onClick={(e) => e.stopPropagation()}>
					{registerStep === 'accountCreated' && (
						<>
							<h2>🎉 Ditt konto är skapat!</h2>
							<div className="modal-actions">
								<button 
									className="loginbutton" 
									onClick={() => {
										setRegisterStep('none')
										navigate('/my-profile')
									}}
								>
									Fortsätt till appen
								</button>
								<button 
									className="registerbutton" 
									onClick={() => {
										setRegisterStep('familySetup')
									}}
								>
									Skapa familj och bjud in barn
								</button>
							</div>
						</>
					)}

					{registerStep === 'familySetup' && (
						<>
							<h2>Skapa familj och lägg till barn</h2>
							<div className="modal-section">
								<p className="invite-label">Parent-invite</p>
								<div className="code-box">
									<code>{inviteCode || '--------'}</code>
									<button 
										className="copy-btn"
										onClick={() => copyToClipboard(inviteCode || '')}
										title="Kopiera"
									>
										{copiedCode === inviteCode ? '✓' : 'Kopiera'}
									</button>
								</div>
								<p className="invite-hint">Använd denna för andra föräldrar om du vill.</p>
							</div>
							<div className="divider" />
							<div className="modal-section">
								<h3>Lägg till barn</h3>
								<label className="modal-label">
									Barnets födelsedatum:
									<input
										type="date"
										value={birthDate}
										onChange={(event) => setBirthDate(event.target.value)}
										className="modal-input"
									/>
								</label>
								<button
									className="loginbutton"
									disabled={!birthDate}
									onClick={async () => {
										if (!birthDate) return;
										
										const authHeader = getAuthHeader();
										if (!authHeader) {
											console.error('No token found');
											return;
										}

										try {
											const response = await fetch('/api/family/child-invite', {
												method: 'POST',
												headers: {
													'Content-Type': 'application/json',
													Authorization: authHeader
												},
												body: JSON.stringify({
													birthDate: birthDate
												})
											});

											if (!response.ok) {
												console.error('Failed to create child invite');
												alert('Kunde inte skapa barn-invite');
												return;
											}

											const data = await response.json();
											if (data.childInviteCode) {
												setChildInvites([...childInvites, { code: data.childInviteCode, birthDate: birthDate }]);
												setBirthDate('');
											}
										} catch (error) {
											console.error('Error creating child invite:', error);
											alert('Fel vid skapande av barn-invite');
										}
									}}
								>
									Skapa invite-kod
								</button>
								{childInvites.length > 0 && (
									<div className="child-invites-list">
										<h4>Skapade barn-invites:</h4>
										{childInvites.map((invite, index) => (
											<div key={index} className="invite-item">
												<div className="code-box">
													<code>{invite.code}</code>
													<button 
														className="copy-btn"
														onClick={() => copyToClipboard(invite.code)}
														title="Kopiera"
													>
														{copiedCode === invite.code ? '✓' : 'Kopiera'}
													</button>
												</div>
												<small>Födelsedata: {new Date(invite.birthDate).toLocaleDateString('sv-SE')}</small>
												<button
													className="remove-btn"
													onClick={() => setChildInvites(childInvites.filter((_, i) => i !== index))}
												>
													Ta bort
												</button>
											</div>
										))}
									</div>
								)}
							</div>
							<div className="modal-actions">
								<button
									className="registerbutton"
									onClick={() => {
										setRegisterStep('none')
										navigate('/my-profile')
									}}
								>
									Fortsätt till appen
								</button>
							</div>
						</>
					)}
				</div>
			</div>
		)}
		<div className="login">
		<h2>Logga in / Registrera konto</h2>
		<form className='form' onSubmit={(e) => { e.preventDefault(); handleSubmitLogin(); }}> 
		<p className='mustHave'>* obligatoriskt fält</p>
		<div className="label-container">
		<label>
		Användarnamn: *
		<input type="text" name="username"
		value={formData.username}
		onChange={event => {
			setFormData({...formData, username: event.target.value})
			// Validera direkt om fältet redan är touched
		if (touched.username) {
			ValidateForm()
		}
		}}
		onBlur={() => {
			setTouched(prev => ({...prev, username: true}))
			ValidateForm()
		}}
		className={errors.username && touched.username ? 'error' : ''}
		/>
		<span className={`error-text ${!(errors.username && touched.username) ? 'hidden' : ''}`}>
			{errors.username}
		</span>
		</label>
		
		<label>
		Lösenord: *
		<input type="password" 
		name="password" 
		value={formData.password}
		onChange={event => {
			setFormData({...formData, password: event.target.value})
		    if (touched.password) {
				ValidateForm()
			}
		}}
		onBlur={() => {
			setTouched(prev => ({...prev, password: true}))
			ValidateForm()
		}}
		className={errors.password && touched.password ? 'error' : ''}
		/>
		<span className={`error-text ${!(errors.password && touched.password) ? 'hidden' : ''}`}>
			{errors.password}
		</span>
		</label>
		
		<label>
		Invite-kod (valfritt):
		<input type="text" 
		name="inviteCode" 
		placeholder="Ange kod om du vill gå med i en familj"
		value={formData.inviteCode || ''}
		onChange={event => {
			setFormData({...formData, inviteCode: event.target.value})
		}}
		/>
		<span className="error-text hidden"></span>
		</label>
		</div>
		<button className='loginbutton' type="submit">Logga in</button>
		<button className='registerbutton' type="button" onClick={handleSubmitRegister}>Registrera</button>
		</form>
		</div>
		</div>
	)
}
export default Login
