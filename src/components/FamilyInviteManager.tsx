import { useEffect, useState } from 'react';
import { getAuthHeader } from '../utils/auth';
import './FamilyInviteManager.css';

interface InviteCodeData {
	inviteCode: string;
	familyName: string;
}

interface ChildInviteData {
	childInviteCode: string;
}

const FamilyInviteManager = () => {
	const [adultInviteCode, setAdultInviteCode] = useState<string | null>(null);
	const [childBirthDate, setChildBirthDate] = useState('');
	const [childInviteCode, setChildInviteCode] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [showChildForm, setShowChildForm] = useState(false);

	const authHeader = getAuthHeader();

	// Hämta vuxen-invite-kod vid page load
	useEffect(() => {
		const fetchAdultInviteCode = async () => {
			if (!authHeader) return;

			try {
				const response = await fetch('/api/family/invite-code', {
					headers: { 'Authorization': authHeader }
				});

				if (response.ok) {
					const data: InviteCodeData = await response.json();
					setAdultInviteCode(data.inviteCode);
				} else {
					setError('Kunde inte hämta invite-kod');
				}
			} catch (err) {
				setError('Något gick fel när invite-koden hämtades');
				console.error(err);
			}
		};

		fetchAdultInviteCode();
	}, [authHeader]);

	const handleCreateChildInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!authHeader) return;

		setLoading(true);
		setError(null);
		setSuccess(null);

		try {
			const response = await fetch('/api/family/child-invite', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': authHeader
				},
				body: JSON.stringify({ birthDate: childBirthDate })
			});

			if (response.ok) {
				const data: ChildInviteData = await response.json();
				setChildInviteCode(data.childInviteCode);
				setSuccess('Barn-inbjudan skapad!');
				setChildBirthDate('');
			} else {
				setError('Kunde inte skapa barn-inbjudan');
			}
		} catch (err) {
			setError('Något gick fel');
			console.error(err);
		} finally {
			setLoading(false);
		}
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setSuccess('Kopierad till urklipp!');
		setTimeout(() => setSuccess(null), 2000);
	};

	return (
		<div className="family-invite-manager">
			<h2>Hantera familj & inbjudningar</h2>

			{error && <div className="error-message">{error}</div>}
			{success && <div className="success-message">{success}</div>}

			{/* Vuxen-invite-sektion */}
			<div className="invite-section">
				<h3>Bjud in vuxen</h3>
				{adultInviteCode ? (
					<div className="code-display">
						<p>Dela denna kod med vuxna som vill gå med i familjen:</p>
						<div className="code-box">
							<code>{adultInviteCode}</code>
							<button onClick={() => copyToClipboard(adultInviteCode)} className="copy-btn">
								Kopiera
							</button>
						</div>
					</div>
				) : (
					<p>Hämtar invite-kod...</p>
				)}
			</div>

			{/* Barn-invite-sektion */}
			<div className="invite-section">
				<h3>Bjud in barn</h3>
				<button 
					onClick={() => setShowChildForm(!showChildForm)}
					className="toggle-btn"
				>
					{showChildForm ? 'Avbryt' : 'Skapa barn-inbjudan'}
				</button>

				{showChildForm && (
					<form onSubmit={handleCreateChildInvite} className="child-form">
						<label htmlFor="birthDate">Barnets födelsedag (YYYY-MM-DD):</label>
						<input
							id="birthDate"
							type="date"
							value={childBirthDate}
							onChange={(e) => setChildBirthDate(e.target.value.replace(/-/g, '-'))}
							required
						/>
						<button type="submit" disabled={loading}>
							{loading ? 'Skapar...' : 'Skapa inbjudan'}
						</button>
					</form>
				)}

				{childInviteCode && (
					<div className="code-display">
						<p>Barn-inbjudningskod skapad:</p>
						<div className="code-box">
							<code>{childInviteCode}</code>
							<button onClick={() => copyToClipboard(childInviteCode)} className="copy-btn">
								Kopiera
							</button>
						</div>
						<p className="info-text">
							Barnet använder denna kod vid registrering tillsammans med sitt eget användarnamn och lösenord.
						</p>
					</div>
				)}
			</div>
		</div>
	);
};

export default FamilyInviteManager;
