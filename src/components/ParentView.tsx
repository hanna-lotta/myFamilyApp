import { useEffect, useMemo, useState } from 'react';
import { getAuthHeader } from '../utils/auth';
import './ParentView.css';

type ParentOverview = {
	totalMinutes: number;
	questionCount: number;
	avgQuizScore: number | null;
	// topSubject: string | null; (borttagen)
	sessionsCount: number;
};

type DailyStat = {
	date: string;
	minutes: number;
	questionCount: number;
	avgQuizScore: number | null;
};

type SessionSummary = {
	childUserId: string;
	sessionId: string;
	title: string;
	startedAt: string;
	// subject: string; (borttagen)
	durationMinutes: number;
	questionCount: number;
	quizScore: number | null;
};

type SessionMessage = {
	role: 'user' | 'assistant';
	text: string;
};

type ParentOverviewResponse = {
	overview: ParentOverview;
	childUsername: string | null;
	dailyStats: DailyStat[];
	recentSessions: SessionSummary[];
};


const ParentView = () => {


	const toDateInputValue = (date: Date): string => date.toISOString().split('T')[0];
	const today = new Date();
	const lastWeek = new Date();
	lastWeek.setDate(today.getDate() - 6);

	const [fromDate, setFromDate] = useState<string>(toDateInputValue(lastWeek));
	const [toDate, setToDate] = useState<string>(toDateInputValue(today));
	const [overview, setOverview] = useState<ParentOverview | null>(null);
	const [childUsername, setChildUsername] = useState<string>('Barnet');
	const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
	const [sessions, setSessions] = useState<SessionSummary[]>([]);
	const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
	const [sessionMessages, setSessionMessages] = useState<SessionMessage[]>([]);
	const [sessionLoading, setSessionLoading] = useState(false);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const maxMinutes = useMemo(() => {
		return Math.max(1, ...dailyStats.map((day) => day.minutes));
	}, [dailyStats]);

	useEffect(() => {
		const fetchOverview = async () => {
			setLoading(true);
			setError(null);
			try {
				const authHeader = getAuthHeader();
				const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
				const response = await fetch(`/api/parent/overview?from=${fromDate}&to=${toDate}`, { headers });

				if (!response.ok) {
					throw new Error('Failed to load parent overview');
				}

				const data: ParentOverviewResponse = await response.json();
				setOverview(data.overview);
				setChildUsername(data.childUsername || 'Barnet');
				setDailyStats(data.dailyStats || []);
				setSessions(data.recentSessions || []);
			} catch (err) {
				setError('Kunde inte hämta live-data.');
			} finally {
				setLoading(false);
			}
		};
		fetchOverview();
	}, [fromDate, toDate]);

	const handleOpenSession = async (session: SessionSummary) => {
		setSelectedSession(session);
		setSessionError(null);
		setSessionLoading(true);



		try {
			const authHeader = getAuthHeader();
			const headers: HeadersInit = authHeader ? { Authorization: authHeader } : {};
			const response = await fetch(
				`/api/chat/messages/parent?childUserId=${session.childUserId}&sessionId=${session.sessionId}`,
				{ headers }
			);

			if (!response.ok) {
				throw new Error('Kunde inte hämta sessionen');
			}

			const data = await response.json();
			setSessionMessages(Array.isArray(data.items) ? data.items : []);
		} catch (err) {
			setSessionError('Kunde inte hämta hela sessionen. Försök igen.');
			setSessionMessages([]);
		} finally {
			setSessionLoading(false);
		}
	};

	return (
		<>
			<div className="parent-view">
			<div className="parent-header">
				<div>
					<h2>Föräldraöversikt</h2>
					<p className="parent-subtitle">Sammanfattning av {childUsername}s chatthistorik och studiestatistik.</p>
				</div>
				{/* {usingMock && <span className="badge">Demo</span>} */}
			</div>

			<div className="filters">
				<label>
					Från
					<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
				</label>
				<label>
					Till
					<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
				</label>
				{loading && <span className="status">Laddar...</span>}
				{error && <span className="status error">{error}</span>}
			</div>

			<div className="summary-grid">
				<div className="summary-card">
					<h3>Studietid</h3>
					<p>{overview?.totalMinutes ?? 0} min</p>
					<span>Totalt under perioden</span>
				</div>
				<div className="summary-card">
					<h3>Frågor</h3>
					<p>{overview?.questionCount ?? 0}</p>
					<span>Antal ställda frågor</span>
				</div>
				<div className="summary-card">
					<h3>Quiz</h3>
					<p>{overview?.avgQuizScore ?? '-'}%</p>
					<span>Genomsnittlig poäng</span>
				</div>
				
			</div>

			<div className="panel">
				<h3>Studietid per dag</h3>
				<div className="daily-stats">
					{dailyStats.map((day) => (
						<div key={day.date} className="daily-row">
							<span className="daily-date">{day.date}</span>
							<div className="daily-bar">
								<div
									className="daily-fill"
									style={{ width: `${Math.round((day.minutes / maxMinutes) * 100)}%` }}
								/>
							</div>
							<span className="daily-meta">{day.minutes} min • {day.questionCount} frågor</span>
						</div>
					))}
				</div>
			</div>

			<div className="panel">
				<h3>Senaste sessioner för {childUsername}</h3>
				<div className="session-table">
					<div className="session-row session-header">
						<span>Rubrik</span>
						<span>Datum</span>
						{/* Ämne borttagen */}
						<span>Tid</span>
						<span>Frågor</span>
						<span>Quiz</span>
					</div>
					{sessions.map((session) => (
						<div key={session.sessionId} className="session-row">
							<span>
								<button
									type="button"
									className="session-title-btn"
									onClick={() => handleOpenSession(session)}
								>
									{session.title || 'Konversation'}
								</button>
							</span>
							<span>{new Date(session.startedAt).toLocaleDateString('sv-SE')}</span>
							{/* session.subject borttagen */}
							<span>{session.durationMinutes} min</span>
							<span>{session.questionCount}</span>
							<span>{session.quizScore ?? '—'}%</span>
						</div>
					))}
				</div>

				{selectedSession && (
					<div className="session-detail">
						<div className="session-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
							<div>
								<h4 style={{ margin: 0 }}>{selectedSession.title || 'Konversation'}</h4>
								<span>{new Date(selectedSession.startedAt).toLocaleString('sv-SE')}</span>
							</div>
							<button
								type="button"
								className="close-session-btn"
								onClick={() => setSelectedSession(null)}
							>
								Stäng session
							</button>
						</div>
						{sessionLoading && <p className="session-detail-status">Laddar hela sessionen...</p>}
						{sessionError && <p className="session-detail-status error">{sessionError}</p>}
						{!sessionLoading && !sessionError && (
							<div className="session-detail-messages">
								{sessionMessages.map((message, index) => (
									<div
										key={`${selectedSession.sessionId}-${index}`}
										className={`session-detail-message ${message.role === 'user' ? 'user' : 'assistant'}`}
									>
										<span className="session-detail-role">{message.role === 'user' ? childUsername : 'AI'}</span>
										<p>{message.text}</p>
									</div>
								))}
								{sessionMessages.length === 0 && (
									<p className="session-detail-status">Inga meddelanden hittades i sessionen.</p>
								)}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
		</>
	);
};

export default ParentView;
